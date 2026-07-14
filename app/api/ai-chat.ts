// app/api/ai-chat.ts
//
// Backend for the Assistant IA (AIChat.tsx). Proxies to the Anthropic Messages
// API instead of a local Ollama install, so real (non-demo) users on a paid
// plan get a working assistant without installing anything. Gated by plan
// (Gratuit has no access) and by a monthly per-studio message quota to keep
// API cost bounded — see docs/superpowers/specs/2026-07-13-ai-usage-migration.sql
// for the quota table, which must be created manually in Supabase first.
//
// Requires the ANTHROPIC_API_KEY environment variable (Vercel project
// settings) — get a key at console.anthropic.com.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { AI_QUOTAS } from '../src/data/aiQuota.js';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

// Messages per calendar month, per studio. Each round trip in the client's
// tool-calling loop is a separate Anthropic API call and counts as one unit
// here — that tracks actual API cost more closely than counting only the
// user-visible turns.

interface OpenAIStyleTool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

interface ChatMessageIn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolUseId?: string;
  tool_calls?: { id: string; function: { name: string; arguments: unknown } }[];
}

interface ChatBody {
  messages: ChatMessageIn[];
  tools: OpenAIStyleTool[];
}

function toAnthropicTools(tools: OpenAIStyleTool[]) {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

function toAnthropicMessages(messages: ChatMessageIn[]) {
  const system = messages.find(m => m.role === 'system')?.content ?? '';
  const anthropicMessages: any[] = [];

  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'user') {
      anthropicMessages.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const content: any[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls ?? []) {
        const input = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments || '{}')
          : (tc.function.arguments ?? {});
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      anthropicMessages.push({ role: 'assistant', content });
    } else if (m.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.toolUseId, content: m.content }],
      });
    }
  }

  return { system, anthropicMessages };
}

function fromAnthropicResponse(data: any) {
  let content = '';
  const tool_calls: { id: string; function: { name: string; arguments: unknown } }[] = [];

  for (const block of data.content ?? []) {
    if (block.type === 'text') content += block.text;
    else if (block.type === 'tool_use') {
      tool_calls.push({ id: block.id, function: { name: block.name, arguments: block.input } });
    }
  }

  return {
    role: 'assistant' as const,
    content,
    ...(tool_calls.length ? { tool_calls } : {}),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { messages, tools, studioId } = req.body as ChatBody & { studioId?: string };
  if (!Array.isArray(messages) || !Array.isArray(tools) || !studioId) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'not_a_member' });
    return;
  }

  const { data: studio, error: studioError } = await supabaseAdmin
    .from('studios')
    .select('plan')
    .eq('id', studioId)
    .single();

  if (studioError || !studio) {
    res.status(500).json({ error: 'Failed to resolve studio plan' });
    return;
  }

  const limit = AI_QUOTAS[studio.plan];
  if (!limit) {
    // Gratuit (or any unrecognized plan) has no AI access — mirrors
    // canUseFeature(plan, 'ai') client-side, enforced again here since real
    // API cost is at stake.
    res.status(403).json({ error: 'plan_gated' });
    return;
  }

  const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM', UTC

  const { data: usage } = await supabaseAdmin
    .from('ai_usage')
    .select('message_count')
    .eq('studio_id', studioId)
    .eq('month', month)
    .maybeSingle();

  const used = usage?.message_count ?? 0;
  if (used >= limit) {
    res.status(429).json({ error: 'quota_exceeded', used, limit });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'AI backend not configured' });
    return;
  }

  const { system, anthropicMessages } = toAnthropicMessages(messages);

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: anthropicMessages,
        tools: toAnthropicTools(tools),
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errBody);
      res.status(502).json({ error: 'AI backend error' });
      return;
    }

    const data = await anthropicRes.json();
    const message = fromAnthropicResponse(data);

    await supabaseAdmin
      .from('ai_usage')
      .upsert(
        { studio_id: studioId, month, message_count: used + 1, updated_at: new Date().toISOString() },
        { onConflict: 'studio_id,month' }
      );

    res.status(200).json({ message, usage: { used: used + 1, limit } });
  } catch (error) {
    console.error('Failed to call Anthropic API:', error);
    res.status(500).json({ error: 'AI backend error' });
  }
}
