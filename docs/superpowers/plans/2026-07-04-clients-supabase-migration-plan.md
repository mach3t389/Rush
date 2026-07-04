# Clients → Supabase Migration (Phase 2, chantier 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give real signed-up users their own private, persisted clients in Supabase, while demo accounts keep the current 6 hardcoded mock clients, unaffected — repeating the exact pattern already proven for Projects.

**Architecture:** A new `clients` table in Supabase, scoped by the same `studios` table from the Projects chantier (no schema changes there). `clientStore.ts` is rewritten to branch on `isDemoSession()` exactly like `projectStore.ts`: demo path untouched, real path backed by an in-memory cache kept synchronous via a background fetch, registering its own cache reset via the existing `onLogout()` registry.

**Tech Stack:** Supabase (already configured), the `getStudioId()`/`isDemoSession()`/`onLogout()` seams already built in `app/src/data/studioStore.ts` and `app/src/data/authStore.ts`.

## Global Constraints

- Demo accounts (checked via `isDemoSession()`, already in `authStore.ts`) must NEVER trigger a Supabase call for clients.
- `getClients()`, `findClient()`, `addClient()`, `updateClient()`, `subscribeClients()` in `clientStore.ts` keep their exact current signatures — no consuming screen (`Clients.tsx`, `FicheClient.tsx`, `ProjectMembres.tsx`, `ProjetFinances.tsx`, `Finances.tsx`, `Modeles.tsx`) should need any change.
- Client IDs are client-generated strings in the pattern `c${Date.now()}` (confirmed at `app/src/screens/Clients.tsx:53`) — the `clients.id` column must be `text`, not `uuid`.
- No automated test suite exists in this repo (per CLAUDE.md) — verification is `npx tsc --noEmit -p tsconfig.app.json` (from `app/`), `npm run lint`, and manual browser testing.
- RLS policies alone are not sufficient — Postgres also requires explicit `GRANT`s for the `authenticated` role, confirmed the hard way during the Projects chantier (`42501 permission denied` without them).
- `studioStore.ts` and `authStore.ts` need NO changes in this chantier — `getStudioId()`, `isDemoSession()`, and `onLogout()` already exist from the Projects chantier and are reused as-is.
- Never request, print, or commit a Supabase `service_role` key.

---

### Task 1: Supabase schema setup (manual — run by the human, not a subagent)

**Files:** none (database change)

**Interfaces:**
- Produces: `clients` table (`id text pk`, `studio_id uuid -> studios`, plus the `Client` fields) that Task 2 depends on.

- [ ] **Step 1: Open the Supabase SQL editor**

Same location as the Projects chantier: `https://supabase.com/dashboard/project/iqpwggjekqkmixhzpytr/sql/new`.

- [ ] **Step 2: Run this exact SQL**

```sql
create table if not exists clients (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  initials text not null default '',
  avatar_color text not null default '',
  sector text not null default '',
  city text not null default '',
  active_projects int not null default 0,
  pending_deliverables int not null default 0,
  since text not null default '',
  progress int not null default 0,
  status text not null default 'neutral',
  status_label text not null default '',
  last_activity text not null default '',
  address text,
  phone text,
  email text,
  email_compta text,
  website text,
  notes text,
  created_at timestamptz not null default now()
);

alter table clients enable row level security;

create policy "clients_select_own" on clients
  for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "clients_insert_own" on clients
  for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "clients_update_own" on clients
  for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "clients_delete_own" on clients
  for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));

grant select, insert, update, delete on clients to authenticated;
```

- [ ] **Step 3: Verify the table exists**

Run in the same SQL editor:

```sql
select table_name from information_schema.tables where table_name = 'clients';
```

Expected: one row, `clients`.

- [ ] **Step 4: Report back to continue**

Confirm the table exists before Task 2 starts.

---

### Task 2: `clientStore.ts` — dual demo/real path

**Files:**
- Modify: `app/src/data/clientStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `isDemoSession()` from `app/src/data/authStore.ts`; `getStudioId()` and `onLogout()` from `app/src/data/studioStore.ts` and `app/src/data/authStore.ts` respectively (both already exist, no changes needed); `supabase` from `app/src/data/supabaseClient.ts`; `Client` type from `app/src/types`.
- Produces: `getClients(): Client[]`, `findClient(id: string): Client | undefined`, `addClient(c: Client): void`, `updateClient(id: string, updates: Partial<Client>): void`, `subscribeClients(fn: () => void): () => void` — identical signatures to the current file.

The current file (`app/src/data/clientStore.ts`) is:

```ts
// Reactive client store.
// Seeds from CLIENTS mock; user-created clients are persisted separately.
// Edits are stored in _overrides (also persisted) so mock + added clients can both be edited.

import { CLIENTS } from './mock';
import type { Client } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_added_clients';
const OVERRIDES_KEY = 'sf_client_overrides';

let _added: Client[] = loadPersisted<Client[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Client>> = loadPersisted<Record<string, Partial<Client>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

export function getClients(): Client[] {
  return [...CLIENTS, ..._added].map(c =>
    _overrides[c.id] ? { ...c, ..._overrides[c.id] } : c
  );
}

export function findClient(id: string): Client | undefined {
  return getClients().find(c => c.id === id);
}

export function addClient(c: Client): void {
  _added = [..._added, c];
  persist();
  notify();
}

export function updateClient(id: string, updates: Partial<Client>): void {
  _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...updates } };
  persistOverrides();
  notify();
}

export function subscribeClients(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
```

- [ ] **Step 1: Replace the full contents of `app/src/data/clientStore.ts` with**

```ts
// Reactive client store.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage-overrides behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio (see
// studioStore.ts). getClients() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern projectStore.ts uses.

import { CLIENTS } from './mock';
import type { Client } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'sf_added_clients';
const OVERRIDES_KEY = 'sf_client_overrides';

let _added: Client[] = loadPersisted<Client[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Client>> = loadPersisted<Record<string, Partial<Client>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

// ── Real (Supabase-backed) session state ──────────────────────────────────
let _supabaseClients: Client[] = [];
let _supabaseFetchStarted = false;

interface ClientRow {
  id: string;
  studio_id: string;
  name: string;
  initials: string;
  avatar_color: string;
  sector: string;
  city: string;
  active_projects: number;
  pending_deliverables: number;
  since: string;
  progress: number;
  status: string;
  status_label: string;
  last_activity: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  email_compta: string | null;
  website: string | null;
  notes: string | null;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    avatarColor: row.avatar_color,
    sector: row.sector,
    city: row.city,
    activeProjects: row.active_projects,
    pendingDeliverables: row.pending_deliverables,
    since: row.since,
    progress: row.progress,
    status: row.status as Client['status'],
    statusLabel: row.status_label,
    lastActivity: row.last_activity,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    emailCompta: row.email_compta ?? undefined,
    website: row.website ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function toRow(c: Client, studioId: string): ClientRow {
  return {
    id: c.id,
    studio_id: studioId,
    name: c.name,
    initials: c.initials,
    avatar_color: c.avatarColor,
    sector: c.sector,
    city: c.city,
    active_projects: c.activeProjects,
    pending_deliverables: c.pendingDeliverables,
    since: c.since,
    progress: c.progress,
    status: c.status,
    status_label: c.statusLabel,
    last_activity: c.lastActivity,
    address: c.address ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    email_compta: c.emailCompta ?? null,
    website: c.website ?? null,
    notes: c.notes ?? null,
  };
}

async function fetchSupabaseClients(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchSupabaseClients failed', error); return; }

  _supabaseClients = (data as ClientRow[]).map(toClient);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseClients();
}

export function resetClientsCache(): void {
  _supabaseClients = [];
  _supabaseFetchStarted = false;
}

onLogout(resetClientsCache);

async function addSupabaseClient(c: Client): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('clients').insert(toRow(c, studioId));
  if (error) { console.error('addSupabaseClient failed', error); return; }
  await fetchSupabaseClients();
}

async function updateSupabaseClient(id: string, updates: Partial<Client>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseClients.find(c => c.id === id);
  if (!current) { console.error('updateSupabaseClient: client not found in cache', id); return; }
  const merged = { ...current, ...updates };
  const { error } = await supabase.from('clients').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseClient failed', error); return; }
  await fetchSupabaseClients();
}

// ── Public API (unchanged signatures) ─────────────────────────────────────

export function getClients(): Client[] {
  if (isDemoSession()) {
    return [...CLIENTS, ..._added].map(c =>
      _overrides[c.id] ? { ...c, ..._overrides[c.id] } : c
    );
  }
  ensureSupabaseFetchStarted();
  return _supabaseClients;
}

export function findClient(id: string): Client | undefined {
  return getClients().find(c => c.id === id);
}

export function addClient(c: Client): void {
  if (isDemoSession()) {
    _added = [..._added, c];
    persist();
    notify();
    return;
  }
  void addSupabaseClient(c);
}

export function updateClient(id: string, updates: Partial<Client>): void {
  if (isDemoSession()) {
    _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...updates } };
    persistOverrides();
    notify();
    return;
  }
  void updateSupabaseClient(id, updates);
}

export function subscribeClients(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "clientStore.ts"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/clientStore.ts
git commit -m "feat: back clientStore with Supabase for real (non-demo) sessions"
```

---

### Task 3: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Task 1–2 together.

- [ ] **Step 1: Full typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: 190 (the pre-existing baseline, unchanged since the Projects chantier — this chantier must introduce zero new errors).

- [ ] **Step 2: Lint**

Run (from `app/`): `npm run lint 2>&1 | grep "clientStore.ts"`
Expected: no output.

- [ ] **Step 3: Manual browser verification**

Using the real UI (prefer real clicks/form submissions over raw console `import()` calls for anything touching auth/session state — see the Projects chantier's ledger notes on why):
1. Log in as an existing real user with no clients yet (or a brand-new signup). Confirm the Clients screen shows an **empty** list, not the 6 mock clients.
2. Create a client via the existing "Nouveau client" flow. Confirm it appears immediately.
3. Reload the page. Confirm the created client is still there.
4. Log out, log back in with the same real account. Confirm the client is still there.
5. Log out, log in as a demo account (e.g. Léa). Confirm the original 6 mock clients show, and the real account's created client does NOT appear.
6. Log back into the real account. Confirm demo-account usage didn't affect its data.

- [ ] **Step 4: Report results**

Confirm all 6 manual checks pass, plus the typecheck/lint counts, before considering this chantier done.
