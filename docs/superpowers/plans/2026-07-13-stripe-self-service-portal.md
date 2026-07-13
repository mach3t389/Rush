# Chantier C1 — Portail self-service Stripe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Rush studio manage its own Stripe subscription (payment method, invoice history, cancellation) via Stripe's hosted Customer Portal, without contacting support.

**Architecture:** One new serverless function (`create-portal-session.ts`, mirroring the existing `create-checkout-session.ts` auth pattern) creates a Stripe Billing Portal session and returns its URL; `Parametres.tsx` gets a single "Manage subscription" button that calls it and redirects. The fake invoice-history sub-tab is removed since the portal now provides real invoice history.

**Tech Stack:** Same as chantiers A/B — Vercel serverless functions (`@vercel/node`), Stripe Node SDK, Supabase (`studios.stripe_customer_id`, already populated by chantier A), React 19 + TypeScript, react-i18next.

## Global Constraints

- No hard-coded UI strings — every new user-facing string goes through `t('namespace.key')` with entries in both `app/src/locales/fr.json` and `app/src/locales/en.json`.
- `npx tsc -p tsconfig.app.json --noEmit` is the typecheck command for this repo. The repo has ~170 pre-existing unrelated errors (confirmed 2026-07-12) — only check that your changed files introduce no NEW errors.
- This repo has no automated test suite — verification is manual, against the dev server or (for the serverless function) a deployed Vercel preview, matching how chantiers A and B were verified.
- The portal must NOT allow changing plan/seats/storage — that stays exclusively in Paramètres → Plan (chantier A's UI). This is enforced in Stripe Dashboard configuration (Task 3), not in code.
- Auth pattern for any new serverless endpoint: require `Authorization: Bearer <token>`, validate via `supabaseAdmin.auth.getUser(token)` (401 if invalid), then verify `studio_members` membership for that user+studioId (403 if not a member) — same as `create-checkout-session.ts` and `update-subscription.ts`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/api/create-portal-session.ts` | new | Serverless function: validates the caller, fetches `studios.stripe_customer_id`, creates a Stripe Billing Portal session, returns its URL. |
| `app/src/screens/Parametres.tsx` | modify | Remove the fake "Historique des paiements" sub-tab and its `MOCK_INVOICES` data; add a "Gérer mon abonnement" button (visible only when `hasActiveSubscription`) that calls the new endpoint and redirects. |
| `app/src/locales/fr.json`, `app/src/locales/en.json` | modify | Remove now-dead `planSubTab*`/`planHistory*` keys; add new `planManage*`/`planPortalFailed` keys. |

---

### Task 1: `create-portal-session.ts` serverless function

**Files:**
- Create: `app/api/create-portal-session.ts`

**Interfaces:**
- Consumes: `STRIPE_SECRET_KEY`, `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env vars (already configured in Vercel from chantier A).
- Produces: `POST /api/create-portal-session` accepting `{ studioId: string }`, returning `{ url: string }` on success.

- [ ] **Step 1: Create the file**

```ts
// app/api/create-portal-session.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface PortalBody {
  studioId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId } = req.body as PortalBody;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  // Auth check: the caller must be an authenticated member of studioId.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const { data: studio, error: studioError } = await supabaseAdmin
    .from('studios')
    .select('stripe_customer_id')
    .eq('id', studioId)
    .single();

  if (studioError || !studio?.stripe_customer_id) {
    res.status(400).json({ error: 'No Stripe customer for this studio' });
    return;
  }

  const origin = req.headers.origin || 'https://rush.app';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: studio.stripe_customer_id,
      return_url: `${origin}/parametres?section=plan`,
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Failed to create Stripe billing portal session:', error);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
}
```

- [ ] **Step 2: Typecheck against Vercel's stricter module resolution**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit --moduleResolution nodenext --module nodenext --target es2020 --esModuleInterop --skipLibCheck --ignoreConfig api/create-portal-session.ts`
Expected: no output (matches how chantier A's serverless functions were verified, since Vercel compiles API routes separately from the Vite build with stricter module resolution).

- [ ] **Step 3: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/api/create-portal-session.ts
git commit -m "feat(billing): add create-portal-session serverless function for Stripe self-service portal"
```

---

### Task 2: "Gérer mon abonnement" button in Parametres.tsx

**Files:**
- Modify: `app/src/screens/Parametres.tsx:1059-1063` (remove `MOCK_INVOICES`), `:1217` (remove `planSubTab` state), `:1247-1258` (remove sub-tab selector), `:1260` and `:1565` (remove fragment wrapper), `:1562-1563` area (insert new button block), `:1567-1592` (remove history block)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (remove dead keys, add new keys)

**Interfaces:**
- Consumes: `getStudioId()` (`app/src/data/studioStore.ts`), `supabase` (`app/src/data/supabaseClient.ts`) — both already imported in this file from chantier A/B work.
- Produces: nothing consumed by later tasks — this is the last code task.

The plan's "Global Constraints" note that `Parametres.tsx` is large (1700+ lines) and has already been modified extensively by chantiers A and B — verify each line-number anchor below against the actual current file content before editing; the numbers are accurate as of the plan being written but may drift by a few lines from unrelated concurrent edits.

- [ ] **Step 1: Remove `MOCK_INVOICES`**

Find (around line 1059):

```tsx
const MOCK_INVOICES = [
  { date: '2026-05-01', amount: '19,00 $ CA', status: 'paid' },
  { date: '2026-04-01', amount: '19,00 $ CA', status: 'paid' },
  { date: '2026-03-01', amount: '19,00 $ CA', status: 'paid' },
];

function PlanSettings() {
```

Replace with:

```tsx
function PlanSettings() {
```

- [ ] **Step 2: Remove the `planSubTab` state**

Find (around line 1217, likely now a few lines earlier after Step 1's deletion):

```tsx
  const [planSubTab, setPlanSubTab] = useState<'overview' | 'history'>('overview');
```

Delete this line entirely (no replacement).

- [ ] **Step 3: Add portal-opening state and handler**

Find the existing `discardChanges` function (added in an earlier chantier, look for `const discardChanges = () => {`). Immediately after its closing `};`, add:

```tsx
  const [openingPortal, setOpeningPortal] = useState(false);

  const openBillingPortal = async () => {
    setOpeningPortal(true);
    try {
      const studioId = await getStudioId();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ studioId }),
      });
      if (!res.ok) throw new Error('Portal session request failed');
      const { url } = await res.json();
      if (!url) throw new Error('No portal URL returned');
      window.location.href = url;
    } catch (err) {
      console.error('Failed to open billing portal', err);
      window.alert(t('settings.planPortalFailed'));
      setOpeningPortal(false);
    }
  };
```

- [ ] **Step 4: Remove the sub-tab selector UI**

Find:

```tsx
      {/* ── Sous-onglets ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 32 }}>
        {(['overview', 'history'] as const).map(tab => (
          <button key={tab} onClick={() => setPlanSubTab(tab)} style={{
            padding: '10px 4px', marginRight: 24, border: 'none', borderBottom: `2px solid ${planSubTab === tab ? 'var(--accent)' : 'transparent'}`,
            background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--ff-text)',
            color: planSubTab === tab ? 'var(--text)' : 'var(--text-3)', transition: 'color 0.15s, border-color 0.15s',
          }}>
            {t(tab === 'overview' ? 'settings.planSubTabOverview' : 'settings.planSubTabHistory')}
          </button>
        ))}
      </div>

      {planSubTab === 'overview' && <>

      {/* ── Billing toggle ─────────────────────────────────────────────── */}
```

Replace with:

```tsx
      {/* ── Billing toggle ─────────────────────────────────────────────── */}
```

(This deletes the sub-tab bar and the opening `{planSubTab === 'overview' && <>` fragment wrapper, leaving the "Billing toggle" section as a direct child of the component's return again.)

- [ ] **Step 5: Close the removed fragment and add the "Manage subscription" button**

Find:

```tsx
        <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 12 }}>{t('settings.planCancelAnytime')}</p>
      </div>

      </>}

      {/* ── Historique des paiements (sous-onglet) ──────────────────────── */}
      {planSubTab === 'history' && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--ff-display)', marginBottom: 6 }}>{t('settings.planHistoryTitle')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 18 }}>{t('settings.planHistoryDesc')}</p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', padding: '9px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {['planHistoryDate','planHistoryAmount','planHistoryStatus','planHistoryDownload'].map(k => (
                <span key={k} style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t(`settings.${k}`)}</span>
              ))}
            </div>
            {MOCK_INVOICES.map((inv, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', padding: '11px 16px', borderBottom: i < MOCK_INVOICES.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontFamily: 'var(--ff-mono)', color: 'var(--text-2)' }}>{inv.date}</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--ff-mono)', color: 'var(--text)' }}>{inv.amount}</span>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--ok)', background: 'rgba(0,210,120,0.1)', borderRadius: 5, padding: '3px 8px', display: 'inline-block' }}>
                  {t(`settings.planHistory${inv.status === 'paid' ? 'Paid' : 'Pending'}`)}
                </span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
                  <SFIcon name="download" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
```

Replace with:

```tsx
        <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 12 }}>{t('settings.planCancelAnytime')}</p>
      </div>

      {hasActiveSubscription && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32, marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--ff-display)', marginBottom: 6 }}>{t('settings.planManageTitle')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>{t('settings.planManageDesc')}</p>
          <button
            onClick={openBillingPortal}
            disabled={openingPortal}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 9,
              border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
              fontSize: 13, fontWeight: 700, fontFamily: 'var(--ff-text)',
              cursor: openingPortal ? 'default' : 'pointer', opacity: openingPortal ? 0.6 : 1,
            }}>
            <SFIcon name="external-link" size={14} color="var(--text)" />
            {t('settings.planManageCta')}
          </button>
        </div>
      )}
```

Note: this task removes the `{planSubTab === 'history' && (...)}` block entirely — there is no history sub-tab anymore, just this one conditional "Manage subscription" section gated on `hasActiveSubscription` (the same state chantier A already populates from `studios.stripe_subscription_id`).

- [ ] **Step 6: Remove dead translation keys**

In `app/src/locales/fr.json`, find and delete these two lines (in the `settings` namespace):

```json
    "planSubTabOverview": "Abonnement",
    "planSubTabHistory": "Historique des paiements",
```

Find and delete these eight lines (in the `settings` namespace):

```json
    "planHistoryTitle": "Historique des paiements",
    "planHistoryDesc": "Vos factures des 12 derniers mois.",
    "planHistoryEmpty": "Aucune facture pour le moment.",
    "planHistoryDate": "Date",
    "planHistoryAmount": "Montant",
    "planHistoryStatus": "Statut",
    "planHistoryDownload": "Télécharger",
    "planHistoryPaid": "Payée",
    "planHistoryPending": "En attente",
```

In `app/src/locales/en.json`, find and delete the equivalent `planSubTabOverview`/`planSubTabHistory` lines and the equivalent nine `planHistory*` lines (same keys, English values).

- [ ] **Step 7: Add new translation keys**

In `app/src/locales/fr.json`, in the `settings` namespace (anywhere near the other `plan*` keys — e.g. right after where `planCheckoutUpdated` was added in an earlier chantier), add:

```json
    "planManageTitle": "Gérer mon abonnement",
    "planManageDesc": "Mets à jour ta carte de paiement, consulte tes factures ou annule ton abonnement.",
    "planManageCta": "Ouvrir le portail de facturation",
    "planPortalFailed": "Impossible d'ouvrir le portail de facturation. Réessaie dans un instant.",
```

In `app/src/locales/en.json`, same namespace:

```json
    "planManageTitle": "Manage your subscription",
    "planManageDesc": "Update your payment method, view invoices, or cancel your subscription.",
    "planManageCta": "Open billing portal",
    "planPortalFailed": "Couldn't open the billing portal. Try again shortly.",
```

- [ ] **Step 8: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i Parametres`
Expected: no output.

- [ ] **Step 9: Manual verification (dev server)**

Run `npm run dev` from `app/`, log in with a demo account (demo sessions read as plan `'agence'` with no real `stripe_customer_id`, so `hasActiveSubscription` will be `false` for them — see Context note below), navigate to Paramètres → Plan. Confirm:
- No sub-tab bar is shown anymore — just the single Plan view.
- No "Manage subscription" button appears (since demo accounts have no real subscription).
- The page still renders the plan cards, storage tiers, seats, and summary exactly as before (this task only removed the history tab and added a conditionally-hidden button — everything else must be visually unchanged).

Full click-through of the button itself (confirming it actually opens a real Stripe portal session) happens in Task 3, against a real account with an active subscription.

- [ ] **Step 10: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/screens/Parametres.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(billing): replace fake invoice history with a real Stripe billing-portal button"
```

---

### Task 3: Stripe Customer Portal configuration + end-to-end verification (manual)

**Files:** none (Stripe Dashboard configuration + manual browser verification only)

**Interfaces:**
- Consumes: `POST /api/create-portal-session` (Task 1), the "Gérer mon abonnement" button (Task 2).

- [ ] **Step 1: Configure the Customer Portal in Stripe Dashboard**

1. Go to Stripe Dashboard → make sure you're on the **Rush** account, in **Test mode**.
2. Navigate to **Settings → Billing → Customer portal** (search "Customer portal" if the menu path differs).
3. Under **Functionality**, enable:
   - "Customers can update payment methods"
   - "Customers can view billing history" (invoices)
   - "Customers can cancel subscriptions" — set the cancellation policy to **"At the end of the billing period"** (not immediately).
4. Under **Products** / plan-switching options, make sure **no** "customers can switch plans" option is enabled — this must stay exclusive to Paramètres → Plan.
5. Save the configuration.

- [ ] **Step 2: End-to-end verification against the deployed app**

Using an account that already has an active paid subscription (from chantier A/B's own live verification):

1. Go to `https://rush-jet.vercel.app/parametres?section=plan`.
2. Confirm the "Gérer mon abonnement" button is now visible (it wasn't before this chantier).
3. Click it — confirm it redirects to a Stripe-hosted page (URL starting with `billing.stripe.com`).
4. On that page, confirm you can see the current subscription, update the payment method, and see invoice history.
5. Click "Cancel subscription" (or equivalent) — confirm Stripe's own portal messaging says the subscription stays active until the end of the current billing period (not immediately).
6. Click the portal's "return to Rush" link (or manually navigate back) — confirm you land on `https://rush-jet.vercel.app/parametres?section=plan` with the Plan tab open and the plan still showing as active (expected — cancellation hasn't taken effect yet).
7. In Stripe Dashboard, check the subscription's status — it should show `cancel_at_period_end: true` while remaining `active`.

Do not wait for the actual period-end cancellation to occur as part of this verification (chantier A's webhook handling of `customer.subscription.deleted` was already verified live in that chantier) — confirming the portal opens, shows real data, and successfully schedules the cancellation is sufficient for this task's scope.
