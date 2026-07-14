// Shared client for simple (no tool-calling) AI chat completions — used by
// DocumentView's and DocumentReview's contextual writing assistant. The main
// Assistant IA (AIChat.tsx) has its own richer client because it needs the
// tool-calling loop; this one is just system prompt + message history in,
// text out, all via the same /api/ai-chat backend (see ai-chat.ts).

import { supabase } from './supabaseClient';
import { isDemoSession } from './authStore';
import { getStudioId } from './studioStore';

export type AiChatErrorCode = 'demo' | 'plan_gated' | 'quota_exceeded' | 'error';

export class AiChatError extends Error {
  code: AiChatErrorCode;
  usage?: { used: number; limit: number };
  constructor(code: AiChatErrorCode, usage?: { used: number; limit: number }) {
    super(code);
    this.code = code;
    this.usage = usage;
  }
}

export interface AiChatResult {
  content: string;
  usage?: { used: number; limit: number };
}

export async function sendAiChat(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<AiChatResult> {
  if (isDemoSession()) throw new AiChatError('demo');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new AiChatError('error');

  const resp = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      tools: [],
      studioId: await getStudioId(),
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    if (resp.status === 403) throw new AiChatError('plan_gated');
    if (resp.status === 429) throw new AiChatError('quota_exceeded', { used: body.used, limit: body.limit });
    throw new AiChatError('error');
  }

  const data = await resp.json();
  return { content: data.message?.content ?? '', usage: data.usage };
}
