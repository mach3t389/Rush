# Facturation Stripe — chantier A : plomberie de base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter les colonnes d'abonnement à Supabase, créer le catalogue Stripe (paliers + sièges + stockage variables), et construire les deux fonctions serveur Vercel (session de paiement + webhook) qui font vivre la facturation réelle de Rush, avec le déclenchement du paiement depuis l'inscription et depuis Paramètres.

**Architecture:** Le frontend (`app/`, Vite + React) appelle deux fonctions serverless Vercel sous `app/api/` : `create-checkout-session` (crée une session de paiement Stripe) et `stripe-webhook` (reçoit les événements Stripe et écrit dans Supabase). Les colonnes de facturation sur `studios` ne sont jamais modifiées directement par le navigateur — seule la fonction webhook, avec la clé `service_role` Supabase (jamais dans `app/.env`, jamais commitée), peut les écrire ; les policies RLS/GRANT bloquent l'écriture de ces colonnes pour le rôle `authenticated`.

**Tech Stack:** `stripe` (npm, appelé côté serveur seulement), `@vercel/node` (types des fonctions serverless), `@supabase/supabase-js` (déjà présent), TypeScript, aucune nouvelle dépendance frontend.

## Global Constraints

- Ne jamais mettre la clé secrète Stripe (`sk_...`), le secret de signature du webhook (`whsec_...`), ni la clé `service_role` Supabase dans `app/.env`, dans le code commité, ou dans une variable préfixée `VITE_` (ces préfixes sont exposés au navigateur par Vite). Elles vivent uniquement comme variables d'environnement Vercel côté serveur.
- Les colonnes de facturation (`plan`, `billing_seats`, `billing_storage_tier`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`) sur `studios` ne sont écrites que par la fonction webhook (via `service_role`) — jamais par un appel `supabase.from('studios').update(...)` initié depuis le navigateur.
- Montants et Price IDs alignés exactement sur `PLANS`/`STORAGE_BLOCKS` dans `app/src/screens/Pricing.tsx` (Studio 19$/182$, Agence 49$/470$ ; sièges Studio +3$/29$, Agence +2$/19$ ; stockage +50Go 2$/19$, +200Go 6$/58$, +500Go 15$/144$, +1To 30$/288$, +2To 60$/576$, +4To 120$/1152$).
- Pas de suite de tests automatisés dans ce projet (confirmé dans `CLAUDE.md`) — vérification via `npx tsc --noEmit -p tsconfig.app.json`, `vercel dev` pour tester les fonctions localement, et le mode test de Stripe (`stripe listen` pour transférer les webhooks en local).
- Spec source : `docs/superpowers/specs/2026-07-10-stripe-billing-core-design.md`.

---

### Task 1: Migration Supabase (étape manuelle — exécutée par l'humain, pas par un subagent)

**Files:** aucun fichier de code — SQL à exécuter directement dans le tableau de bord Supabase.

- [ ] **Step 1: Ouvrir l'éditeur SQL Supabase**

Aller sur `https://supabase.com/dashboard/project/<project-ref>/sql/new` (remplacer `<project-ref>` par la référence du projet Rush).

- [ ] **Step 2: Exécuter la migration**

```sql
alter table studios
  add column if not exists plan text not null default 'gratuit',
  add column if not exists billing_seats integer not null default 2,
  add column if not exists billing_storage_tier integer not null default 0,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text;

-- Les utilisateurs authentifiés peuvent déjà LIRE ces colonnes (même policy
-- de SELECT que le reste de la ligne studios). Mais ils ne doivent JAMAIS
-- pouvoir les écrire directement (sinon n'importe qui pourrait s'attribuer
-- un palier payant gratuitement depuis la console du navigateur). Seul le
-- rôle service_role (utilisé exclusivement par la fonction webhook, jamais
-- exposé au navigateur) peut les modifier.
revoke update (plan, billing_seats, billing_storage_tier, stripe_customer_id, stripe_subscription_id, subscription_status)
  on studios from authenticated;
```

- [ ] **Step 3: Vérifier**

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'studios'
  and column_name in ('plan', 'billing_seats', 'billing_storage_tier', 'stripe_customer_id', 'stripe_subscription_id', 'subscription_status')
order by column_name;
```
Expected: 6 lignes, avec `plan` par défaut `'gratuit'`, `billing_seats` par défaut `2`, `billing_storage_tier` par défaut `0`.

```sql
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_name = 'studios' and column_name = 'plan';
```
Expected: aucune ligne avec `grantee = 'authenticated'` et `privilege_type = 'UPDATE'` (confirme que le revoke a bien pris).

- [ ] **Step 4: Confirmer dans la conversation**

Une fois les deux vérifications ci-dessus confirmées, passer à la Task 2. (Rien à committer — cette tâche ne touche aucun fichier du dépôt.)

---

### Task 2: Catalogue Stripe (script de création + étape manuelle d'exécution)

**Files:**
- Create: `app/scripts/create-stripe-catalog.mjs`
- Create: `app/src/data/stripePriceIds.ts` (rempli par la sortie du script, à la main)

**Interfaces:**
- Produces: `STRIPE_PRICE_IDS` (objet exporté depuis `app/src/data/stripePriceIds.ts`) — consommé par Task 3.

- [ ] **Step 1: Écrire le script de création du catalogue**

```js
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
```

- [ ] **Step 2: Ajouter `stripe` comme dépendance de dev (nécessaire pour exécuter le script)**

```bash
cd "D:\Vibe Coding\Rush\app" && npm install --save-dev stripe
```

- [ ] **Step 3: Exécuter le script en mode test Stripe (étape manuelle, clé secrète de l'humain)**

```bash
cd "D:\Vibe Coding\Rush\app" && STRIPE_SECRET_KEY=sk_test_xxx node scripts/create-stripe-catalog.mjs
```
Expected: un objet JSON imprimé dans le terminal avec tous les Price IDs (`price_...`).

- [ ] **Step 4: Copier le résultat dans le fichier de mapping**

Créer `app/src/data/stripePriceIds.ts` avec le JSON obtenu à l'étape précédente, structuré ainsi (remplacer les valeurs par les vraies) :

```ts
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
```

- [ ] **Step 5: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro nouvelle erreur.

- [ ] **Step 6: Commit**

```bash
git add app/scripts/create-stripe-catalog.mjs app/src/data/stripePriceIds.ts app/package.json app/package-lock.json
git commit -m "feat(billing): add Stripe catalog creation script and price ID mapping"
```

---

### Task 3: Fonction serveur — création de session de paiement

**Files:**
- Create: `app/api/create-checkout-session.ts`
- Modify: `app/package.json` (dépendances `stripe` en production, `@vercel/node` en dev)

**Interfaces:**
- Consumes: `STRIPE_PRICE_IDS` (Task 2).
- Produces: endpoint HTTP `POST /api/create-checkout-session` — body `{ studioId: string, plan: 'studio' | 'agence', billingCycle: 'monthly' | 'yearly', seats: number, storageTier: number }`, réponse `{ url: string }`.

- [ ] **Step 1: Ajouter les dépendances**

```bash
cd "D:\Vibe Coding\Rush\app" && npm install stripe && npm install --save-dev @vercel/node
```

- [ ] **Step 2: Écrire la fonction**

```ts
// app/api/create-checkout-session.ts
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
```

- [ ] **Step 3: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro nouvelle erreur. (`app/api/*.ts` n'est pas inclus dans `tsconfig.app.json` — si cette commande ne couvre pas ce fichier, exécuter `npx tsc --noEmit app/api/create-checkout-session.ts --esModuleInterop --skipLibCheck` comme vérification ciblée à la place.)

- [ ] **Step 4: Commit**

```bash
git add app/api/create-checkout-session.ts app/package.json app/package-lock.json
git commit -m "feat(billing): add Stripe checkout session creation endpoint"
```

---

### Task 4: Fonction serveur — webhook Stripe

**Files:**
- Create: `app/api/stripe-webhook.ts`

**Interfaces:**
- Consumes: variables d'environnement Vercel `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL` (déjà définie côté client, réutilisable côté serveur).
- Produces: endpoint HTTP `POST /api/stripe-webhook` — écrit `plan`/`billing_seats`/`billing_storage_tier`/`stripe_customer_id`/`stripe_subscription_id`/`subscription_status` sur la ligne `studios` correspondante.

- [ ] **Step 1: Écrire la fonction**

```ts
// app/api/stripe-webhook.ts
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
  const monthlyIdx = STRIPE_PRICE_IDS.storageMonthly.indexOf(priceId as never);
  if (monthlyIdx !== -1) return monthlyIdx + 1;
  const yearlyIdx = STRIPE_PRICE_IDS.storageYearly.indexOf(priceId as never);
  if (yearlyIdx !== -1) return yearlyIdx + 1;
  return 0;
}

async function syncSubscriptionToStudio(subscription: Stripe.Subscription) {
  const studioId = subscription.metadata.studioId;
  if (!studioId) {
    console.error('Stripe subscription missing studioId metadata', subscription.id);
    return;
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

  const status = subscription.status === 'canceled' ? 'canceled' : subscription.status;

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

  if (error) console.error('Failed to sync subscription to studio', studioId, error);
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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === 'string') {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscriptionToStudio(subscription);
      }
      break;
    }
    case 'customer.subscription.updated': {
      await syncSubscriptionToStudio(event.data.object as Stripe.Subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const studioId = subscription.metadata.studioId;
      if (studioId) {
        const { error } = await supabaseAdmin
          .from('studios')
          .update({ plan: 'gratuit', subscription_status: 'canceled', stripe_subscription_id: null })
          .eq('id', studioId);
        if (error) console.error('Failed to clear cancelled subscription', studioId, error);
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      if (typeof invoice.subscription === 'string') {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        await syncSubscriptionToStudio(subscription);
      }
      break;
    }
  }

  res.status(200).json({ received: true });
}
```

- [ ] **Step 2: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro nouvelle erreur (même remarque qu'à la Task 3 Step 3 si `app/api/` n'est pas couvert par ce tsconfig).

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe-webhook.ts
git commit -m "feat(billing): add Stripe webhook handler syncing subscriptions to Supabase"
```

---

### Task 5: Configuration Vercel + variables d'environnement (étape manuelle — exécutée par l'humain)

**Files:**
- Create: `app/vercel.json`

- [ ] **Step 1: Créer la configuration Vercel**

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

- [ ] **Step 2: Créer le projet Vercel et le connecter au dépôt (manuel)**

Dans le tableau de bord Vercel : importer le dépôt GitHub `mach3t389/Rush`, régler **Root Directory** à `app`, laisser Vercel détecter la configuration ci-dessus.

- [ ] **Step 3: Configurer les variables d'environnement du projet Vercel (manuel, jamais commitées)**

Dans Vercel → Project Settings → Environment Variables, ajouter (mode Preview + Production, avec les clés **test** Stripe d'abord) :
- `STRIPE_SECRET_KEY` = clé secrète Stripe (`sk_test_...` puis `sk_live_...` en production)
- `STRIPE_WEBHOOK_SECRET` = obtenu à l'étape suivante
- `SUPABASE_SERVICE_ROLE_KEY` = clé `service_role` du projet Supabase (Project Settings → API dans Supabase)
- `VITE_SUPABASE_URL` = même valeur que dans `app/.env` (déjà utilisée côté client, doit aussi être visible côté fonction serveur)

- [ ] **Step 4: Créer le endpoint webhook côté Stripe et obtenir le secret**

Dans le tableau de bord Stripe (mode Test d'abord) → Developers → Webhooks → Add endpoint : URL `https://<le-domaine-vercel>/api/stripe-webhook`, événements : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copier le "Signing secret" (`whsec_...`) et le mettre dans `STRIPE_WEBHOOK_SECRET` (Step 3).

- [ ] **Step 5: Commit**

```bash
git add app/vercel.json
git commit -m "chore(billing): add Vercel configuration for Vite deployment"
```

---

### Task 6: Déclencher le paiement depuis l'inscription

**Files:**
- Modify: `app/src/screens/Register.tsx:57-69`

**Interfaces:**
- Consumes: `getStudioId(): Promise<string>` (`app/src/data/studioStore.ts:36`, existant), endpoint `POST /api/create-checkout-session` (Task 3).

- [ ] **Step 1: Lire le code actuel**

`app/src/screens/Register.tsx` (lignes 57-69) appelle `register({studioName, name, email, password})`, puis sur succès fait `navigate('/onboarding', { replace: true })`. Le studio est créé paresseusement via `getStudioId()` (get-or-create), pas directement dans `Register.tsx`.

- [ ] **Step 2: Ajouter le déclenchement du paiement après inscription réussie**

Remplacer la section qui suit un `register()` réussi (autour de la ligne 63-64) :

```tsx
      // avant : navigate('/onboarding', { replace: true });
      if (selectedPlan === 'gratuit') {
        navigate('/onboarding', { replace: true });
        return;
      }
      const studioId = await getStudioId();
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioId,
          plan: selectedPlan,
          billingCycle: 'monthly',
          seats: 2,
          storageTier: 0,
        }),
      });
      const { url } = await res.json();
      window.location.href = url;
```

où `selectedPlan: 'gratuit' | 'studio' | 'agence'` est un nouvel état local (`useState<'gratuit' | 'studio' | 'agence'>('gratuit')`) piloté par un sélecteur de palier déjà présent ou à ajouter au formulaire d'inscription — **si aucun sélecteur de palier n'existe encore dans `Register.tsx` à ce stade du code, garder `selectedPlan` fixé à `'gratuit'` pour cette tâche (tout le monde s'inscrit gratuitement, l'upgrade se fait ensuite depuis Paramètres via la Task 7) plutôt que d'improviser un sélecteur non spécifié par ce plan.**

Ajouter l'import en haut du fichier :
```tsx
import { getStudioId } from '../data/studioStore';
```

- [ ] **Step 3: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro nouvelle erreur.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/Register.tsx
git commit -m "feat(billing): trigger Stripe checkout after signup for paid plans"
```

---

### Task 7: Resynchroniser les données de palier de Paramètres avec Pricing.tsx

**Files:**
- Modify: `app/src/screens/Parametres.tsx:932-989` (`PLATFORM_PLANS`, `STORAGE_BLOCKS`)

**Interfaces:**
- Produces: `STORAGE_BLOCKS` dans `Parametres.tsx` passe d'un modèle indexé par `gb` à un modèle indexé par **tier** (0-6), aligné sur `STORAGE_TOTALS`/`STORAGE_BLOCKS` de `app/src/screens/Pricing.tsx` — consommé par Task 8.

**Contexte du problème :** `Parametres.tsx` a ses propres `PLATFORM_PLANS`/`STORAGE_BLOCKS`, jamais mis à jour lors de la révision de la grille de stockage sur la page de prix publique (`Pricing.tsx`). Les montants de stockage y sont encore les anciens (5$/15$/35$/50$) et les paliers +2 To/+4 To n'existent pas. Cette tâche resynchronise les deux fichiers avant de brancher le paiement (Task 8), pour que le studio configure et paie exactement ce qui est affiché.

- [ ] **Step 1: Remplacer `STORAGE_BLOCKS`**

Remplacer (lignes 983-989) :

```tsx
const STORAGE_BLOCKS = [
  { gb: 0,    labelKey: 'settings.planStorageNoExtra', priceMonthly: 0,  priceYearly: 0   },
  { gb: 50,   labelKey: null, label: '+50 Go',         priceMonthly: 5,  priceYearly: 48  },
  { gb: 200,  labelKey: null, label: '+200 Go',        priceMonthly: 15, priceYearly: 144 },
  { gb: 500,  labelKey: null, label: '+500 Go',        priceMonthly: 35, priceYearly: 336 },
  { gb: 1000, labelKey: null, label: '+1 To',          priceMonthly: 50, priceYearly: 480 },
];
```

par (index = tier, aligné sur `STORAGE_BLOCKS`/`STORAGE_TOTALS` de `Pricing.tsx`) :

```tsx
const STORAGE_BLOCKS = [
  { tier: 0, labelKey: 'settings.planStorageNoExtra', priceMonthly: 0,   priceYearly: 0    },
  { tier: 1, labelKey: null, label: '+50 Go',          priceMonthly: 2,   priceYearly: 19   },
  { tier: 2, labelKey: null, label: '+200 Go',         priceMonthly: 6,   priceYearly: 58   },
  { tier: 3, labelKey: null, label: '+500 Go',         priceMonthly: 15,  priceYearly: 144  },
  { tier: 4, labelKey: null, label: '+1 To',           priceMonthly: 30,  priceYearly: 288  },
  { tier: 5, labelKey: null, label: '+2 To',           priceMonthly: 60,  priceYearly: 576  },
  { tier: 6, labelKey: null, label: '+4 To',           priceMonthly: 120, priceYearly: 1152 },
];
```

- [ ] **Step 2: Mettre à jour les usages de `.gb` dans le reste de `PlanSettings`**

Chercher toutes les occurrences de `.gb`/`storageGb`/`currentStorage`/`STORAGE_BLOCKS.find(s => s.gb ===` dans `PlanSettings()` (à partir de la ligne 997) et remplacer chaque comparaison sur `gb` par une comparaison sur `tier`. En particulier, la ligne :

```tsx
const activeStorage = STORAGE_BLOCKS.find(s => s.gb === currentStorage)!;
```

devient :

```tsx
const activeStorage = STORAGE_BLOCKS.find(s => s.tier === currentStorage)!;
```

(`currentStorage`/`setCurrentStorage` gardent leur nom — ils représentent maintenant un tier au lieu d'un nombre de Go, ce qui est cohérent puisqu'ils étaient déjà utilisés comme clé opaque, jamais affichés directement comme un nombre de Go brut ailleurs dans le fichier.)

- [ ] **Step 3: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro nouvelle erreur. Si `tsc` signale d'autres usages de `.gb` non trouvés au Step 2, les corriger de la même façon jusqu'à zéro erreur.

- [ ] **Step 4: Vérification visuelle**

Démarrer le serveur de dev, naviguer vers Paramètres → Facturation. Confirmer que les 7 paliers de stockage (aucun ajout jusqu'à +4 To) s'affichent avec les mêmes montants que la page `/pricing`.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Parametres.tsx
git commit -m "fix(billing): sync Paramètres storage tiers with Pricing.tsx (was stale)"
```

---

### Task 8: Déclencher le paiement depuis Paramètres (upgrade)

**Files:**
- Modify: `app/src/screens/Parametres.tsx:1014-1018` (fonction `applyChanges`)

**Interfaces:**
- Consumes: `getStudioId()` (existant), endpoint `POST /api/create-checkout-session` (Task 3), `STORAGE_BLOCKS` tier-indexé (Task 7).

- [ ] **Step 1: Lire le code actuel**

```tsx
  const pendingPlan    = confirming?.plan    ?? currentPlan;
  const pendingStorage = confirming?.storage ?? currentStorage;

  const applyChanges = () => {
    setCurrentPlan(confirming!.plan);
    setCurrentStorage(confirming!.storage);
    setConfirming(null);
  };
```

`applyChanges` ne fait actuellement que mettre à jour l'état local — aucun appel réseau. `pendingStorage` est maintenant (après Task 7) un tier 0-6, directement utilisable comme `storageTier`.

- [ ] **Step 2: Remplacer `applyChanges` par un déclenchement Stripe**

```tsx
  const applyChanges = async () => {
    const plan = confirming!.plan;
    const storage = confirming!.storage;
    if (plan === 'gratuit') {
      // Rétrograder vers Gratuit : géré par le portail client Stripe
      // (chantier C) — hors scope ici, ne rien faire de plus qu'avant.
      setCurrentPlan(plan);
      setCurrentStorage(storage);
      setConfirming(null);
      return;
    }
    const studioId = await getStudioId();
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studioId,
        plan,
        billingCycle: 'monthly',
        seats: 2,
        storageTier: storage,
      }),
    });
    const { url } = await res.json();
    window.location.href = url;
  };
```

Ajouter l'import en haut du fichier si absent :
```tsx
import { getStudioId } from '../data/studioStore';
```

- [ ] **Step 3: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro nouvelle erreur.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/Parametres.tsx
git commit -m "feat(billing): trigger Stripe checkout from Paramètres upgrade flow"
```

---

### Task 9: Vérification complète de bout en bout (mode test Stripe)

**Files:** aucun changement de code — validation uniquement.

- [ ] **Step 1: Build complet**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro erreur nouvelle sur l'ensemble des fichiers touchés par ce chantier.

- [ ] **Step 2: Test local des fonctions serveur (manuel)**

```bash
cd "D:\Vibe Coding\Rush\app" && npx vercel dev
```
Dans un second terminal, transférer les webhooks Stripe vers l'instance locale :
```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```
(nécessite le Stripe CLI installé — `stripe login` une première fois si jamais fait.)

- [ ] **Step 3: Parcours complet en mode test**

- S'inscrire avec un palier Gratuit → confirmer l'absence d'appel Stripe, `studios.plan` reste `'gratuit'` par défaut.
- Depuis Paramètres, upgrader vers Studio (2 sièges, aucun stockage additionnel) avec une carte de test Stripe (`4242 4242 4242 4242`, toute date future, tout CVC) → confirmer la redirection réussie, puis vérifier dans Supabase que `studios.plan = 'studio'`, `subscription_status = 'active'`, `stripe_customer_id`/`stripe_subscription_id` remplis.
- Depuis le tableau de bord Stripe (mode test), annuler l'abonnement créé → confirmer que le webhook `customer.subscription.deleted` remet `plan = 'gratuit'`, `subscription_status = 'canceled'` dans Supabase.
- Tenter, depuis la console du navigateur (session connectée), `supabase.from('studios').update({ plan: 'agence' }).eq('id', '<son studioId>')` → confirmer que Supabase refuse l'écriture (erreur de permission), validant le `revoke` de la Task 1.

- [ ] **Step 4: Commit final si des ajustements ont été faits pendant la vérification**

```bash
git add -A
git commit -m "fix(billing): address issues found during end-to-end verification"
```

(Ne committer que s'il y a eu des changements réels à cette étape.)
