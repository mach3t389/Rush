// Généré via scripts/create-stripe-catalog.mjs — Price IDs Stripe,
// non sensibles (safe à committer), alignés sur PLANS/STORAGE_BLOCKS dans
// screens/Pricing.tsx. Régénérer et remplacer ce fichier si le catalogue
// Stripe est recréé (ex. passage au mode production).
export const STRIPE_PRICE_IDS = {
  "studio": {
    "monthly": "price_1U0mMPQ5BFcpxEvjtFvBXnAE",
    "yearly": "price_1U0mMPQ5BFcpxEvjfJ7p0VIh",
    "seatMonthly": "price_1U0mMQQ5BFcpxEvjIswUAKky",
    "seatYearly": "price_1U0mMQQ5BFcpxEvjCG1mi8FG"
  },
  "agence": {
    "monthly": "price_1U0mMQQ5BFcpxEvjig3pFD5u",
    "yearly": "price_1U0mMQQ5BFcpxEvjYWhso1ta",
    "seatMonthly": "price_1U0mMQQ5BFcpxEvjbo9FkjIa",
    "seatYearly": "price_1U0mMQQ5BFcpxEvj6xOqF2AP"
  },
  "storageMonthly": [
    "price_1U0mMRQ5BFcpxEvj8gxAmgE3",
    "price_1U0mMRQ5BFcpxEvj91CcdqUN",
    "price_1U0mMRQ5BFcpxEvjfWE4Xe3K",
    "price_1U0mMRQ5BFcpxEvjXe9PIjyg",
    "price_1U0mMRQ5BFcpxEvjY7BmkNMp",
    "price_1U0mMSQ5BFcpxEvjHDfdh5e2"
  ],
  "storageYearly": [
    "price_1U0mMSQ5BFcpxEvjitJHpc7y",
    "price_1U0mMSQ5BFcpxEvjwgm1rLu2",
    "price_1U0mMSQ5BFcpxEvjJ7zFad4B",
    "price_1U0mMSQ5BFcpxEvjmrHY2Pqa",
    "price_1U0mMTQ5BFcpxEvj0hwpRvjM",
    "price_1U0mMTQ5BFcpxEvj5gOewVdE"
  ]
} as const;
