// app/api/create-portal-session.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface PortalBody {
  studioId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId } = req.body as PortalBody;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  // Auth check: the caller must be an authenticated member of studioId.
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
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const { data: studio, error: studioError } = await supabaseAdmin
    .from('studios')
    .select('stripe_customer_id')
    .eq('id', studioId)
    .single();

  if (studioError || !studio?.stripe_customer_id) {
    res.status(400).json({ error: 'No Stripe customer for this studio' });
    return;
  }

  const origin = req.headers.origin || 'https://rush.app';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: studio.stripe_customer_id,
      return_url: `${origin}/parametres?section=plan`,
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Failed to create Stripe billing portal session:', error);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
}
