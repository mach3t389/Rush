import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (req.body ?? {}) as { action?: string };
  if (body.action !== 'delete') {
    res.status(400).json({ error: 'Invalid action' });
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

  const { data: ownedMemberships, error: ownedError } = await supabaseAdmin
    .from('studio_members')
    .select('studio_id')
    .eq('user_id', user.id)
    .eq('is_owner', true);

  if (ownedError) {
    console.error('Failed to check owned studios:', ownedError);
    res.status(500).json({ error: 'Failed to check account' });
    return;
  }

  const blockedStudioIds: string[] = [];
  for (const { studio_id } of ownedMemberships ?? []) {
    const { count, error: countError } = await supabaseAdmin
      .from('studio_members')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studio_id)
      .neq('user_id', user.id);
    if (countError) {
      console.error('Failed to count studio members:', countError);
      res.status(500).json({ error: 'Failed to check account' });
      return;
    }
    if ((count ?? 0) > 0) blockedStudioIds.push(studio_id);
  }

  if (blockedStudioIds.length > 0) {
    res.status(409).json({ error: 'owner_must_transfer', studios: blockedStudioIds });
    return;
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('Failed to delete account:', deleteError);
    res.status(500).json({ error: 'Failed to delete account' });
    return;
  }

  res.status(200).json({ ok: true });
}
