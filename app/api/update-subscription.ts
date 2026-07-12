import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { STRIPE_PRICE_IDS } from '../src/data/stripePriceIds.js';
import { classifyPriceId } from './_lib/stripePriceHelpers.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface UpdateBody {
  studioId: string;
  plan: 'studio' | 'agence';
  billingCycle: 'monthly' | 'yearly';
  seats: number;
  storageTier: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, plan, billingCycle, seats, storageTier } = req.body as UpdateBody;
  if (!studioId || (plan !== 'studio' && plan !== 'agence')) {
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
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const { data: studio, error: studioError } = await supabaseAdmin
    .from('studios')
    .select('stripe_subscription_id')
    .eq('id', studioId)
    .single();

  if (studioError || !studio?.stripe_subscription_id) {
    res.status(400).json({ error: 'No active subscription for this studio' });
    return;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(studio.stripe_subscription_id);

    const planPrices = STRIPE_PRICE_IDS[plan];
    const basePriceId = billingCycle === 'monthly' ? planPrices.monthly : planPrices.yearly;
    const seatPriceId = billingCycle === 'monthly' ? planPrices.seatMonthly : planPrices.seatYearly;
    const storagePrices = billingCycle === 'monthly' ? STRIPE_PRICE_IDS.storageMonthly : STRIPE_PRICE_IDS.storageYearly;
    const extraSeats = Math.max(0, seats - 2);

    let baseItemId: string | undefined;
    let seatItemId: string | undefined;
    let storageItemId: string | undefined;

    for (const item of subscription.items.data) {
      const kind = classifyPriceId(item.price.id);
      if (kind === 'base') baseItemId = item.id;
      else if (kind === 'seat') seatItemId = item.id;
      else if (kind === 'storage') storageItemId = item.id;
    }

    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      baseItemId ? { id: baseItemId, price: basePriceId, quantity: 1 } : { price: basePriceId, quantity: 1 },
    ];

    if (extraSeats > 0) {
      items.push(seatItemId
        ? { id: seatItemId, price: seatPriceId, quantity: extraSeats }
        : { price: seatPriceId, quantity: extraSeats });
    } else if (seatItemId) {
      items.push({ id: seatItemId, deleted: true });
    }

    if (storageTier > 0) {
      const storagePriceId = storagePrices[storageTier - 1];
      items.push(storageItemId
        ? { id: storageItemId, price: storagePriceId, quantity: 1 }
        : { price: storagePriceId, quantity: 1 });
    } else if (storageItemId) {
      items.push({ id: storageItemId, deleted: true });
    }

    await stripe.subscriptions.update(subscription.id, {
      items,
      proration_behavior: 'create_prorations',
      metadata: { studioId },
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to update Stripe subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
}
