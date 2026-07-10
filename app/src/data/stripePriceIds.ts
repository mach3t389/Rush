// Généré une fois via scripts/create-stripe-catalog.mjs — Price IDs Stripe,
// non sensibles (safe à committer), alignés sur PLANS/STORAGE_BLOCKS dans
// screens/Pricing.tsx. Régénérer et remplacer ce fichier si le catalogue
// Stripe est recréé (ex. passage au mode production).
export const STRIPE_PRICE_IDS = {
  studio: {
    monthly: 'price_1Trgx7Q5BFcpxEvjANCq4wCE',
    yearly: 'price_1Trgx7Q5BFcpxEvjwLIHN3cT',
    seatMonthly: 'price_1Trgx7Q5BFcpxEvjRldYHAjT',
    seatYearly: 'price_1Trgx7Q5BFcpxEvjfvHiwFPn',
  },
  agence: {
    monthly: 'price_1Trgx8Q5BFcpxEvj2NWgKtSt',
    yearly: 'price_1Trgx8Q5BFcpxEvjg601coH9',
    seatMonthly: 'price_1Trgx8Q5BFcpxEvj7ApLd4e0',
    seatYearly: 'price_1Trgx8Q5BFcpxEvjAVtDEGvh',
  },
  storageMonthly: [
    'price_1Trgx8Q5BFcpxEvj4qHrwHbC', // +50 Go
    'price_1Trgx8Q5BFcpxEvjNScXoH97', // +200 Go
    'price_1Trgx9Q5BFcpxEvjfY4C53Tp', // +500 Go
    'price_1Trgx9Q5BFcpxEvjTkFTB0fP', // +1 To
    'price_1Trgx9Q5BFcpxEvjmay3qa0F', // +2 To
    'price_1Trgx9Q5BFcpxEvjxUK3Myyd', // +4 To
  ],
  storageYearly: [
    'price_1Trgx9Q5BFcpxEvj4mBF5kta',
    'price_1TrgxAQ5BFcpxEvjCisvP4jG',
    'price_1TrgxAQ5BFcpxEvjG8QETEkn',
    'price_1TrgxAQ5BFcpxEvjgytbWl1A',
    'price_1TrgxAQ5BFcpxEvjUzzkxz9a',
    'price_1TrgxAQ5BFcpxEvj8btad8Il',
  ],
} as const;
