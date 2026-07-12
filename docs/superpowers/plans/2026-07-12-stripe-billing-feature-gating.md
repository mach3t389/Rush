# Chantier B — Restriction des fonctionnalités par plan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plan-based feature restrictions that Rush already advertises on its pricing page (Assistant IA, Finances, Modèles personnalisés, Projets, Membres, Logo personnalisé) actually enforced in the product.

**Architecture:** Three new shared modules (`planFeatures.ts` config, `planStore.ts` reactive plan reader, `upgradePromptStore.ts` + `UpgradePromptModal.tsx` shared upsell modal) give every gate point the same source of truth and the same UI. Six existing files each get a small, localized gate at their single creation/toggle choke point.

**Tech Stack:** React 19 + TypeScript, Supabase (`studios.plan`, `studios.billing_seats` — already populated by chantier A), react-i18next, react-router-dom.

## Global Constraints

- This repo has **no automated test suite** (see `CLAUDE.md`: "Il n'y a pas de tests automatisés. La vérification se fait via le serveur de preview."). Every task's verification step is a manual check against the Vite dev server (`npm run dev`, already configured as the `rush-app` launch target), not a test runner. Do not add a test framework as part of this plan.
- `npx tsc -p tsconfig.app.json --noEmit` is the typecheck command for this repo (plain `tsc --noEmit` gives a false pass — see project memory). Run it after every task and confirm no NEW errors appear (the repo has ~190 pre-existing unrelated errors; only check that your changed files introduce none).
- Plan keys are the string literals `'gratuit' | 'studio' | 'agence'` — this exact casing is already used throughout `Parametres.tsx`, `Pricing.tsx`, and the Stripe webhook (`app/api/stripe-webhook.ts`). Do not introduce a different casing or a new enum.
- Demo sessions (`isDemoSession()` from `app/src/data/authStore.ts`) never touch Supabase — `planStore.ts` must special-case them to always report the most permissive plan (`'agence'`) so the demo accounts are never blocked.
- No hard-coded UI strings — every new user-facing string goes through `t('namespace.key')` with entries added to both `app/src/locales/fr.json` and `app/src/locales/en.json`.
- Never use `<input type="date">` — not applicable to this plan (no date pickers involved), noted for completeness per project convention.
- Commit after each task with `git add <files> && git commit -m "..."` — no pushing to origin as part of this plan (push is a separate, explicit user step, per this session's established pattern).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/src/data/planFeatures.ts` | new | Static config: which features/limits each plan allows. Single source of truth. |
| `app/src/data/planStore.ts` | new | Reads `studios.plan`/`billing_seats` reactively (mirrors `studioStore.ts`'s pattern); exports `usePlan()` hook. |
| `app/src/data/upgradePromptStore.ts` | new | Singleton store for "show the upgrade modal" state (mirrors `toastStore.ts`). |
| `app/src/components/UpgradePromptModal.tsx` | new | The shared modal UI, mounted once in `AppShell.tsx` (mirrors `ToastBar.tsx`). |
| `app/src/components/layout/AppShell.tsx` | modify | Mount `<UpgradePromptModal />`. |
| `app/src/components/AIChat.tsx` | modify | Gate the panel's open toggle. |
| `app/src/screens/Finances.tsx` | modify | Gate the whole page behind a locked-state screen. |
| `app/src/screens/Modeles.tsx` | modify | Gate the "Nouveau modèle/formulaire" creation action. |
| `app/src/components/ProjectsListView.tsx` | modify | Gate new-project creation past the plan's project limit. |
| `app/src/screens/MonEquipe.tsx` | modify | Gate team invites past the plan's/purchased seat limit. |
| `app/src/screens/Parametres.tsx` | modify | Gate the logo upload; support `?section=` deep link; consume `planFeatures.ts` instead of local flags; fix Gratuit's member-count copy. |
| `app/src/screens/Pricing.tsx` | modify | Consume `planFeatures.ts`/`planStore` limits instead of local duplicated data where applicable. |
| `app/src/locales/fr.json`, `app/src/locales/en.json` | modify | New translation keys for the upgrade modal and the Finances locked screen. |

---

### Task 1: `planFeatures.ts` — shared plan config

**Files:**
- Create: `app/src/data/planFeatures.ts`

**Interfaces:**
- Produces: `PlanKey` type, `GatedFeature` type, `PLAN_FEATURES`, `PLAN_LIMITS`, `canUseFeature(plan, feature): boolean`

- [ ] **Step 1: Create the file**

```ts
// app/src/data/planFeatures.ts
// Single source of truth for what each Rush plan allows. Consumed by every
// gate point in the app, plus Pricing.tsx and Parametres.tsx's plan cards —
// avoids the copy/enforcement drifting apart (it already had, once: the
// Gratuit plan's marketing copy said "up to 5 members" while the seat
// billing logic enforced 2).

export type PlanKey = 'gratuit' | 'studio' | 'agence';
export type GatedFeature = 'ai' | 'finances' | 'customTemplates' | 'customLogo';

export const PLAN_FEATURES: Record<PlanKey, Record<GatedFeature, boolean>> = {
  gratuit: { ai: false, finances: false, customTemplates: false, customLogo: false },
  studio:  { ai: true,  finances: true,  customTemplates: true,  customLogo: true  },
  agence:  { ai: true,  finances: true,  customTemplates: true,  customLogo: true  },
};

export const PLAN_LIMITS: Record<PlanKey, { maxProjects: number | null; maxSeats: number }> = {
  gratuit: { maxProjects: 3,    maxSeats: 2  },
  studio:  { maxProjects: null, maxSeats: 10 },
  agence:  { maxProjects: null, maxSeats: 50 },
};

export function canUseFeature(plan: PlanKey, feature: GatedFeature): boolean {
  return PLAN_FEATURES[plan][feature];
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i planFeatures`
Expected: no output (no errors in the new file).

- [ ] **Step 3: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/data/planFeatures.ts
git commit -m "feat(billing): add planFeatures.ts as single source of truth for plan-gated features"
```

---

### Task 2: `planStore.ts` — reactive plan reader + `usePlan()` hook

**Files:**
- Create: `app/src/data/planStore.ts`

**Interfaces:**
- Consumes: `getStudioId()` from `app/src/data/studioStore.ts` (`export async function getStudioId(): Promise<string>`), `isDemoSession()` and `onLogout()` from `app/src/data/authStore.ts`, `supabase` from `app/src/data/supabaseClient.ts`, `PlanKey` from `app/src/data/planFeatures.ts` (Task 1).
- Produces: `getCurrentPlan(): PlanKey`, `getCurrentBillingSeats(): number`, `subscribePlan(fn): () => void`, `usePlan(): PlanKey` (React hook), `resetPlanCache(): void`.

- [ ] **Step 1: Create the file**

```ts
// app/src/data/planStore.ts
// Reactive cache of the current studio's Stripe plan/seat count, sourced
// from `studios.plan`/`billing_seats` (populated by the chantier A webhook —
// see app/api/stripe-webhook.ts). Same get/subscribe pattern as the other
// stores in this file (studioStore.ts, projectStore.ts).

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import type { PlanKey } from './planFeatures';

type Listener = () => void;
const listeners: Listener[] = [];
function notify() { listeners.forEach(l => l()); }
export function subscribePlan(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

// Demo sessions never touch Supabase and should never be blocked — default
// to the most permissive plan until a real fetch (which demo never triggers)
// would overwrite it.
let _plan: PlanKey = 'agence';
let _billingSeats = 50;
let _fetchStarted = false;

async function fetchPlan(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studios')
    .select('plan, billing_seats')
    .eq('id', studioId)
    .single();
  if (error) { console.error('fetchPlan failed', error); return; }
  _plan = (data.plan as PlanKey) ?? 'gratuit';
  _billingSeats = data.billing_seats ?? 2;
  notify();
}

let _logoutHookRegistered = false;
function ensureFetchStarted(): void {
  if (!_logoutHookRegistered) {
    _logoutHookRegistered = true;
    onLogout(resetPlanCache);
  }
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchPlan();
}

export function resetPlanCache(): void {
  _plan = 'agence';
  _billingSeats = 50;
  _fetchStarted = false;
}

export function getCurrentPlan(): PlanKey {
  if (isDemoSession()) return 'agence';
  ensureFetchStarted();
  return _plan;
}

export function getCurrentBillingSeats(): number {
  if (isDemoSession()) return 50;
  ensureFetchStarted();
  return _billingSeats;
}

export function usePlan(): PlanKey {
  const [plan, setPlan] = useState<PlanKey>(getCurrentPlan);
  useEffect(() => subscribePlan(() => setPlan(getCurrentPlan())), []);
  return plan;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i planStore`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/data/planStore.ts
git commit -m "feat(billing): add planStore.ts reactive plan/seats reader with usePlan() hook"
```

---

### Task 3: Shared upgrade-prompt modal + `?section=` deep link in Parametres

**Files:**
- Create: `app/src/data/upgradePromptStore.ts`
- Create: `app/src/components/UpgradePromptModal.tsx`
- Modify: `app/src/components/layout/AppShell.tsx:1-77` (mount the modal)
- Modify: `app/src/screens/Parametres.tsx:1416-1418` (generic `?section=` deep link)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (new keys)

**Interfaces:**
- Consumes: `GatedFeature` from `app/src/data/planFeatures.ts` (Task 1).
- Produces: `requestUpgrade(reason: { feature: GatedFeature } | { reason: 'seats' }): void`, `dismissUpgradePrompt(): void`, `<UpgradePromptModal />` component. These are what every later gating task (4–9) calls.

- [ ] **Step 1: Create `upgradePromptStore.ts`**

```ts
// app/src/data/upgradePromptStore.ts
// Singleton "show the upgrade modal" state, same pattern as toastStore.ts.

import type { GatedFeature } from './planFeatures';

export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' };

let current: UpgradeReason | null = null;
const listeners: (() => void)[] = [];
function notify() { listeners.forEach(l => l()); }

export function requestUpgrade(reason: UpgradeReason): void {
  current = reason;
  notify();
}

export function dismissUpgradePrompt(): void {
  current = null;
  notify();
}

export function getUpgradePrompt(): UpgradeReason | null {
  return current;
}

export function subscribeUpgradePrompt(fn: () => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
```

- [ ] **Step 2: Create `UpgradePromptModal.tsx`**

```tsx
// app/src/components/UpgradePromptModal.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from './ui';
import { getUpgradePrompt, subscribeUpgradePrompt, dismissUpgradePrompt } from '../data/upgradePromptStore';
import type { GatedFeature } from '../data/planFeatures';

const FEATURE_LABEL_KEYS: Record<GatedFeature, string> = {
  ai: 'settings.planFeatAI',
  finances: 'settings.planFeatFinances',
  customTemplates: 'settings.planFeatTemplatesCustom',
  customLogo: 'upgradePrompt.customLogoLabel',
};

export function UpgradePromptModal() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState(getUpgradePrompt);

  useEffect(() => subscribeUpgradePrompt(() => setPrompt(getUpgradePrompt())), []);

  if (!prompt) return null;

  const isSeats = 'reason' in prompt && prompt.reason === 'seats';
  const title = isSeats ? t('upgradePrompt.seatsTitle') : t('upgradePrompt.featureTitle');
  const body = isSeats
    ? t('upgradePrompt.seatsBody')
    : t('upgradePrompt.featureBody', { feature: t(FEATURE_LABEL_KEYS[(prompt as { feature: GatedFeature }).feature]) });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }}
      onClick={dismissUpgradePrompt}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '32px', maxWidth: 380, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <SFIcon name="lock" size={20} color="var(--accent)" />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={dismissUpgradePrompt} style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
            {t('common.cancel')}
          </button>
          <Link to="/parametres?section=plan" onClick={dismissUpgradePrompt} style={{ flex: 1, padding: '11px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--ff-text)', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {t('upgradePrompt.cta')}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add translation keys**

In `app/src/locales/fr.json`, find the `"planCheckoutUpdated"` line (added in chantier A) and add immediately after it, inside the same `settings` namespace object:

```json
    "planCheckoutUpdated": "Abonnement mis à jour — les changements seront reflétés sous peu.",
    "planSubTabOverview": "Abonnement",
```

Then add a new top-level namespace at the end of the JSON file (before the final closing `}`), as a sibling of `"settings"`:

```json
  "upgradePrompt": {
    "featureTitle": "Fonctionnalité verrouillée",
    "featureBody": "{{feature}} est disponible avec un plan payant. Passe à Studio ou Agence pour en profiter.",
    "seatsTitle": "Limite de sièges atteinte",
    "seatsBody": "Tu as atteint le nombre de sièges déjà achetés pour ton équipe. Achète un siège de plus pour inviter cette personne.",
    "cta": "Voir les plans",
    "customLogoLabel": "Le logo personnalisé"
  }
```

In `app/src/locales/en.json`, same structure with English text:

```json
  "upgradePrompt": {
    "featureTitle": "Feature locked",
    "featureBody": "{{feature}} is available on a paid plan. Upgrade to Studio or Agence to unlock it.",
    "seatsTitle": "Seat limit reached",
    "seatsBody": "You've reached the number of seats already purchased for your team. Buy one more seat to invite this person.",
    "cta": "View plans",
    "customLogoLabel": "Custom logo"
  }
```

- [ ] **Step 4: Mount the modal in `AppShell.tsx`**

In `app/src/components/layout/AppShell.tsx`, add the import next to the existing `ToastBar` import (line 8):

```tsx
import { ToastBar } from '../ToastBar';
import { UpgradePromptModal } from '../UpgradePromptModal';
```

Then render it next to `<ToastBar />` (line 74):

```tsx
      <ToastBar />
      <UpgradePromptModal />
```

- [ ] **Step 5: Support `?section=` deep-linking in `Parametres.tsx`**

In `app/src/screens/Parametres.tsx`, find:

```tsx
  const [activeSection, setActiveSection] = useState(() =>
    new URLSearchParams(window.location.search).has('checkout') ? 'plan' : 'infos'
  );
```

Replace with:

```tsx
  const [activeSection, setActiveSection] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('checkout')) return 'plan';
    return params.get('section') || 'infos';
  });
```

- [ ] **Step 6: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -iE "upgradePrompt|AppShell|Parametres"`
Expected: no output.

- [ ] **Step 7: Manual verification**

Run: `npm run dev` (from `app/`), open http://localhost:5188 in a browser, log in with a demo account.
- In the browser devtools console, run `import('/src/data/upgradePromptStore.ts').then(m => m.requestUpgrade({ feature: 'ai' }))` — expect the modal to appear centered with a lock icon, "Fonctionnalité verrouillée" title, and two buttons ("Annuler", "Voir les plans").
- Click "Voir les plans" — expect navigation to `/parametres?section=plan` and the Plan tab to be pre-selected.
- Reopen the modal the same way and click outside it (on the dark overlay) — expect it to close.

- [ ] **Step 8: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/data/upgradePromptStore.ts app/src/components/UpgradePromptModal.tsx app/src/components/layout/AppShell.tsx app/src/screens/Parametres.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(billing): add shared upgrade-prompt modal, mount in AppShell, support Parametres ?section= deep link"
```

---

### Task 4: Gate Assistant IA

**Files:**
- Modify: `app/src/components/AIChat.tsx:1-10` (imports), `:566-570` (toggle logic)

**Interfaces:**
- Consumes: `usePlan()` (Task 2), `canUseFeature()` (Task 1), `requestUpgrade()` (Task 3).

- [ ] **Step 1: Add imports**

In `app/src/components/AIChat.tsx`, near the existing `import { registerAIToggle, registerAIClose } from './aiChatBridge';` (line 3), add:

```tsx
import { registerAIToggle, registerAIClose } from './aiChatBridge';
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
```

- [ ] **Step 2: Gate the toggle**

Find (around line 566):

```tsx
  const toggle = useCallback(() => setOpen(o => !o), []);
  const close  = useCallback(() => setOpen(false), []);
```

Replace with:

```tsx
  const plan = usePlan();
  const toggle = useCallback(() => {
    setOpen(o => {
      if (o) return false; // always allow closing
      if (!canUseFeature(plan, 'ai')) {
        requestUpgrade({ feature: 'ai' });
        return false;
      }
      return true;
    });
  }, [plan]);
  const close  = useCallback(() => setOpen(false), []);
```

- [ ] **Step 3: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i AIChat`
Expected: no output.

- [ ] **Step 4: Manual verification**

With `npm run dev` running: log in with a demo account (demo sessions read as plan `'agence'` — Assistant IA should open normally via the `I` keyboard shortcut or its sidebar/topbar toggle button). To verify the *blocked* path, temporarily edit `getCurrentPlan()` in `app/src/data/planStore.ts` to `return 'gratuit';` unconditionally, reload, press `I` — expect the upgrade modal to appear instead of the AI panel opening. Revert the temporary edit afterward (do not commit it).

- [ ] **Step 5: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/components/AIChat.tsx
git commit -m "feat(billing): gate Assistant IA panel behind plan check"
```

---

### Task 5: Gate Finances

**Files:**
- Modify: `app/src/screens/Finances.tsx:1-14` (imports), `:942-971` (component body)

**Interfaces:**
- Consumes: `usePlan()` (Task 2), `canUseFeature()` (Task 1).

- [ ] **Step 1: Add imports**

In `app/src/screens/Finances.tsx`, after the existing imports (after line 14 `import { subscribeUploadStatus } from '../data/fileContentStore';`), add:

```tsx
import { Link } from 'react-router-dom';
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
```

- [ ] **Step 2: Add the locked-state component**

Immediately before `export function Finances() {` (line 942), add:

```tsx
function FinancesLocked() {
  const { t } = useTranslation();
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SFIcon name="lock" size={24} color="var(--accent)" />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--ff-display)', marginBottom: 8 }}>{t('finances.lockedTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('finances.lockedBody')}</p>
      </div>
      <Link to="/parametres?section=plan" style={{ padding: '11px 20px', borderRadius: 9, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: 'var(--ff-text)' }}>
        {t('finances.lockedCta')}
      </Link>
    </div>
  );
}

```

- [ ] **Step 3: Gate the page**

Find (around line 959, immediately after the existing `useEffect`):

```tsx
  useEffect(() => subscribeInvoices(() => setInvoices(getInvoices())), []);

  const allClients  = getClients();
```

Replace with:

```tsx
  useEffect(() => subscribeInvoices(() => setInvoices(getInvoices())), []);

  const plan = usePlan();
  if (!canUseFeature(plan, 'finances')) {
    return <FinancesLocked />;
  }

  const allClients  = getClients();
```

- [ ] **Step 4: Add translation keys**

In `app/src/locales/fr.json`, inside the `finances` namespace object (find `"finances": {`), add:

```json
    "lockedTitle": "Finances verrouillées",
    "lockedBody": "Le module Finances & facturation est disponible avec un plan payant. Passe à Studio ou Agence pour créer et suivre tes factures.",
    "lockedCta": "Voir les plans",
```

In `app/src/locales/en.json`, same namespace:

```json
    "lockedTitle": "Finances locked",
    "lockedBody": "The Finances & billing module is available on a paid plan. Upgrade to Studio or Agence to create and track invoices.",
    "lockedCta": "View plans",
```

- [ ] **Step 5: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i Finances`
Expected: no output.

- [ ] **Step 6: Manual verification**

With `npm run dev` running and logged in as a demo account, navigate to `/finances` — expect the normal Finances page (demo plan is `'agence'`). Temporarily force `getCurrentPlan()` in `planStore.ts` to `'gratuit'`, reload `/finances` directly (typing the URL, not clicking the nav) — expect the locked screen with the "Voir les plans" button, not the invoice table. Revert the temporary edit.

- [ ] **Step 7: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/screens/Finances.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(billing): gate Finances page behind plan check"
```

---

### Task 6: Gate custom template creation

**Files:**
- Modify: `app/src/screens/Modeles.tsx:13` (imports), `:2480-2481` (hook), `:2703-2707` (handleNew)

**Interfaces:**
- Consumes: `usePlan()` (Task 2), `canUseFeature()` (Task 1), `requestUpgrade()` (Task 3).

- [ ] **Step 1: Add imports**

In `app/src/screens/Modeles.tsx`, after line 13 (`import { getFavoriteTemplateIds, toggleTemplateFavorite, subscribeTemplateFavorites } from '../data/templateFavoritesStore';`), add:

```tsx
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
```

- [ ] **Step 2: Add the plan hook**

Find (line 2480-2481):

```tsx
export function Modeles() {
  const [typeFilter, setTypeFilter] = useState<UnifiedTypeFilter>('projets');
```

Replace with:

```tsx
export function Modeles() {
  const plan = usePlan();
  const [typeFilter, setTypeFilter] = useState<UnifiedTypeFilter>('projets');
```

- [ ] **Step 3: Gate `handleNew`**

Find (around line 2703):

```tsx
  const handleNew = () => {
    if (typeFilter === 'projets') { setPreviewTpl({ id: `tpl-${Date.now()}`, name: 'Nouveau modèle', description: '', color: '#6366f1', icon: 'layout-template', tags: [], sections: [], resources: [], builtIn: false, createdAt: new Date().toISOString().split('T')[0] }); }
    else if (typeFilter === 'formulaires') { setFormViewData({}); setFormViewOpen(true); }
    else { setResEditorData({ type: typeFilter }); setResEditorOpen(true); }
  };
```

Replace with:

```tsx
  const handleNew = () => {
    if (!canUseFeature(plan, 'customTemplates')) {
      requestUpgrade({ feature: 'customTemplates' });
      return;
    }
    if (typeFilter === 'projets') { setPreviewTpl({ id: `tpl-${Date.now()}`, name: 'Nouveau modèle', description: '', color: '#6366f1', icon: 'layout-template', tags: [], sections: [], resources: [], builtIn: false, createdAt: new Date().toISOString().split('T')[0] }); }
    else if (typeFilter === 'formulaires') { setFormViewData({}); setFormViewOpen(true); }
    else { setResEditorData({ type: typeFilter }); setResEditorOpen(true); }
  };
```

**Known limitation (documented, not silently dropped):** `Modeles.tsx` also has several "dupliquer un modèle prédéfini" / "modifier une copie" actions scattered through the file (each sets `builtIn: false` on a copy) that are not gated by this task — `handleNew` is the primary, most-used creation entry point. Gating every duplicate-as-copy affordance individually is left as a follow-up if it proves to be a real bypass in practice.

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i Modeles`
Expected: no output.

- [ ] **Step 5: Manual verification**

With `npm run dev` running, logged in as demo (plan `'agence'`), go to `/modeles`, click "Nouveau modèle" — expect the normal template editor to open. Temporarily force `getCurrentPlan()` to `'gratuit'` in `planStore.ts`, reload, click "Nouveau modèle" again — expect the upgrade modal instead of the editor. Revert the temporary edit.

- [ ] **Step 6: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/screens/Modeles.tsx
git commit -m "feat(billing): gate custom template creation behind plan check"
```

---

### Task 7: Gate project creation past the plan limit

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:16` (imports), `:685-694` (hook + handler), `:753,915,928` (call sites)

**Interfaces:**
- Consumes: `usePlan()` (Task 2), `PLAN_LIMITS` (Task 1), `requestUpgrade()` (Task 3), `getProjects()` (existing, from `app/src/data/projectStore.ts`).

- [ ] **Step 1: Add imports**

In `app/src/components/ProjectsListView.tsx`, after line 16 (`import { getTeamMembers } from '../data/teamStore';`), add:

```tsx
import { usePlan } from '../data/planStore';
import { PLAN_LIMITS } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
```

- [ ] **Step 2: Extend `UpgradeReason` with a `'projects'` reason**

`upgradePromptStore.ts`'s `UpgradeReason` type only covers `{ feature: GatedFeature }` and `{ reason: 'seats' }` — there's no "projects" reason yet. Extend it:

In `app/src/data/upgradePromptStore.ts`, change:

```ts
export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' };
```

to:

```ts
export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' } | { reason: 'projects' };
```

In `app/src/components/UpgradePromptModal.tsx`, change:

```tsx
  const isSeats = 'reason' in prompt && prompt.reason === 'seats';
  const title = isSeats ? t('upgradePrompt.seatsTitle') : t('upgradePrompt.featureTitle');
  const body = isSeats
    ? t('upgradePrompt.seatsBody')
    : t('upgradePrompt.featureBody', { feature: t(FEATURE_LABEL_KEYS[(prompt as { feature: GatedFeature }).feature]) });
```

to:

```tsx
  const reason = 'reason' in prompt ? prompt.reason : null;
  const title = reason === 'seats' ? t('upgradePrompt.seatsTitle')
    : reason === 'projects' ? t('upgradePrompt.projectsTitle')
    : t('upgradePrompt.featureTitle');
  const body = reason === 'seats' ? t('upgradePrompt.seatsBody')
    : reason === 'projects' ? t('upgradePrompt.projectsBody')
    : t('upgradePrompt.featureBody', { feature: t(FEATURE_LABEL_KEYS[(prompt as { feature: GatedFeature }).feature]) });
```

Add to `app/src/locales/fr.json`'s `upgradePrompt` namespace (added in Task 3):

```json
    "projectsTitle": "Limite de projets atteinte",
    "projectsBody": "Le plan Gratuit permet 3 projets actifs à la fois. Passe à Studio pour créer des projets illimités.",
```

Add to `app/src/locales/en.json`'s `upgradePrompt` namespace:

```json
    "projectsTitle": "Project limit reached",
    "projectsBody": "The Gratuit plan allows 3 active projects at a time. Upgrade to Studio for unlimited projects.",
```

- [ ] **Step 3: Add the plan hook and a shared open-modal handler**

In `app/src/components/ProjectsListView.tsx`, find (line 685-687):

```tsx
export function ProjectsListView({ clientId, autoOpen, onModalClose }: { clientId?: string; autoOpen?: boolean; onModalClose?: () => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
```

Replace with:

```tsx
export function ProjectsListView({ clientId, autoOpen, onModalClose }: { clientId?: string; autoOpen?: boolean; onModalClose?: () => void }) {
  const { t } = useTranslation();
  const plan = usePlan();
  const [search, setSearch] = useState('');
```

Then find (line 693-694, right after the `sortOpen` state, before other state):

```tsx
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
```

Add immediately after it:

```tsx
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);

  const openNewProjectModal = () => {
    const maxProjects = PLAN_LIMITS[plan].maxProjects;
    const activeCount = getProjects().filter(p => !p.archived).length;
    if (maxProjects !== null && activeCount >= maxProjects) {
      requestUpgrade({ reason: 'projects' });
      return;
    }
    setShowModal(true);
  };
```

- [ ] **Step 4: Replace the three `setShowModal(true)` call sites**

In `app/src/components/ProjectsListView.tsx`, find each of the three occurrences and replace `setShowModal(true)` with `openNewProjectModal()`:

Line 753: `<SFButton variant="primary" icon="plus" onClick={() => setShowModal(true)}>{t('projects.newProject')}</SFButton>` → `onClick={() => openNewProjectModal()}`

Line 915: same pattern → `onClick={() => openNewProjectModal()}`

Line 928: `<SFButton variant="ghost" icon="plus" onClick={() => setShowModal(true)}>{t('projects.newProject')}</SFButton>` → `onClick={() => openNewProjectModal()}`

Leave line 707 (`if (autoOpen) { setShowModal(true); onModalClose?.(); }`) unchanged — `autoOpen` is triggered from a client detail page's own "create project for this client" flow, which is out of scope for this task's manual verification but will still hit the same modal since `NewProjectModal`'s `onCreate` isn't what's being limited here (the limit is on opening the modal, not on the modal's submit — acceptable given `autoOpen` is a narrow secondary entry point; note as known gap alongside Task 6's).

- [ ] **Step 5: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -iE "ProjectsListView|upgradePrompt|UpgradePromptModal"`
Expected: no output.

- [ ] **Step 6: Manual verification**

With `npm run dev` running, logged in as demo (plan `'agence'`, unlimited projects) — click "Nouveau projet" repeatedly, confirm the modal opens every time regardless of how many projects exist. Temporarily force `getCurrentPlan()` to `'gratuit'` in `planStore.ts`. If the demo account has 3+ non-archived projects already (check via `/projets`), clicking "Nouveau projet" should now show the upgrade modal ("Limite de projets atteinte") instead of the create-project modal. Revert the temporary edit.

- [ ] **Step 7: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/components/ProjectsListView.tsx app/src/data/upgradePromptStore.ts app/src/components/UpgradePromptModal.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(billing): gate project creation past the plan's active-project limit"
```

---

### Task 8: Gate team invites past the seat limit

**Files:**
- Modify: `app/src/screens/MonEquipe.tsx:9` (imports), `:309-322` (hook + handler), `:334,386` (call sites)

**Interfaces:**
- Consumes: `usePlan()` (Task 2), `getCurrentBillingSeats()` (Task 2), `PLAN_LIMITS` (Task 1), `requestUpgrade()` (Task 3).

- [ ] **Step 1: Add imports**

In `app/src/screens/MonEquipe.tsx`, after line 9 (`import { getTeamMembers, subscribeTeam, createInvitation } from '../data/teamStore';`), add:

```tsx
import { usePlan, getCurrentBillingSeats } from '../data/planStore';
import { PLAN_LIMITS } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
```

- [ ] **Step 2: Extend `UpgradeReason` with a `'membersGratuit'` reason**

Extend `UpgradeReason` again (Task 7 already added `'projects'`):

In `app/src/data/upgradePromptStore.ts`, change:

```ts
export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' } | { reason: 'projects' };
```

to:

```ts
export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' } | { reason: 'projects' } | { reason: 'membersGratuit' };
```

In `app/src/components/UpgradePromptModal.tsx`, change:

```tsx
  const reason = 'reason' in prompt ? prompt.reason : null;
  const title = reason === 'seats' ? t('upgradePrompt.seatsTitle')
    : reason === 'projects' ? t('upgradePrompt.projectsTitle')
    : t('upgradePrompt.featureTitle');
  const body = reason === 'seats' ? t('upgradePrompt.seatsBody')
    : reason === 'projects' ? t('upgradePrompt.projectsBody')
    : t('upgradePrompt.featureBody', { feature: t(FEATURE_LABEL_KEYS[(prompt as { feature: GatedFeature }).feature]) });
```

to:

```tsx
  const reason = 'reason' in prompt ? prompt.reason : null;
  const title = reason === 'seats' ? t('upgradePrompt.seatsTitle')
    : reason === 'projects' ? t('upgradePrompt.projectsTitle')
    : reason === 'membersGratuit' ? t('upgradePrompt.membersGratuitTitle')
    : t('upgradePrompt.featureTitle');
  const body = reason === 'seats' ? t('upgradePrompt.seatsBody')
    : reason === 'projects' ? t('upgradePrompt.projectsBody')
    : reason === 'membersGratuit' ? t('upgradePrompt.membersGratuitBody')
    : t('upgradePrompt.featureBody', { feature: t(FEATURE_LABEL_KEYS[(prompt as { feature: GatedFeature }).feature]) });
```

Add to `app/src/locales/fr.json`'s `upgradePrompt` namespace:

```json
    "membersGratuitTitle": "Limite de membres atteinte",
    "membersGratuitBody": "Le plan Gratuit permet 2 membres d'équipe. Passe à Studio ou Agence pour inviter plus de monde.",
```

Add to `app/src/locales/en.json`'s `upgradePrompt` namespace:

```json
    "membersGratuitTitle": "Member limit reached",
    "membersGratuitBody": "The Gratuit plan allows 2 team members. Upgrade to Studio or Agence to invite more people.",
```

- [ ] **Step 3: Add the plan hook and a shared open-invite handler**

In `app/src/screens/MonEquipe.tsx`, find (line 309-320):

```tsx
export function MonEquipe() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);

  const team = isDemoSession() ? INTERNAL_TEAM : getRealTeam();
```

Replace with:

```tsx
export function MonEquipe() {
  const { t } = useTranslation();
  const plan = usePlan();
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);

  const team = isDemoSession() ? INTERNAL_TEAM : getRealTeam();

  const openInviteModal = () => {
    // Gratuit has no paid seats at all — hard cap at PLAN_LIMITS.gratuit.maxSeats (2).
    // Studio/Agence: the real ceiling is what's already been purchased via billing,
    // not the plan's maximum — buying more seats (chantier A) raises this.
    const seatLimit = plan === 'gratuit' ? PLAN_LIMITS.gratuit.maxSeats : getCurrentBillingSeats();
    if (team.length >= seatLimit) {
      requestUpgrade(plan === 'gratuit' ? { reason: 'membersGratuit' } : { reason: 'seats' });
      return;
    }
    setShowInvite(true);
  };
```

- [ ] **Step 4: Replace the two `setShowInvite(true)` call sites**

In `app/src/screens/MonEquipe.tsx`:

Line 334: `<SFButton variant="primary" icon="user-plus" onClick={() => setShowInvite(true)}>{t('team.inviteMember')}</SFButton>` → `onClick={() => openInviteModal()}`

Line 386: same pattern → `onClick={() => openInviteModal()}`

- [ ] **Step 5: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -iE "MonEquipe|upgradePrompt|UpgradePromptModal"`
Expected: no output.

- [ ] **Step 6: Manual verification**

With `npm run dev` running, logged in as demo (plan `'agence'`, `getCurrentBillingSeats()` returns 50) — go to `/equipe` (or wherever `MonEquipe` is routed), click "Inviter" — expect the invite modal to open normally. Temporarily force `getCurrentPlan()` to `'gratuit'` in `planStore.ts` and reload — if the demo team already has 2+ members (check the team list), clicking "Inviter" should show the upgrade modal ("Limite de membres atteinte") instead. Revert the temporary edit.

- [ ] **Step 7: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/screens/MonEquipe.tsx app/src/data/upgradePromptStore.ts app/src/components/UpgradePromptModal.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(billing): gate team invites past the plan's seat limit"
```

---

### Task 9: Gate custom logo upload

**Files:**
- Modify: `app/src/screens/Parametres.tsx:11` (imports), `:24-86` (`LogoUploader`), `:1416` area (hook), `:1743-1761` (call sites)

**Interfaces:**
- Consumes: `usePlan()` (Task 2), `canUseFeature()` (Task 1), `requestUpgrade()` (Task 3).

- [ ] **Step 1: Add imports**

In `app/src/screens/Parametres.tsx`, after line 11 (`import { getLogoFull, getLogoSquare, setLogoFull, setLogoSquare } from '../data/studioLogoStore';`), add:

```tsx
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
```

- [ ] **Step 2: Add a `locked` prop to `LogoUploader`**

Find (line 24-42):

```tsx
function LogoUploader({ label, hint, aspectLabel, previewW, previewH, getter, setter }: {
  label: string; hint: string; aspectLabel: string; previewW: number; previewH: number;
  getter: () => string | null; setter: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(getter);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setSrc(dataUrl);
      setter(dataUrl);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-2)', fontWeight: 600 }}>{label}</p>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          borderRadius: 9, border: `1.5px dashed ${src ? 'var(--accent)' : 'var(--border-2)'}`,
          background: 'var(--surface-2)', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '20px 12px', minHeight: 96, position: 'relative',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { if (!src) (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-3)'; }}
        onMouseLeave={e => { if (!src) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
      >
```

Replace with:

```tsx
function LogoUploader({ label, hint, aspectLabel, previewW, previewH, getter, setter, locked, onLockedClick }: {
  label: string; hint: string; aspectLabel: string; previewW: number; previewH: number;
  getter: () => string | null; setter: (v: string | null) => void;
  locked?: boolean; onLockedClick?: () => void;
}) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(getter);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setSrc(dataUrl);
      setter(dataUrl);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: locked ? 0.5 : 1 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-2)', fontWeight: 600 }}>{label}</p>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      <div
        onClick={() => { if (locked) { onLockedClick?.(); return; } inputRef.current?.click(); }}
        style={{
          borderRadius: 9, border: `1.5px dashed ${src ? 'var(--accent)' : 'var(--border-2)'}`,
          background: 'var(--surface-2)', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '20px 12px', minHeight: 96, position: 'relative',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { if (!src && !locked) (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-3)'; }}
        onMouseLeave={e => { if (!src && !locked) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
      >
        {locked && (
          <div style={{ position: 'absolute', top: 6, right: 6 }}>
            <SFIcon name="lock" size={12} color="var(--text-3)" />
          </div>
        )}
```

(The remaining JSX inside this `<div>` — the `{src ? (...) : (...)}` block and the closing tags — is unchanged; only the opening `<div>` wrapper and its `onClick`/hover handlers change, plus the new lock icon inserted right after it.)

- [ ] **Step 3: Add the plan hook to the main `Parametres()` component**

Find the start of `export function Parametres()` (around line 1416, where `activeSection` is declared per Task 3 Step 5). Immediately after that `useState` block, add:

```tsx
  const plan = usePlan();
```

- [ ] **Step 4: Pass `locked`/`onLockedClick` at both call sites**

Find (around line 1743-1761):

```tsx
                <LogoUploader
                  label={t('settings.fullLogo')}
                  hint={t('settings.fullLogoHint')}
                  aspectLabel={t('settings.aspectHorizontal')}
                  previewW={140}
                  previewH={48}
                  getter={getLogoFull}
                  setter={setLogoFull}
                />
                {/* Icône carrée */}
                <LogoUploader
                  label={t('settings.squareLogo')}
                  hint={t('settings.squareLogoHint')}
                  aspectLabel={t('settings.aspectSquare')}
                  previewW={48}
                  previewH={48}
                  getter={getLogoSquare}
                  setter={setLogoSquare}
                />
```

Replace with:

```tsx
                <LogoUploader
                  label={t('settings.fullLogo')}
                  hint={t('settings.fullLogoHint')}
                  aspectLabel={t('settings.aspectHorizontal')}
                  previewW={140}
                  previewH={48}
                  getter={getLogoFull}
                  setter={setLogoFull}
                  locked={!canUseFeature(plan, 'customLogo')}
                  onLockedClick={() => requestUpgrade({ feature: 'customLogo' })}
                />
                {/* Icône carrée */}
                <LogoUploader
                  label={t('settings.squareLogo')}
                  hint={t('settings.squareLogoHint')}
                  aspectLabel={t('settings.aspectSquare')}
                  previewW={48}
                  previewH={48}
                  getter={getLogoSquare}
                  setter={setLogoSquare}
                  locked={!canUseFeature(plan, 'customLogo')}
                  onLockedClick={() => requestUpgrade({ feature: 'customLogo' })}
                />
```

- [ ] **Step 5: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i Parametres`
Expected: no output.

- [ ] **Step 6: Manual verification**

With `npm run dev` running, logged in as demo (plan `'agence'`) — go to Paramètres → Infos studio, click a logo dropzone — expect the native file picker to open normally, no lock icon shown. Temporarily force `getCurrentPlan()` to `'gratuit'` in `planStore.ts`, reload — expect both logo dropzones to appear dimmed (50% opacity) with a small lock icon in the corner, and clicking one opens the upgrade modal instead of a file picker. Revert the temporary edit.

- [ ] **Step 7: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/screens/Parametres.tsx
git commit -m "feat(billing): gate custom logo upload behind plan check"
```

---

### Task 10: Dedup plan copy — fix Gratuit member count, consume `planFeatures.ts`

**Files:**
- Modify: `app/src/screens/Parametres.tsx` (`PLATFORM_PLANS` features arrays)
- Modify: `app/src/screens/Pricing.tsx` (`PLANS` array — no structural change needed, verify consistency only)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (fix Gratuit member copy)

**Interfaces:**
- Consumes: `PLAN_FEATURES` (Task 1) to eliminate the duplicated `included: true/false` booleans in `PLATFORM_PLANS`.

- [ ] **Step 1: Fix the Gratuit member-count copy**

In `app/src/locales/fr.json`, find:

```json
    "planFeat5Members": "Jusqu'à 5 membres d'équipe",
```

Replace with:

```json
    "planFeat5Members": "Jusqu'à 2 membres d'équipe",
```

In `app/src/locales/en.json`, find the equivalent key (`planFeat5Members`) and change its English text from "Up to 5 team members" to "Up to 2 team members".

- [ ] **Step 2: Make `PLATFORM_PLANS` in `Parametres.tsx` consume `PLAN_FEATURES`**

In `app/src/screens/Parametres.tsx`, find the `PLATFORM_PLANS` array (around line 933). For the `gratuit` entry's `features` array, find:

```tsx
    features: [
      { labelKey: 'settings.planFeat3Projects',      included: true  },
      { labelKey: 'settings.planFeat5Members',        included: true  },
      { labelKey: 'settings.planFeatPortalBranded',   included: true  },
      { labelKey: 'settings.planFeatTemplatesPreset', included: true  },
      { labelKey: 'settings.planFeatTemplatesCustom', included: false },
      { labelKey: 'settings.planFeatAI',              included: false },
      { labelKey: 'settings.planFeatFinances',        included: false },
    ],
```

Replace with:

```tsx
    features: [
      { labelKey: 'settings.planFeat3Projects',      included: true  },
      { labelKey: 'settings.planFeat5Members',        included: true  },
      { labelKey: 'settings.planFeatPortalBranded',   included: true  },
      { labelKey: 'settings.planFeatTemplatesPreset', included: true  },
      { labelKey: 'settings.planFeatTemplatesCustom', included: PLAN_FEATURES.gratuit.customTemplates },
      { labelKey: 'settings.planFeatAI',              included: PLAN_FEATURES.gratuit.ai },
      { labelKey: 'settings.planFeatFinances',        included: PLAN_FEATURES.gratuit.finances },
    ],
```

For the `studio` entry's `features` array, find:

```tsx
    features: [
      { labelKey: 'settings.planFeatUnlimitedProjects', included: true },
      { labelKey: 'settings.planFeatUpTo10Members',     included: true },
      { labelKey: 'settings.planFeatPortalWhiteLabel',  included: true },
      { labelKey: 'settings.planFeatTemplatesPreset',   included: true },
      { labelKey: 'settings.planFeatTemplatesCustom',   included: true },
      { labelKey: 'settings.planFeatAI',                included: true },
      { labelKey: 'settings.planFeatFinances',          included: true },
    ],
```

Replace with:

```tsx
    features: [
      { labelKey: 'settings.planFeatUnlimitedProjects', included: true },
      { labelKey: 'settings.planFeatUpTo10Members',     included: true },
      { labelKey: 'settings.planFeatPortalWhiteLabel',  included: true },
      { labelKey: 'settings.planFeatTemplatesPreset',   included: true },
      { labelKey: 'settings.planFeatTemplatesCustom',   included: PLAN_FEATURES.studio.customTemplates },
      { labelKey: 'settings.planFeatAI',                included: PLAN_FEATURES.studio.ai },
      { labelKey: 'settings.planFeatFinances',          included: PLAN_FEATURES.studio.finances },
    ],
```

(Agence's features array is left as-is — it's driven by `planFeatEverythingStudio` plus two Agence-only bullets that aren't in `GatedFeature`, so there's nothing to dedup there.)

Add the import at the top of `Parametres.tsx`, alongside the other `../data/` imports near the top of the file (same block as Task 3/9's other new imports):

```tsx
import { PLAN_FEATURES } from '../data/planFeatures';
```

- [ ] **Step 3: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i Parametres`
Expected: no output.

- [ ] **Step 4: Manual verification**

With `npm run dev` running, go to Paramètres → Plan → onglet Abonnement, look at the Solo (Gratuit) plan card — expect the feature list to say "Jusqu'à 2 membres d'équipe" (not 5), and the IA/Finances/Modèles personnalisés rows to show the ❌ icon (matches `PLAN_FEATURES.gratuit`). Switch to the Studio card — expect those same three rows to show ✅.

- [ ] **Step 5: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/screens/Parametres.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "fix(billing): correct Gratuit member-count copy, drive PLATFORM_PLANS feature flags from planFeatures.ts"
```

---

## Final check (after all 10 tasks)

- [ ] Run the full typecheck once more: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | wc -l` — compare the error count to the pre-existing baseline (~190) noted in Global Constraints; it should not have grown.
- [ ] Start `npm run dev`, log in as a demo account, and click through all 6 gated surfaces once more in sequence (AI toggle, `/finances`, `/modeles` "Nouveau modèle", "Nouveau projet", `/equipe` "Inviter", Paramètres logo upload) to confirm none of them regressed for the permissive (demo/Agence) case — this is the fastest way to catch a gate that's accidentally inverted (blocking everyone instead of only Gratuit).
