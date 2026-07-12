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
    'price_1Trgx8Q5BFcpxEvj4qHrwHbC', // +50 Go (inchangé)
    'price_1TsTe1Q5BFcpxEvjVzkZHN9A', // +200 Go (révisé)
    'price_1Trgx9Q5BFcpxEvjfY4C53Tp', // +500 Go (inchangé)
    'price_1TsTe1Q5BFcpxEvjPFpZC877', // +1 To (révisé)
    'price_1TsTe2Q5BFcpxEvjEEfJimV3', // +2 To (révisé)
    'price_1TsTe2Q5BFcpxEvjigwwJZs7', // +4 To (révisé)
  ],
  storageYearly: [
    'price_1Trgx9Q5BFcpxEvj4mBF5kta', // +50 Go (inchangé)
    'price_1TsTe2Q5BFcpxEvjDgTdHZ6G', // +200 Go (révisé)
    'price_1TrgxAQ5BFcpxEvjG8QETEkn', // +500 Go (inchangé)
    'price_1TsTe2Q5BFcpxEvj1XJhvVMd', // +1 To (révisé)
    'price_1TsTe2Q5BFcpxEvjgMnjkW5y', // +2 To (révisé)
    'price_1TsTe3Q5BFcpxEvj0rONCfIo', // +4 To (révisé)
  ],
} as const;
