import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { STRIPE_PRICE_IDS } from '../src/data/stripePriceIds';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function planFromPriceId(priceId: string): 'studio' | 'agence' | null {
  if (priceId === STRIPE_PRICE_IDS.studio.monthly || priceId === STRIPE_PRICE_IDS.studio.yearly) return 'studio';
  if (priceId === STRIPE_PRICE_IDS.agence.monthly || priceId === STRIPE_PRICE_IDS.agence.yearly) return 'agence';
  return null;
}

function storageTierFromPriceId(priceId: string): number {
  const monthlyIdx = (STRIPE_PRICE_IDS.storageMonthly as readonly string[]).indexOf(priceId);
  if (monthlyIdx !== -1) return monthlyIdx + 1;
  const yearlyIdx = (STRIPE_PRICE_IDS.storageYearly as readonly string[]).indexOf(priceId);
  if (yearlyIdx !== -1) return yearlyIdx + 1;
  return 0;
}

async function syncSubscriptionToStudio(subscription: Stripe.Subscription): Promise<boolean> {
  const studioId = subscription.metadata.studioId;
  if (!studioId) {
    console.error('Stripe subscription missing studioId metadata', subscription.id);
    return false;
  }

  let plan: 'studio' | 'agence' | 'gratuit' = 'gratuit';
  let seats = 2;
  let storageTier = 0;

  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    const detectedPlan = planFromPriceId(priceId);
    if (detectedPlan) {
      plan = detectedPlan;
    } else if (priceId === STRIPE_PRICE_IDS.studio.seatMonthly || priceId === STRIPE_PRICE_IDS.studio.seatYearly
      || priceId === STRIPE_PRICE_IDS.agence.seatMonthly || priceId === STRIPE_PRICE_IDS.agence.seatYearly) {
      seats = 2 + item.quantity!;
    } else {
      const tier = storageTierFromPriceId(priceId);
      if (tier > 0) storageTier = tier;
    }
  }

  const status = subscription.status;

  const { error } = await supabaseAdmin
    .from('studios')
    .update({
      plan,
      billing_seats: seats,
      billing_storage_tier: storageTier,
      stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      subscription_status: status,
    })
    .eq('id', studioId);

  if (error) {
    console.error('Failed to sync subscription to studio', studioId, error);
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'] as string;
  const rawBody = await readRawBody(req);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${(err as Error).message}` });
    return;
  }

  let success = true;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === 'string') {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        success = await syncSubscriptionToStudio(subscription);
      }
      break;
    }
    case 'customer.subscription.updated': {
      success = await syncSubscriptionToStudio(event.data.object as Stripe.Subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const studioId = subscription.metadata.studioId;
      if (studioId) {
        const { error } = await supabaseAdmin
          .from('studios')
          .update({
            plan: 'gratuit',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            billing_seats: 2,
            billing_storage_tier: 0,
          })
          .eq('id', studioId);
        if (error) {
          console.error('Failed to clear cancelled subscription', studioId, error);
          success = false;
        }
      } else {
        console.error('Stripe subscription.deleted missing studioId metadata', subscription.id);
        success = false;
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      // Stripe API versions >= 2025-xx-xx moved the subscription reference off
      // Invoice.subscription onto Invoice.parent.subscription_details.subscription.
      const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof invoiceSubscription === 'string'
        ? invoiceSubscription
        : invoiceSubscription?.id;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        success = await syncSubscriptionToStudio(subscription);
      }
      break;
    }
  }

  if (!success) {
    res.status(500).json({ error: 'Failed to sync subscription' });
    return;
  }

  res.status(200).json({ received: true });
}
