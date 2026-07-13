// app/api/admin-set-plan.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'alexismorel11@hotmail.ca';

interface SetPlanBody {
  studioId: string;
  plan: 'gratuit' | 'studio' | 'agence';
  note?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, plan, note } = req.body as SetPlanBody;
  if (!studioId || (plan !== 'gratuit' && plan !== 'studio' && plan !== 'agence')) {
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

  if (user.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('studios')
    .update({ plan, manual_grant_note: note ?? null })
    .eq('id', studioId);

  if (error) {
    console.error('Failed to set studio plan:', error);
    res.status(500).json({ error: 'Failed to set studio plan' });
    return;
  }

  res.status(200).json({ ok: true });
}
