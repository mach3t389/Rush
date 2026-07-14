# Multi-organization Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person belong to more than one Rush organisation, switch between them, join a second one via a fixed invitation flow, and leave one voluntarily — without breaking the single-organisation behavior every existing account already relies on.

**Architecture:** Relax one database constraint so a person can have more than one `studio_members` row; change `getStudioId()` from "the one row" to "the row the browser currently has active, remembered in localStorage, verified against real membership on every resolve"; switching organisations is a full page reload into `/`, not a live in-memory swap, because ~19 independent data stores each cache their studio-scoped data once per tab and safely invalidating all of them live is not worth the risk. Four serverless functions were suspected to need a matching change; research during planning found only one (`ai-chat.ts`) actually does.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + Auth), Vercel serverless functions, react-i18next. No automated test suite — this project verifies changes by running the app in the browser (per `CLAUDE.md`), so every task's "test" step is a manual walkthrough in the dev server, not a unit test.

## Global Constraints

- No hard-coded user-facing text — everything goes through `t('namespace.key')`, added to both `app/src/locales/fr.json` and `app/src/locales/en.json` (except `app/src/screens/DocumentReview.tsx`, which has no i18n at all by pre-existing convention and is not touched by this plan).
- Never use `<input type="date">` — not relevant to this feature, no date pickers involved.
- Supabase migrations are **specs, not applied automatically** — every `.sql` file must be pasted into the Supabase SQL editor by the user manually. Nothing in this plan can be verified end-to-end until Task 1's migration has actually been run.
- Organisation switching must never try to preserve the current route — always reload to `/`.
- The organisation switcher and "leave organisation" UI must not appear for demo sessions (`isDemoSession()` from `app/src/data/authStore.ts`).
- Follow existing patterns in this codebase: inline `style={{}}` (not Tailwind), CSS tokens from `index.css` (`var(--accent)`, `var(--surface)`, etc.), `SFIcon`/`SFButton`/`SFModal` primitives from `app/src/components/ui`.

---

### Task 1: Database migration — allow multiple organisations per person

**Files:**
- Create: `docs/superpowers/specs/2026-07-13-multi-org-migration.sql`

**Interfaces:**
- Produces: a `studio_members` table where `(user_id, studio_id)` is unique instead of `user_id` alone, and a `studios` select policy that lets any member (not just the owner) read their organisation's row.

- [ ] **Step 1: Write the migration file**

```sql
-- Multi-organization support: allow a person to belong to more than one
-- organisation. Run once in the Supabase SQL editor, BEFORE any of the
-- application code in this feature is deployed — the code assumes a person
-- can have more than one studio_members row, which the database currently
-- forbids outright.

-- 1. Relax the uniqueness rule on studio_members: today it's unique on
--    user_id alone (confirmed by insertOwnerMembership()'s use of
--    `onConflict: 'user_id'` in studioStore.ts), which physically prevents
--    a second membership row for the same person. Replace it with a
--    composite uniqueness on (user_id, studio_id) — one row per person PER
--    organisation, not per person overall.
--
--    IMPORTANT: the exact constraint name below (studio_members_user_id_key)
--    is Postgres's default naming for a single-column unique constraint
--    added via `unique` in a `create table` statement, which is how this
--    table was originally defined. Before running this, check it's correct:
--    in the Supabase dashboard, go to Database → Tables → studio_members →
--    scroll to "Constraints", and confirm the unique constraint on user_id
--    has this exact name. If it's different, replace it in the command
--    below before running.
alter table studio_members drop constraint if exists studio_members_user_id_key;
alter table studio_members add constraint studio_members_user_id_studio_id_key unique (user_id, studio_id);

-- 2. Let any member read their own organisation's row, not just the owner.
--    Today `studios_select_own` (2026-07-04-projects-supabase-migration)
--    only allows `owner_user_id = auth.uid()` — an invited (non-owner)
--    member's browser can't read their own organisation's name, plan, or
--    logo at all. This was already a pre-existing gap (affects
--    getStudioInfo()/planStore.ts for every non-owner real-session member
--    today), surfaced now because the organisation switcher needs every
--    member to see their orgs' names, not just owners. This ADDS a policy;
--    Postgres OR's multiple permissive policies together, so the existing
--    owner-only policy is untouched and this only ever grants MORE access.
create policy "studios_select_member" on studios for select
  using (id in (select studio_id from studio_members where user_id = auth.uid()));
```

- [ ] **Step 2: Ask the user to run it**

Tell the user: "Please paste and run `docs/superpowers/specs/2026-07-13-multi-org-migration.sql` in the Supabase SQL editor before I continue — the rest of this feature depends on it." Wait for confirmation before starting Task 2.

- [ ] **Step 3: Verify manually**

Once the user confirms it ran, verify with a quick read-only check — ask the user to run this in the Supabase SQL editor and confirm it returns a row:

```sql
select conname from pg_constraint
where conrelid = 'studio_members'::regclass
and contype = 'u';
```

Expected: a row named `studio_members_user_id_studio_id_key` (not `studio_members_user_id_key`).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-13-multi-org-migration.sql
git commit -m "docs: add multi-organization Supabase migration spec"
```

---

### Task 2: `studioStore.ts` — multi-organization core logic

**Files:**
- Modify: `app/src/data/studioStore.ts:1-100` (the `getStudioId`/`resolveStudioId`/`insertOwnerMembership` section)

**Interfaces:**
- Consumes: `supabase` client from `./supabaseClient`, `isDemoSession`/`onLogout` from `./authStore` (already imported).
- Produces (new exports, used by Tasks 3 and 4):
  - `interface MyOrganization { studioId: string; name: string; role: string }`
  - `listMyOrganizations(): Promise<MyOrganization[]>`
  - `switchActiveStudio(studioId: string): Promise<void>` — writes the new active org and reloads to `/`.
  - `createAdditionalStudio(name: string): Promise<string>` — creates a brand-new organisation for the current (already-logged-in) user, makes it active, returns its id. Caller is responsible for navigating/reloading afterward.
  - `leaveCurrentStudio(): Promise<MyOrganization[]>` — removes the current user's membership in the currently-active organisation, clears the cache, returns the caller's remaining organisations (empty array if none left).
  - Existing `getStudioId(): Promise<string>` keeps its exact signature, but now resolves "the active organisation," not "the only organisation."

- [ ] **Step 1: Replace the single-row resolution with multi-row-aware resolution, and factor out the studio-provisioning steps**

Read `app/src/data/studioStore.ts` first — this step replaces lines 1–95 (from the top of the file through the end of `resolveStudioId`) with the block below. Everything from `export function resetStudioIdCache` onward (the `StudioInfo` section) is unchanged and stays below this block.

```typescript
// Resolves the current real (non-demo) user's ACTIVE organisation, creating
// one on first access. Demo sessions never call this — see isDemoSession()
// in authStore.ts.
//
// A person can belong to more than one organisation (studio_members no
// longer enforces one row per user — see
// docs/superpowers/specs/2026-07-13-multi-org-migration.sql). "Active" means
// the one currently shown in the app, remembered per-browser in
// localStorage under a key scoped to the logged-in user's id, and
// re-validated against real membership on every resolve (so a stale value
// pointing at an organisation the user has since left never sticks).

import { supabase } from './supabaseClient';
import { isDemoSession, onLogout } from './authStore';

let cachedStudioId: string | null = null;
let inFlight: Promise<string> | null = null;

interface SupabaseUserLike {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

function activeStudioKey(userId: string): string {
  return `sf_active_studio_${userId}`;
}

async function insertOwnerMembership(studioId: string, user: SupabaseUserLike): Promise<void> {
  const fullName = (user.user_metadata?.full_name as string) || user.email || 'Moi';
  const parts = fullName.trim().split(' ').filter(Boolean);
  const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || '??';
  const { error } = await supabase.from('studio_members').upsert(
    {
      studio_id: studioId,
      user_id: user.id,
      name: fullName,
      email: user.email ?? '',
      role: 'Admin',
      initials,
      avatar_color: '#5B8AF5',
      is_owner: true,
    },
    { onConflict: 'user_id,studio_id' }
  );
  if (error) console.error('insertOwnerMembership failed', error);
}

// Shared by first-time signup (resolveStudioId's fallback) and the
// "Créer une organisation" switcher action — creates the studios row, the
// owner's membership row, and seeds built-in event types.
async function provisionNewStudio(name: string, user: SupabaseUserLike): Promise<string> {
  const { data: created, error: insertError } = await supabase
    .from('studios')
    .insert({ owner_user_id: user.id, name })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await insertOwnerMembership(created.id, user);
  const { seedBuiltInEventTypes } = await import('./eventTypeStore');
  await seedBuiltInEventTypes(created.id);
  return created.id;
}

export async function getStudioId(): Promise<string> {
  if (cachedStudioId) return cachedStudioId;
  if (!inFlight) {
    inFlight = resolveStudioId().finally(() => { inFlight = null; });
  }
  return inFlight;
}

async function resolveStudioId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('getStudioId called without an authenticated Supabase user');

  // 1. Every organisation this person currently belongs to.
  const { data: memberships, error: memberError } = await supabase
    .from('studio_members')
    .select('studio_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (memberError) throw memberError;

  if (memberships && memberships.length > 0) {
    const key = activeStudioKey(user.id);
    const remembered = localStorage.getItem(key);
    const stillMember = !!remembered && memberships.some(m => m.studio_id === remembered);
    const chosen = stillMember ? remembered! : memberships[0].studio_id;
    localStorage.setItem(key, chosen);
    cachedStudioId = chosen;
    return chosen;
  }

  // 2. Legacy path: a studio already exists for this user as owner, created
  //    before studio_members existed. Backfill the missing owner row so they
  //    show up in their own team roster from now on.
  const { data: existing, error: selectError } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    await insertOwnerMembership(existing.id, user);
    cachedStudioId = existing.id;
    localStorage.setItem(activeStudioKey(user.id), existing.id);
    return existing.id;
  }

  // 3. Brand-new user: create the studio and its owner membership row together.
  const studioName = (user.user_metadata?.studio_name as string) || 'Mon studio';
  const created = await provisionNewStudio(studioName, user);
  cachedStudioId = created;
  localStorage.setItem(activeStudioKey(user.id), created);
  return created;
}

export interface MyOrganization {
  studioId: string;
  name: string;
  role: string;
}

// Every organisation the current user belongs to, for the sidebar switcher.
// Two queries rather than a single embedded select — reliable regardless of
// how PostgREST infers (or doesn't infer) the studio_members → studios
// foreign-key relationship.
export async function listMyOrganizations(): Promise<MyOrganization[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships, error } = await supabase
    .from('studio_members')
    .select('studio_id, role')
    .eq('user_id', user.id);

  if (error || !memberships || memberships.length === 0) return [];

  const studioIds = memberships.map(m => m.studio_id);
  const { data: studios, error: studiosError } = await supabase
    .from('studios')
    .select('id, name')
    .in('id', studioIds);

  if (studiosError || !studios) return [];

  const nameById = new Map(studios.map(s => [s.id as string, s.name as string]));
  return memberships.map(m => ({
    studioId: m.studio_id,
    name: nameById.get(m.studio_id) ?? 'Organisation',
    role: m.role,
  }));
}

// Writes the chosen organisation as active and reloads into it. Reload
// (rather than live in-memory invalidation) is deliberate — see the plan's
// Architecture note for why.
export async function switchActiveStudio(studioId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  localStorage.setItem(activeStudioKey(user.id), studioId);
  window.location.href = '/';
}

// Creates a brand-new organisation for the ALREADY-LOGGED-IN current user
// (distinct from resolveStudioId's step 3, which only fires when the user
// has zero organisations at all — this fires when they already have one or
// more and are deliberately adding another). Makes it active; caller
// navigates/reloads.
export async function createAdditionalStudio(name: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('createAdditionalStudio called without an authenticated Supabase user');
  const studioId = await provisionNewStudio(name, user);
  localStorage.setItem(activeStudioKey(user.id), studioId);
  return studioId;
}

// Removes the current user's membership in the currently-ACTIVE
// organisation, clears the cache, and returns whatever organisations they
// have left (empty if none). Caller decides where to navigate — see
// Task 4's "Quitter cette organisation" handler.
export async function leaveCurrentStudio(): Promise<MyOrganization[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('leaveCurrentStudio called without an authenticated Supabase user');

  const studioId = await getStudioId();
  const { error } = await supabase
    .from('studio_members')
    .delete()
    .eq('studio_id', studioId)
    .eq('user_id', user.id);
  if (error) throw error;

  resetStudioIdCache();
  localStorage.removeItem(activeStudioKey(user.id));
  return listMyOrganizations();
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Manual smoke check**

Run: `cd "D:/Vibe Coding/Rush/app" && npm run build`
Expected: build succeeds. (Full behavioral verification happens in Task 3, once there's a UI to exercise `createAdditionalStudio`/`switchActiveStudio`/`listMyOrganizations` with — there is deliberately no way to click-test this task in isolation, since it's pure data-layer.)

- [ ] **Step 4: Commit**

```bash
git add app/src/data/studioStore.ts
git commit -m "feat: make studioStore multi-organization aware"
```

---

### Task 3: Organisation switcher in the sidebar

**Files:**
- Create: `app/src/components/layout/OrgSwitcher.tsx`
- Modify: `app/src/components/layout/Sidebar.tsx` (import + render, right after the existing logo block)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (new `orgSwitcher` namespace)

**Interfaces:**
- Consumes: `listMyOrganizations`, `switchActiveStudio`, `createAdditionalStudio` from `../../data/studioStore` (Task 2); `isDemoSession`, `getCurrentUser` from `../../data/authStore`; `SFIcon`, `SFModal`, `SFButton` from `../ui`.
- Produces: `<OrgSwitcher />` component, rendered unconditionally by `Sidebar.tsx` (it internally returns `null` for demo sessions).

- [ ] **Step 1: Write `OrgSwitcher.tsx`**

```typescript
// app/src/components/layout/OrgSwitcher.tsx
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFModal, SFButton } from '../ui';
import { isDemoSession } from '../../data/authStore';
import { listMyOrganizations, switchActiveStudio, createAdditionalStudio, getStudioId, type MyOrganization } from '../../data/studioStore';

export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDemoSession()) return;
    let cancelled = false;
    (async () => {
      const [list, current] = await Promise.all([listMyOrganizations(), getStudioId()]);
      if (!cancelled) { setOrgs(list); setActiveId(current); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (isDemoSession()) return null;

  const active = orgs.find(o => o.studioId === activeId);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await createAdditionalStudio(name);
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to create organisation', err);
      setCreating(false);
    }
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', padding: collapsed ? '0 6px 8px' : '0 12px 8px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={collapsed ? (active?.name ?? t('orgSwitcher.title')) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: collapsed ? '7px 0' : '7px 10px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          cursor: 'pointer', justifyContent: collapsed ? 'center' : 'space-between',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <SFIcon name="building-2" size={13} color="var(--text-3)" />
          {!collapsed && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {active?.name ?? '…'}
            </span>
          )}
        </span>
        {!collapsed && <SFIcon name={open ? 'chevron-up' : 'chevron-down'} size={12} color="var(--text-3)" />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: collapsed ? 0 : 12, right: collapsed ? 'auto' : 12,
          marginTop: 4, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border-2)',
          borderRadius: 10, padding: 5, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', minWidth: 200,
        }}>
          {orgs.map(org => (
            <button
              key={org.studioId}
              onClick={() => { setOpen(false); if (org.studioId !== activeId) void switchActiveStudio(org.studioId); }}
              style={{
                display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left',
                padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: org.studioId === activeId ? 'var(--surface-2)' : 'transparent',
              }}
              onMouseEnter={e => { if (org.studioId !== activeId) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (org.studioId !== activeId) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{org.name}</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{org.role}</span>
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
          <button
            onClick={() => { setOpen(false); setShowCreate(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
              padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <SFIcon name="plus" size={13} color="var(--accent)" />
            {t('orgSwitcher.createOrg')}
          </button>
        </div>
      )}

      <SFModal open={showCreate} onClose={() => setShowCreate(false)} title={t('orgSwitcher.createOrgTitle')} width={380}>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>{t('orgSwitcher.createOrgDesc')}</p>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={t('orgSwitcher.createOrgPlaceholder')}
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9,
            border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
            fontSize: 14, outline: 'none', marginBottom: 16,
          }}
        />
        <SFButton variant="primary" onClick={handleCreate} disabled={!newName.trim() || creating}>
          {creating ? '…' : t('orgSwitcher.createOrgSubmit')}
        </SFButton>
      </SFModal>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `Sidebar.tsx`**

Read `app/src/components/layout/Sidebar.tsx` first. Add the import near the top (next to the other layout imports):

```typescript
import { OrgSwitcher } from './OrgSwitcher';
```

Then render it right after the logo block closes (immediately after the `{/* Expand button (collapsed mode) */}` block, before `{/* Scrollable middle section */}`):

```typescript
      {/* Organisation switcher */}
      <OrgSwitcher collapsed={collapsed} />

      {/* Scrollable middle section */}
```

- [ ] **Step 3: Add locale keys**

In `app/src/locales/fr.json`, add a new top-level `orgSwitcher` object (place it alphabetically near `onboarding`, e.g. right after the `onboarding` namespace closes):

```json
  "orgSwitcher": {
    "title": "Organisation",
    "createOrg": "Créer une organisation",
    "createOrgTitle": "Nouvelle organisation",
    "createOrgDesc": "Crée une organisation distincte — utile si tu gères plusieurs studios ou agences séparément.",
    "createOrgPlaceholder": "Nom de l'organisation",
    "createOrgSubmit": "Créer"
  },
```

In `app/src/locales/en.json`, same structure:

```json
  "orgSwitcher": {
    "title": "Organization",
    "createOrg": "Create an organization",
    "createOrgTitle": "New organization",
    "createOrgDesc": "Creates a separate organization — useful if you run several studios or agencies independently.",
    "createOrgPlaceholder": "Organization name",
    "createOrgSubmit": "Create"
  },
```

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

This is the first point this feature can be exercised end-to-end. Requires Task 1's migration to already be run.

1. Start the dev server, log in with a real (non-demo) account.
2. Confirm the sidebar shows a new row under the logo with the account's current organisation name.
3. Click it, click "Créer une organisation," type a name, submit.
4. Expected: the page reloads, and the sidebar now shows the NEW organisation's name (it becomes active immediately) — with completely empty projects/clients/etc. (a fresh org).
5. Click the switcher again — expected: both organisations are listed, with the new one showing "Admin" as the role.
6. Click the original organisation — expected: page reloads, sidebar shows the original name again, and all the original projects/clients are back.
7. Confirm none of this appears when logged into a demo account (`lea.marchand@studioflow.fr` / any password).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/layout/OrgSwitcher.tsx app/src/components/layout/Sidebar.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add organisation switcher to sidebar"
```

---

### Task 4: Zero-organisation screen + self-service "leave organisation"

**Files:**
- Create: `app/src/screens/NoOrganization.tsx`
- Modify: `app/src/main.tsx` (new route)
- Modify: `app/src/screens/Parametres.tsx` (new "Quitter cette organisation" card in the Profil section)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `createAdditionalStudio` from `../data/studioStore` (Task 2); `leaveCurrentStudio` from the same; `isTeamOwner` from `../data/teamStore`; `getCurrentUser` from `../data/authStore`.
- Produces: `/mes-organisations` route; a working "leave" action reachable from Paramètres.

- [ ] **Step 1: Write `NoOrganization.tsx`**

Standalone screen (no `AppShell`/sidebar), same shell pattern as `TeamInvitationAccept.tsx`.

```typescript
// app/src/screens/NoOrganization.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { createAdditionalStudio } from '../data/studioStore';
import { logout } from '../data/authStore';

export function NoOrganization() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await createAdditionalStudio(trimmed);
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to create organisation', err);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          <img src="/favicon.svg" alt="Rush" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--ff-display)' }}>Rush</span>
        </div>

        <SFIcon name="building-2" size={36} color="var(--text-3)" />
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '16px 0 10px' }}>
          {t('noOrganization.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('noOrganization.desc')}
        </p>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('noOrganization.namePlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
            fontSize: 14, outline: 'none', marginBottom: 14,
          }}
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || submitting}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: !name.trim() || submitting ? 'var(--surface-3)' : 'var(--accent)',
            color: !name.trim() || submitting ? 'var(--text-3)' : 'var(--on-accent)',
            fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            marginBottom: 20,
          }}
        >
          {submitting ? '…' : t('noOrganization.createButton')}
        </button>

        <button
          onClick={() => { void logout(); window.location.href = '/login'; }}
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
        >
          {t('noOrganization.logout')}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Read `app/src/main.tsx` first. Add the import near the other screen imports:

```typescript
import { NoOrganization } from './screens/NoOrganization';
```

Add the route as a standalone route (no sidebar), next to the invitation routes:

```typescript
  // Écran "aucune organisation" — atteint uniquement après avoir quitté sa
  // dernière organisation (voir leaveCurrentStudio dans studioStore.ts).
  { path: '/mes-organisations', element: <NoOrganization />, loader: authLoader },
```

- [ ] **Step 3: Add the "Quitter cette organisation" card to Paramètres**

Read `app/src/screens/Parametres.tsx` first. Add these two imports (extend the existing `authStore` usage — check first whether `getCurrentUser` is already imported; it is not, per the current file, so add it fresh):

```typescript
import { getCurrentUser } from '../data/authStore';
import { isTeamOwner } from '../data/teamStore';
import { leaveCurrentStudio } from '../data/studioStore';
```

Find the block that renders `activeSection === 'profil'` (the one containing the profile avatar card). Insert a new card immediately before its closing `</div>` (i.e. as the last child inside the `activeSection === 'profil'` wrapper div, after the existing profile-avatar card):

```typescript
            {(() => {
              const currentUser = getCurrentUser();
              if (!currentUser || isTeamOwner(currentUser.id)) return null;
              return <LeaveOrganizationCard />;
            })()}
```

Then add the `LeaveOrganizationCard` component in the same file, above `export function Parametres` (or above whichever function currently renders this section — place it as a sibling top-level function, same pattern as the existing `LogoUploader` function at the top of the file):

```typescript
function LeaveOrganizationCard() {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const remaining = await leaveCurrentStudio();
      window.location.href = remaining.length > 0 ? '/' : '/mes-organisations';
    } catch (err) {
      console.error('Failed to leave organisation', err);
      setLeaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--danger)', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('settings.leaveOrgTitle')}</p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{t('settings.leaveOrgDesc')}</p>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {t('settings.leaveOrgButton')}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleLeave}
            disabled={leaving}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: leaving ? 'not-allowed' : 'pointer' }}
          >
            {leaving ? '…' : t('settings.leaveOrgConfirm')}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={leaving}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}
          >
            {t('settings.leaveOrgCancel')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add locale keys**

`app/src/locales/fr.json` — add near the existing `settings.studioName` etc. (anywhere inside the `settings` namespace):

```json
    "leaveOrgTitle": "Quitter cette organisation",
    "leaveOrgDesc": "Tu perdras l'accès à tous les projets, clients et fichiers de cette organisation. Cette action est immédiate.",
    "leaveOrgButton": "Quitter l'organisation",
    "leaveOrgConfirm": "Oui, quitter",
    "leaveOrgCancel": "Annuler",
```

And a new top-level namespace for the zero-org screen:

```json
  "noOrganization": {
    "title": "Aucune organisation",
    "desc": "Tu ne fais partie d'aucune organisation pour le moment. Crée-en une, ou demande à quelqu'un de t'inviter dans la sienne.",
    "namePlaceholder": "Nom de l'organisation",
    "createButton": "Créer mon organisation",
    "logout": "Se déconnecter"
  },
```

`app/src/locales/en.json`:

```json
    "leaveOrgTitle": "Leave this organization",
    "leaveOrgDesc": "You'll lose access to all of this organization's projects, clients, and files. This action is immediate.",
    "leaveOrgButton": "Leave organization",
    "leaveOrgConfirm": "Yes, leave",
    "leaveOrgCancel": "Cancel",
```

```json
  "noOrganization": {
    "title": "No organization",
    "desc": "You don't belong to any organization yet. Create one, or ask someone to invite you to theirs.",
    "namePlaceholder": "Organization name",
    "createButton": "Create my organization",
    "logout": "Sign out"
  },
```

- [ ] **Step 5: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Requires a real test account that belongs to at least 2 organisations (created in Task 3's verification) or exactly 1.

1. As a non-owner member of an organisation (use the invitation flow from Task 5 to set this up, or temporarily insert a `studio_members` row for a second test account via the Supabase dashboard), open Paramètres → Profil. Confirm the "Quitter cette organisation" card appears.
2. As the owner of an organisation, open the same screen — confirm the card does NOT appear.
3. As a non-owner member of exactly 2 organisations, click "Quitter l'organisation," confirm. Expected: redirected to `/`, now showing the OTHER organisation.
4. As a non-owner member of exactly 1 organisation, repeat. Expected: redirected to `/mes-organisations`, showing the "no organization" screen. Create a new one from there — expected: redirected to `/` showing the fresh organisation.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/NoOrganization.tsx app/src/main.tsx app/src/screens/Parametres.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add zero-organization screen and self-service leave"
```

---

### Task 5: Fix the team invitation accept flow for existing users

**Files:**
- Modify: `app/src/screens/TeamInvitationAccept.tsx` (full rewrite of the component body — imports and the `Shell`/style constants at the top stay unchanged)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getInvitationByToken`, `acceptInvitation` from `../data/teamStore` (unchanged); `register`, `login` from `../data/authStore`; `supabase` from `../data/supabaseClient` (to check for an existing session and read the logged-in user's email).
- Produces: same route (`/invitation-equipe/:token`), same default export name `TeamInvitationAccept`, now branching on session state.

- [ ] **Step 1: Rewrite the component**

Read `app/src/screens/TeamInvitationAccept.tsx` first (the `Shell` function and `inputStyle`/`labelStyle` constants at the top, lines 1–39, stay exactly as they are). Replace everything from `export function TeamInvitationAccept()` (line 41) to the end of the file with:

```typescript
export function TeamInvitationAccept() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loadState, setLoadState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [invitation, setInvitation] = useState<TeamInvitationInfo | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined); // undefined = not checked yet

  const [mode, setMode] = useState<'choose' | 'login' | 'register'>('choose');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLoadState('invalid'); return; }
      const info = await getInvitationByToken(token);
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!info || info.status !== 'pending') { setLoadState('invalid'); return; }
      setInvitation(info);
      setSessionEmail(user?.email ?? null);
      setLoadState('ready');
    })();
    return () => { cancelled = true; };
  }, [token]);

  const acceptAsCurrentSession = async () => {
    setSubmitting(true);
    setError('');
    try {
      await acceptInvitation(token);
      navigate('/', { replace: true });
    } catch {
      setError(t('teamInvitation.joinFailed'));
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const result = await login(invitation!.email, password);
    if (!result.ok) {
      setError(t(result.error!));
      setSubmitting(false);
      return;
    }
    await acceptAsCurrentSession();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setSubmitting(true);
    setError('');

    const result = await register({
      studioName: invitation.studioName,
      name,
      email: invitation.email,
      password,
    });

    if (!result.ok) {
      setError(t(result.error!));
      setSubmitting(false);
      return;
    }

    try {
      await acceptInvitation(token);
    } catch {
      // Account was created but studio membership wasn't recorded — do NOT
      // navigate into the app, or the next store call would create them a
      // brand-new empty studio instead of joining this one.
      setError(t('teamInvitation.joinFailed'));
      setSubmitting(false);
      return;
    }

    navigate('/', { replace: true });
  };

  if (loadState === 'loading' || sessionEmail === undefined) {
    return <Shell><p style={{ textAlign: 'center', color: 'var(--text-3)' }}>…</p></Shell>;
  }

  if (loadState === 'invalid') {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px' }}>
            {t('teamInvitation.invalidTitle')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
            {t('teamInvitation.invalidDesc')}
          </p>
          <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
            {t('teamInvitation.backToLogin')}
          </Link>
        </div>
      </Shell>
    );
  }

  // Already logged in.
  if (sessionEmail !== null) {
    const emailMatches = sessionEmail.toLowerCase() === invitation!.email.toLowerCase();

    if (!emailMatches) {
      return (
        <Shell>
          <div style={{ textAlign: 'center' }}>
            <SFIcon name="circle-alert" size={36} color="var(--danger)" />
            <h1 style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '18px 0 10px' }}>
              {t('teamInvitation.wrongAccountTitle')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
              {t('teamInvitation.wrongAccountDesc', { invited: invitation!.email, current: sessionEmail })}
            </p>
            <button
              onClick={async () => { await logout(); window.location.reload(); }}
              style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('teamInvitation.switchAccount')}
            </button>
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('teamInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('teamInvitation.pendingDesc', { studio: invitation!.studioName, role: invitation!.role })}
        </p>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <SFIcon name="circle-alert" size={14} color="var(--danger)" />
            <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
          </div>
        )}
        <button
          onClick={acceptAsCurrentSession}
          disabled={submitting}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: submitting ? 'var(--surface-3)' : 'var(--accent)',
            color: submitting ? 'var(--text-3)' : 'var(--on-accent)',
            fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '…' : t('teamInvitation.joinButton')}
        </button>
      </Shell>
    );
  }

  // Not logged in — choose login or register, then choice-specific form.
  if (mode === 'choose') {
    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('teamInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('teamInvitation.pendingDesc', { studio: invitation!.studioName, role: invitation!.role })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => setMode('login')}
            style={{ width: '100%', padding: '13px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('teamInvitation.haveAccount')}
          </button>
          <button
            onClick={() => setMode('register')}
            style={{ width: '100%', padding: '13px', borderRadius: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('teamInvitation.createAccount')}
          </button>
        </div>
      </Shell>
    );
  }

  if (mode === 'login') {
    return (
      <Shell>
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 20, textAlign: 'center' }}>
          {t('auth.loginTitle')}
        </h1>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('auth.email')}</label>
            <input value={invitation!.email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('auth.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" style={inputStyle} />
          </div>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SFIcon name="circle-alert" size={14} color="var(--danger)" />
              <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !password.trim()}
            style={{
              width: '100%', padding: '13px', borderRadius: 11, border: 'none',
              background: submitting || !password.trim() ? 'var(--surface-3)' : 'var(--accent)',
              color: submitting || !password.trim() ? 'var(--text-3)' : 'var(--on-accent)',
              fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '…' : t('teamInvitation.joinButton')}
          </button>
        </form>
      </Shell>
    );
  }

  // mode === 'register' — identical to the original always-register flow.
  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
        {t('teamInvitation.pendingTitle')}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
        {t('teamInvitation.pendingDesc', { studio: invitation!.studioName, role: invitation!.role })}
      </p>

      <form onSubmit={handleRegister}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.fullName')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('auth.fullNamePlaceholder')} autoComplete="name" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.email')}</label>
          <input value={invitation!.email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.confirmPassword')}</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" style={inputStyle} />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <SFIcon name="circle-alert" size={14} color="var(--danger)" />
            <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim() || !password.trim() || !confirm.trim()}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: submitting || !name.trim() ? 'var(--surface-3)' : 'var(--accent)',
            color: submitting || !name.trim() ? 'var(--text-3)' : 'var(--on-accent)',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '…' : t('teamInvitation.joinButton')}
        </button>
      </form>
    </Shell>
  );
}
```

Also update the imports at the top of the file to add `logout`, `login`, and `supabase`:

```typescript
import { getInvitationByToken, acceptInvitation, type TeamInvitationInfo } from '../data/teamStore';
import { register, login, logout } from '../data/authStore';
import { supabase } from '../data/supabaseClient';
```

- [ ] **Step 2: Add locale keys**

`app/src/locales/fr.json`, inside the existing `teamInvitation` namespace (add these alongside the existing `pendingTitle`/`joinButton` etc.):

```json
    "wrongAccountTitle": "Mauvais compte connecté",
    "wrongAccountDesc": "Cette invitation est pour {{invited}} — tu es connecté(e) en tant que {{current}}.",
    "switchAccount": "Se déconnecter et changer de compte",
    "haveAccount": "J'ai déjà un compte",
    "createAccount": "Créer un compte",
```

`app/src/locales/en.json`:

```json
    "wrongAccountTitle": "Wrong account signed in",
    "wrongAccountDesc": "This invitation is for {{invited}} — you're signed in as {{current}}.",
    "switchAccount": "Sign out and switch account",
    "haveAccount": "I already have an account",
    "createAccount": "Create an account",
```

- [ ] **Step 3: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Requires Task 1's migration and a real second test account.

1. From the first test account (any organisation), invite the second test account's email (Paramètres → Équipe interne → Inviter). Copy the invitation link shown.
2. **Not logged in path — register:** open the link in a private/incognito window (no session). Choose "Créer un compte," fill the form, submit. Expected: lands on `/`, and the sidebar switcher (Task 3) shows this new organisation.
3. **Not logged in path — login:** create a second invitation for the same email (or a third test account) and, in a private window, choose "J'ai déjà un compte," log in with that account's real password. Expected: joins directly, no registration form shown.
4. **Already logged in, matching email:** log into the invited account first, then open the invitation link in the same browser. Expected: shows the one-click "join" confirmation (no login/register forms at all), and after clicking, the switcher shows both organisations.
5. **Already logged in, wrong email:** log into a DIFFERENT account than the one invited, then open the link. Expected: shows the "wrong account" error with the "se déconnecter" option, and does NOT join.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/TeamInvitationAccept.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "fix: let existing accounts join a second organisation via invitation"
```

> **Post-review addendum (2026-07-13, Critical fix):** the "already logged in, matching email" path added above relies on a React-only email check — the underlying `accept_studio_invitation` RPC never verified the caller's email server-side, so anyone with a valid token could call the RPC directly and join an organisation not addressed to them. Closed by `docs/superpowers/specs/2026-07-13-invitation-email-check-migration.sql` (must be run manually in Supabase SQL editor, same as prior migrations).

---

### Task 6: Fix `ai-chat.ts` for multi-organization callers

**Files:**
- Modify: `app/api/ai-chat.ts:100-140` (the studio-resolution block)
- Modify: `app/src/components/AIChat.tsx` (the `send()` fetch body)
- Modify: `app/src/data/aiClient.ts` (the `sendAiChat()` fetch body)

**Interfaces:**
- Consumes: `getStudioId` from `../data/studioStore` in both client files (already imported indirectly or needs adding).
- Produces: `/api/ai-chat` now requires `studioId` in the request body; both client callers supply it.

- [ ] **Step 1: Fix the server function**

Read `app/api/ai-chat.ts` first. Replace this block:

```typescript
  const { messages, tools } = req.body as ChatBody;
  if (!Array.isArray(messages) || !Array.isArray(tools)) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
```

with:

```typescript
  const { messages, tools, studioId } = req.body as ChatBody & { studioId?: string };
  if (!Array.isArray(messages) || !Array.isArray(tools) || !studioId) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
```

Then find this exact block (the studio-resolution logic, right after the auth check):

```typescript
  // Resolve the caller's studio — same lookup as studioStore.ts (member row,
  // falling back to legacy owner_user_id).
  const { data: membership } = await supabaseAdmin
    .from('studio_members')
    .select('studio_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let studioId = membership?.studio_id as string | undefined;
  if (!studioId) {
    const { data: owned } = await supabaseAdmin
      .from('studios')
      .select('id')
      .eq('owner_user_id', user.id)
      .maybeSingle();
    studioId = owned?.id;
  }

  if (!studioId) {
    res.status(403).json({ error: 'no_studio' });
    return;
  }
```

Replace it entirely with a direct membership check against the client-supplied `studioId` — same pattern already used correctly in `update-subscription.ts`:

```typescript
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'not_a_member' });
    return;
  }
```

(`studioId` is now the plain destructured request parameter from Step 1's `req.body` change above, not a resolved variable — there is no other declaration of `studioId` left in the file after this edit.)

- [ ] **Step 2: Send `studioId` from `AIChat.tsx`**

Read `app/src/components/AIChat.tsx` first. Add the import:

```typescript
import { getStudioId } from '../data/studioStore';
```

Find the `send()` function's fetch call body:

```typescript
          body: JSON.stringify({ messages: apiMsgs, tools: TOOLS }),
```

Replace with:

```typescript
          body: JSON.stringify({ messages: apiMsgs, tools: TOOLS, studioId: await getStudioId() }),
```

- [ ] **Step 3: Send `studioId` from `aiClient.ts`**

Read `app/src/data/aiClient.ts` first. Add the import:

```typescript
import { getStudioId } from './studioStore';
```

Find the fetch call body:

```typescript
    body: JSON.stringify({
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      tools: [],
    }),
```

Replace with:

```typescript
    body: JSON.stringify({
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      tools: [],
      studioId: await getStudioId(),
    }),
```

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Requires `ANTHROPIC_API_KEY` configured and the AI usage table migrated (pre-existing requirement, not part of this plan).

1. As a real account on the Studio or Agence plan, open the AI assistant, send a message. Expected: works exactly as before (this account still has exactly one organisation, so behavior is unchanged).
2. As a real account that now belongs to 2 organisations (from Task 3/5's verification), switch to the second organisation, open the AI assistant, send a message. Expected: still works, and — if that organisation is on the Gratuit plan — correctly shows the plan-required message instead (confirming the membership check now looks at the ACTIVE organisation, not just any organisation the user happens to belong to).

- [ ] **Step 6: Commit**

```bash
git add app/api/ai-chat.ts app/src/components/AIChat.tsx app/src/data/aiClient.ts
git commit -m "fix: ai-chat resolves the active organisation explicitly, not by single-row lookup"
```

---

### Task 7: Full end-to-end walkthrough

No new code — this is the design's testing checklist, run once all six tasks are merged.

- [ ] **Step 1: Run the design doc's verification list**

Using two real test accounts, walk through every point in the "Testing / verification approach" section of `docs/superpowers/specs/2026-07-13-multi-organization-design.md`:
1. Two organisations under two different accounts.
2. Invite one into the other's organisation — verify all three accept paths (already logged in, log in, register).
3. Switcher lists both, switching reloads correctly, data is fully isolated (a project created in org A does not appear in org B).
4. Demo sessions show no switcher.
5. Leaving falls back correctly (to the other org, or to `/mes-organisations`).
6. Mismatched-email invitation shows the error, does not join.

- [ ] **Step 2: Report results to the user**

Summarize what was verified and any issues found, before considering the feature complete.

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** every section of the design doc maps to a task — data model (Task 1), active-org tracking + switching (Task 2/3), zero-org screen (Task 4), leave (Task 4), invitation fix (Task 5), server-side changes (Task 6 — scoped down from 4 files to 1 after research), testing (Task 7).
- **Deviation from spec, called out explicitly:** the spec said 4 serverless functions needed changing; research found only `ai-chat.ts` actually does. This plan implements the correct, smaller scope rather than the spec's original (inaccurate) assumption — matches reality already found in `update-subscription.ts`, `create-portal-session.ts`, `create-checkout-session.ts`.
- **New gap found and fixed:** the `studios` table's RLS only allowed owners to read their own organisation row — folded into Task 1's migration since the switcher needs every member, not just owners, to see their orgs' names.
