// Généré une fois via scripts/create-stripe-catalog.mjs — Price IDs Stripe,
// non sensibles (safe à committer), alignés sur PLANS/STORAGE_BLOCKS dans
// screens/Pricing.tsx. Régénérer et remplacer ce fichier si le catalogue
// Stripe est recréé (ex. passage au mode production).
export const STRIPE_PRICE_IDS = {
  studio: {
    monthly: 'price_REPLACE_ME',
    yearly: 'price_REPLACE_ME',
    seatMonthly: 'price_REPLACE_ME',
    seatYearly: 'price_REPLACE_ME',
  },
  agence: {
    monthly: 'price_REPLACE_ME',
    yearly: 'price_REPLACE_ME',
    seatMonthly: 'price_REPLACE_ME',
    seatYearly: 'price_REPLACE_ME',
  },
  storageMonthly: [
    'price_REPLACE_ME', // +50 Go
    'price_REPLACE_ME', // +200 Go
    'price_REPLACE_ME', // +500 Go
    'price_REPLACE_ME', // +1 To
    'price_REPLACE_ME', // +2 To
    'price_REPLACE_ME', // +4 To
  ],
  storageYearly: [
    'price_REPLACE_ME',
    'price_REPLACE_ME',
    'price_REPLACE_ME',
    'price_REPLACE_ME',
    'price_REPLACE_ME',
    'price_REPLACE_ME',
  ],
} as const;
