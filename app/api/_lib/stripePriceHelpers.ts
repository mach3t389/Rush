import { STRIPE_PRICE_IDS } from '../../src/data/stripePriceIds.js';

export type PriceKind = 'base' | 'seat' | 'storage' | null;

export function classifyPriceId(priceId: string): PriceKind {
  if (
    priceId === STRIPE_PRICE_IDS.studio.monthly || priceId === STRIPE_PRICE_IDS.studio.yearly ||
    priceId === STRIPE_PRICE_IDS.agence.monthly || priceId === STRIPE_PRICE_IDS.agence.yearly
  ) return 'base';

  if (
    priceId === STRIPE_PRICE_IDS.studio.seatMonthly || priceId === STRIPE_PRICE_IDS.studio.seatYearly ||
    priceId === STRIPE_PRICE_IDS.agence.seatMonthly || priceId === STRIPE_PRICE_IDS.agence.seatYearly
  ) return 'seat';

  if (
    (STRIPE_PRICE_IDS.storageMonthly as readonly string[]).includes(priceId) ||
    (STRIPE_PRICE_IDS.storageYearly as readonly string[]).includes(priceId)
  ) return 'storage';

  return null;
}

export function planFromPriceId(priceId: string): 'studio' | 'agence' | null {
  if (priceId === STRIPE_PRICE_IDS.studio.monthly || priceId === STRIPE_PRICE_IDS.studio.yearly) return 'studio';
  if (priceId === STRIPE_PRICE_IDS.agence.monthly || priceId === STRIPE_PRICE_IDS.agence.yearly) return 'agence';
  return null;
}

export function storageTierFromPriceId(priceId: string): number {
  const monthlyIdx = (STRIPE_PRICE_IDS.storageMonthly as readonly string[]).indexOf(priceId);
  if (monthlyIdx !== -1) return monthlyIdx + 1;
  const yearlyIdx = (STRIPE_PRICE_IDS.storageYearly as readonly string[]).indexOf(priceId);
  if (yearlyIdx !== -1) return yearlyIdx + 1;
  return 0;
}
