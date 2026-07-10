import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { STRIPE_PRICE_IDS } from '../src/data/stripePriceIds';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CheckoutBody {
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

  const { studioId, plan, billingCycle, seats, storageTier } = req.body as CheckoutBody;
  if (!studioId || (plan !== 'studio' && plan !== 'agence')) {
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

  const origin = req.headers.origin || 'https://rush.app';

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
}
