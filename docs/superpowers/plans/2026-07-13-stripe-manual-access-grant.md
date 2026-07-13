# Chantier C3 — Octroi manuel d'accès — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Alexis (the sole platform admin) grant a specific studio a paid plan for free, without touching Stripe, via a small hidden admin page.

**Architecture:** One Supabase migration (a new `manual_grant_note` column), two small serverless functions (search studios, set plan — both gated by an exact-email check, not a role system), and one new standalone route/page in the React app that calls them.

**Tech Stack:** Same as chantiers A/B/C1 — Vercel serverless functions (`@vercel/node`), Supabase (service role for the admin bypass), React 19 + TypeScript, react-router-dom.

## Global Constraints

- Admin identification is a hardcoded exact-email check (`user.email === ADMIN_EMAIL`), both client-side (for the page's UI gate) and server-side (for the two serverless functions — the real, unbypassable check). `ADMIN_EMAIL` value: `'alexismorel11@hotmail.ca'`.
- A manual grant only ever writes `studios.plan` and `studios.manual_grant_note` — never `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `billing_seats`, or `billing_storage_tier`. This is what keeps manual grants safe from ever being overwritten by (or overwriting) real Stripe webhook activity.
- No expiration/cron logic — an admin revokes access manually by setting the plan back to `'gratuit'` from the same page.
- No hard-coded UI strings rule does NOT apply to this page — it's an internal tool only Alexis will ever see, so plain French strings inline are fine (no `t()` needed, consistent with this being outside the customer-facing product).
- `npx tsc -p tsconfig.app.json --noEmit` is the typecheck command; the repo has ~170 pre-existing unrelated errors — only check your changed files introduce none.
- No automated test suite in this repo — verification is manual (dev server + one deployed round-trip).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `docs/superpowers/specs/2026-07-13-manual-grant-migration.sql` | new | Migration spec (manual execution in Supabase SQL Editor) — adds `manual_grant_note`. |
| `app/api/admin-search-studios.ts` | new | Serverless function: admin-only, searches `studios` by name. |
| `app/api/admin-set-plan.ts` | new | Serverless function: admin-only, sets a studio's `plan` + `manual_grant_note`. |
| `app/src/screens/AdminStudios.tsx` | new | The hidden `/admin/studios` page: search, select, change plan, save. |
| `app/src/main.tsx` | modify | Register the new `/admin/studios` route. |

---

### Task 1: Supabase migration (manual)

**Files:**
- Create: `docs/superpowers/specs/2026-07-13-manual-grant-migration.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- docs/superpowers/specs/2026-07-13-manual-grant-migration.sql
alter table studios
  add column if not exists manual_grant_note text;
```

- [ ] **Step 2: Commit the migration file**

```bash
cd "D:/Vibe Coding/Rush"
git add docs/superpowers/specs/2026-07-13-manual-grant-migration.sql
git commit -m "docs(billing): add manual_grant_note migration for chantier C3"
```

- [ ] **Step 3: Ask the user to run it manually**

This step cannot be automated — it requires pasting the SQL into Supabase's SQL Editor (same process as every prior migration in this project). Tell the user:

> Va dans Supabase → SQL Editor, colle et exécute le contenu de `docs/superpowers/specs/2026-07-13-manual-grant-migration.sql`, puis confirme que c'est fait.

Do not proceed to Task 2 until the user confirms the column exists (Task 2's endpoint will fail at runtime — though not at typecheck time, since Supabase's JS client isn't statically typed against the schema in this project — if the column is missing).

---

### Task 2: Admin serverless functions

**Files:**
- Create: `app/api/admin-search-studios.ts`
- Create: `app/api/admin-set-plan.ts`

**Interfaces:**
- Produces: `POST /api/admin-search-studios` accepting `{ query: string }`, returning `{ studios: Array<{ id: string; name: string; plan: string; manual_grant_note: string | null }> }`.
- Produces: `POST /api/admin-set-plan` accepting `{ studioId: string; plan: 'gratuit' | 'studio' | 'agence'; note?: string }`, returning `{ ok: true }` on success.

- [ ] **Step 1: Create `admin-search-studios.ts`**

```ts
// app/api/admin-search-studios.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'alexismorel11@hotmail.ca';

interface SearchBody {
  query: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { query } = req.body as SearchBody;
  if (typeof query !== 'string') {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

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

  if (user.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('studios')
    .select('id, name, plan, manual_grant_note')
    .ilike('name', `%${query}%`)
    .limit(20);

  if (error) {
    console.error('Failed to search studios:', error);
    res.status(500).json({ error: 'Failed to search studios' });
    return;
  }

  res.status(200).json({ studios: data ?? [] });
}
```

- [ ] **Step 2: Create `admin-set-plan.ts`**

```ts
// app/api/admin-set-plan.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'alexismorel11@hotmail.ca';

interface SetPlanBody {
  studioId: string;
  plan: 'gratuit' | 'studio' | 'agence';
  note?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, plan, note } = req.body as SetPlanBody;
  if (!studioId || (plan !== 'gratuit' && plan !== 'studio' && plan !== 'agence')) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

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

  if (user.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('studios')
    .update({ plan, manual_grant_note: note ?? null })
    .eq('id', studioId);

  if (error) {
    console.error('Failed to set studio plan:', error);
    res.status(500).json({ error: 'Failed to set studio plan' });
    return;
  }

  res.status(200).json({ ok: true });
}
```

- [ ] **Step 3: Typecheck against Vercel's stricter module resolution**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit --moduleResolution nodenext --module nodenext --target es2020 --esModuleInterop --skipLibCheck --ignoreConfig api/admin-search-studios.ts api/admin-set-plan.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/api/admin-search-studios.ts app/api/admin-set-plan.ts
git commit -m "feat(billing): add admin serverless functions for manual plan grants"
```

---

### Task 3: `/admin/studios` page

**Files:**
- Create: `app/src/screens/AdminStudios.tsx`
- Modify: `app/src/main.tsx` (add import + route)

**Interfaces:**
- Consumes: `getCurrentUser()` (`app/src/data/authStore.ts`, returns `AuthUser | null` with an `.email` field), `supabase` (`app/src/data/supabaseClient.ts`), `SFButton` (`app/src/components/ui`), the two endpoints from Task 2.

- [ ] **Step 1: Create `AdminStudios.tsx`**

```tsx
// app/src/screens/AdminStudios.tsx
import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser } from '../data/authStore';
import { supabase } from '../data/supabaseClient';
import { SFButton } from '../components/ui';

const ADMIN_EMAIL = 'alexismorel11@hotmail.ca';

interface StudioResult {
  id: string;
  name: string;
  plan: string;
  manual_grant_note: string | null;
}

export function AdminStudios() {
  const user = getCurrentUser();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudioResult[]>([]);
  const [selected, setSelected] = useState<StudioResult | null>(null);
  const [newPlan, setNewPlan] = useState<'gratuit' | 'studio' | 'agence'>('gratuit');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin-search-studios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ query: q }),
    });
    if (!res.ok) { setResults([]); return; }
    const data = await res.json();
    setResults(data.studios ?? []);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void search(query); }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const selectStudio = (s: StudioResult) => {
    setSelected(s);
    setNewPlan(s.plan as 'gratuit' | 'studio' | 'agence');
    setNote(s.manual_grant_note ?? '');
    setMessage(null);
  };

  const applyGrant = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-set-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ studioId: selected.id, plan: newPlan, note }),
      });
      if (!res.ok) throw new Error('Request failed');
      setMessage('Plan mis à jour.');
      setSelected({ ...selected, plan: newPlan, manual_grant_note: note });
    } catch (err) {
      console.error('Failed to set plan', err);
      setMessage('Échec de la mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Accès refusé.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, maxWidth: 640, margin: '0 auto', fontFamily: 'var(--ff-text)' }}>
      <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
        Octroi manuel d'accès
      </h1>

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher un studio par nom…"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, marginBottom: 16,
          boxSizing: 'border-box',
        }}
      />

      {results.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
          {results.map(s => (
            <button
              key={s.id}
              onClick={() => selectStudio(s)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)',
                background: selected?.id === s.id ? 'var(--surface-3)' : 'var(--surface)',
                color: 'var(--text)', cursor: 'pointer', fontSize: 13, textAlign: 'left',
              }}>
              <span>{s.name}</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{s.plan}</span>
            </button>
          ))}
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>Aucun studio trouvé.</p>
      )}

      {selected && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 20, background: 'var(--surface)' }}>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{selected.name}</p>

          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
            Plan
          </label>
          <select
            value={newPlan}
            onChange={e => setNewPlan(e.target.value as 'gratuit' | 'studio' | 'agence')}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, marginBottom: 16,
              boxSizing: 'border-box',
            }}>
            <option value="gratuit">Gratuit</option>
            <option value="studio">Studio</option>
            <option value="agence">Agence</option>
          </select>

          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>
            Note (optionnelle)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Ex. Partenaire X — bêta gratuite"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, marginBottom: 16,
              resize: 'vertical', fontFamily: 'var(--ff-text)', boxSizing: 'border-box',
            }}
          />

          <SFButton variant="primary" onClick={applyGrant} disabled={saving}>
            {saving ? 'Application…' : 'Appliquer'}
          </SFButton>

          {message && (
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 12 }}>{message}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the route**

In `app/src/main.tsx`, add the import next to the other screen imports (e.g. right after the `Pricing` import — find `import { Pricing } from './screens/Pricing';`):

```tsx
import { Pricing } from './screens/Pricing';
import { AdminStudios } from './screens/AdminStudios';
```

Then add the route as a standalone top-level entry (not nested under the `/` `AppShell` route, so it renders without the sidebar) — find the `{ path: '/pricing', element: <Pricing /> },` line and add immediately after it:

```tsx
  { path: '/pricing', element: <Pricing /> },
  { path: '/admin/studios', element: <AdminStudios />, loader: authLoader },
```

(`authLoader` is already imported/defined in this file and used by the `/onboarding` route — it ensures only a logged-in user can reach the page at all, before the component's own `isAdmin` check runs.)

- [ ] **Step 3: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -iE "AdminStudios|main.tsx"`
Expected: no output.

- [ ] **Step 4: Manual verification (dev server)**

Run `npm run dev` from `app/`, log in with any account, navigate to `http://localhost:5188/admin/studios`.
- If logged in as a demo account or any account whose email isn't `alexismorel11@hotmail.ca`, confirm the page shows "Accès refusé." and nothing else.
- This confirms the client-side gate works; the real (server-side) gate is verified in Task 4 against the deployed app with the real admin account.

- [ ] **Step 5: Commit**

```bash
cd "D:/Vibe Coding/Rush"
git add app/src/screens/AdminStudios.tsx app/src/main.tsx
git commit -m "feat(billing): add hidden /admin/studios page for manual plan grants"
```

---

### Task 4: End-to-end verification (manual, against the deployed app)

**Files:** none (manual verification only)

- [ ] **Step 1: Confirm the migration landed**

In Supabase → Table Editor → `studios`, confirm the `manual_grant_note` column exists (from Task 1).

- [ ] **Step 2: Verify admin access works, non-admin access doesn't**

1. Log in to `https://rush-jet.vercel.app` with the real admin account (`alexismorel11@hotmail.ca`) and navigate to `/admin/studios` — confirm the search box and page render (not "Accès refusé").
2. Log in with a different account (e.g. a demo account or a second real test account) and navigate to the same URL — confirm it shows "Accès refusé."

- [ ] **Step 3: Verify a real grant round-trip**

1. As the admin, search for a real studio by name (e.g. one of the test studios used in chantier A/B/C1 verification).
2. Select it, change the plan (e.g. to "Studio"), add a note, click "Appliquer" — confirm the success message appears.
3. Log in as that studio's own account, go to Paramètres → Plan — confirm the plan now shows as the one just granted, with no Stripe checkout ever having occurred.
4. Confirm in Supabase → Table Editor → `studios` that `stripe_customer_id` and `stripe_subscription_id` are unchanged (still whatever they were before — null if this studio never had a real subscription) — this confirms the manual grant didn't fabricate fake Stripe linkage.
5. Return to `/admin/studios`, select the same studio again, set the plan back to "Gratuit" to leave the test studio in a clean state (unless you want to keep it granted for real use).
