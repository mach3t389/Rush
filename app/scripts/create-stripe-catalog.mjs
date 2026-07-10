// app/scripts/create-stripe-catalog.mjs
// One-shot script: creates the 5 Products and 18 Prices for Rush's billing
// catalog in Stripe. Run once per Stripe mode (test, then live).
// Usage: STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-catalog.mjs

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
  const studioProduct = await stripe.products.create({ name: 'Rush — Studio' });
  const agenceProduct = await stripe.products.create({ name: 'Rush — Agence' });
  const studioSeatProduct = await stripe.products.create({ name: 'Rush — Siège additionnel (Studio)' });
  const agenceSeatProduct = await stripe.products.create({ name: 'Rush — Siège additionnel (Agence)' });
  const storageProduct = await stripe.products.create({ name: 'Rush — Stockage additionnel' });

  const result = {
    studio: {
      monthly: await priceFor(studioProduct.id, 1900, 'month'),
      yearly: await priceFor(studioProduct.id, 18200, 'year'),
      seatMonthly: await priceFor(studioSeatProduct.id, 300, 'month'),
      seatYearly: await priceFor(studioSeatProduct.id, 2900, 'year'),
    },
    agence: {
      monthly: await priceFor(agenceProduct.id, 4900, 'month'),
      yearly: await priceFor(agenceProduct.id, 47000, 'year'),
      seatMonthly: await priceFor(agenceSeatProduct.id, 200, 'month'),
      seatYearly: await priceFor(agenceSeatProduct.id, 1900, 'year'),
    },
    // Index 0 (5 Go / 50 Go inclus, pas d'ajout) n'a pas de Price — la ligne
    // stockage est simplement absente de l'abonnement dans ce cas.
    storageMonthly: [
      await priceFor(storageProduct.id, 200, 'month'),   // index 1: +50 Go
      await priceFor(storageProduct.id, 600, 'month'),   // index 2: +200 Go
      await priceFor(storageProduct.id, 1500, 'month'),  // index 3: +500 Go
      await priceFor(storageProduct.id, 3000, 'month'),  // index 4: +1 To
      await priceFor(storageProduct.id, 6000, 'month'),  // index 5: +2 To
      await priceFor(storageProduct.id, 12000, 'month'), // index 6: +4 To
    ],
    storageYearly: [
      await priceFor(storageProduct.id, 1900, 'year'),
      await priceFor(storageProduct.id, 5800, 'year'),
      await priceFor(storageProduct.id, 14400, 'year'),
      await priceFor(storageProduct.id, 28800, 'year'),
      await priceFor(storageProduct.id, 57600, 'year'),
      await priceFor(storageProduct.id, 115200, 'year'),
    ],
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
