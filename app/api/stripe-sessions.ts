// app/api/stripe-sessions.ts
// Merged create-checkout-session.ts + create-portal-session.ts into one
// function to stay under Vercel Hobby's 12-serverless-function cap — both
// were near-identical (verify caller's studio membership, then call Stripe),
// differing only by which Stripe API they call.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { STRIPE_PRICE_IDS } from '../src/data/stripePriceIds.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CheckoutBody {
  action: 'checkout';
  studioId: string;
  plan: 'studio' | 'agence';
  billingCycle: 'monthly' | 'yearly';
  seats: number;
  storageTier: number;
}

interface PortalBody {
  action: 'portal';
  studioId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body as CheckoutBody | PortalBody;
  if (body.action !== 'checkout' && body.action !== 'portal') {
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

  const { studioId } = body;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request body' });
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

  const origin = req.headers.origin || 'https://rushflow.app';

  if (body.action === 'portal') {
    const { data: studio, error: studioError } = await supabaseAdmin
      .from('studios')
      .select('stripe_customer_id')
      .eq('id', studioId)
      .single();

    if (studioError || !studio?.stripe_customer_id) {
      res.status(400).json({ error: 'No Stripe customer for this studio' });
      return;
    }

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
    return;
  }

  // action === 'checkout'
  const { plan, billingCycle, seats, storageTier } = body;
  if (plan !== 'studio' && plan !== 'agence') {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const planPrices = STRIPE_PRICE_IDS[plan];
  const basePriceId = billingCycle === 'monthly' ? planPrices.monthly : planPrices.yearly;
  const seatPriceId = billingCycle === 'monthly' ? planPrices.seatMonthly : planPrices.seatYearly;
  const storagePrices = billingCycle === 'monthly' ? STRIPE_PRICE_IDS.storageMonthly : STRIPE_PRICE_IDS.storageYearly;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: basePriceId, quantity: 1 },
  ];

  const extraSeats = Math.max(0, seats - 2);
  if (extraSeats > 0) {
    lineItems.push({ price: seatPriceId, quantity: extraSeats });
  }

  if (storageTier > 0) {
    lineItems.push({ price: storagePrices[storageTier - 1], quantity: 1 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      allow_promotion_codes: true,
      success_url: `${origin}/parametres?checkout=success`,
      cancel_url: `${origin}/parametres?checkout=cancelled`,
      metadata: { studioId },
      subscription_data: { metadata: { studioId } },
    });
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Failed to create Stripe checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
