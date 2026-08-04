// app/api/admin.ts
// Merged admin-search-studios.ts + admin-set-plan.ts into one function to
// stay under Vercel Hobby's 12-serverless-function cap — both were
// identical single-admin-email-gated handlers on the same hidden
// /admin/studios page, differing only by action.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'info@alexismorel.ca';
const PAGE_SIZE = 20;

interface SearchBody {
  action: 'search';
  query: string;
  page?: number;
}

interface SetPlanBody {
  action: 'set-plan';
  studioId: string;
  plan: 'gratuit' | 'studio' | 'agence';
  seats?: number;
  storageTier?: number;
  note?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body as SearchBody | SetPlanBody;
  if (body.action !== 'search' && body.action !== 'set-plan') {
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

  if (user.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  if (body.action === 'search') {
    const { query, page } = body;
    if (typeof query !== 'string') {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }
    const pageIndex = typeof page === 'number' && page >= 0 ? page : 0;
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabaseAdmin
      .from('studios')
      .select('id, name, plan, billing_seats, billing_storage_tier, manual_grant_note, stripe_subscription_id', { count: 'exact' })
      .ilike('name', `%${query}%`)
      .order('name')
      .range(from, to);

    if (error) {
      console.error('Failed to search studios:', error);
      res.status(500).json({ error: 'Failed to search studios' });
      return;
    }

    res.status(200).json({ studios: data ?? [], total: count ?? 0 });
    return;
  }

  // action === 'set-plan'
  const { studioId, plan, seats, storageTier, note } = body;
  if (!studioId || (plan !== 'gratuit' && plan !== 'studio' && plan !== 'agence')) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  if (seats !== undefined && (!Number.isInteger(seats) || seats < 1)) {
    res.status(400).json({ error: 'Invalid seats value' });
    return;
  }
  if (storageTier !== undefined && (!Number.isInteger(storageTier) || storageTier < 0 || storageTier > 6)) {
    res.status(400).json({ error: 'Invalid storageTier value' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('studios')
    .update({
      plan,
      manual_grant_note: note ?? null,
      ...(seats !== undefined ? { billing_seats: seats } : {}),
      ...(storageTier !== undefined ? { billing_storage_tier: storageTier } : {}),
    })
    .eq('id', studioId);

  if (error) {
    console.error('Failed to set studio plan:', error);
    res.status(500).json({ error: 'Failed to set studio plan' });
    return;
  }

  res.status(200).json({ ok: true });
}
