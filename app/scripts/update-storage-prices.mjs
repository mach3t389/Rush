// app/scripts/update-storage-prices.mjs
// One-shot script: Stripe Prices are immutable, so revised storage pricing
// needs new Price objects. Tiers 1 (+50 Go) and 3 (+500 Go) are unchanged and
// keep their existing price IDs — this only creates new prices for the tiers
// that changed (index 2, 4, 5, 6), under a fresh "Stockage additionnel"
// product so the Stripe dashboard stays readable.
// Usage: STRIPE_SECRET_KEY=sk_test_... node scripts/update-storage-prices.mjs

import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Set STRIPE_SECRET_KEY before running this script.');
  process.exit(1);
}
const stripe = new Stripe(key);

async function priceFor(productId, amountCents, interval) {
  const price = await stripe.prices.create({
    product: productId,
    currency: 'cad',
    unit_amount: amountCents,
    recurring: { interval },
  });
  return price.id;
}

async function main() {
  const storageProduct = await stripe.products.create({ name: 'Rush — Stockage additionnel (v2)' });

  const result = {
    // index 1 (+50 Go) inchangé — garde l'ID existant dans stripePriceIds.ts
    storageMonthlyIndex2: await priceFor(storageProduct.id, 700, 'month'),   // +200 Go
    // index 3 (+500 Go) inchangé — garde l'ID existant
    storageMonthlyIndex4: await priceFor(storageProduct.id, 2800, 'month'), // +1 To
    storageMonthlyIndex5: await priceFor(storageProduct.id, 5200, 'month'), // +2 To
    storageMonthlyIndex6: await priceFor(storageProduct.id, 9600, 'month'), // +4 To

    storageYearlyIndex2: await priceFor(storageProduct.id, 6700, 'year'),
    storageYearlyIndex4: await priceFor(storageProduct.id, 26900, 'year'),
    storageYearlyIndex5: await priceFor(storageProduct.id, 49900, 'year'),
    storageYearlyIndex6: await priceFor(storageProduct.id, 92200, 'year'),
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
