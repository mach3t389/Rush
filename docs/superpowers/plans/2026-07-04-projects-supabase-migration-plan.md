# Projects → Supabase Migration (Phase 2, chantier 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give real signed-up users their own private, persisted projects in Supabase, while demo accounts (Léa/Sarah/Thomas) keep working exactly as today with zero Supabase involvement.

**Architecture:** Two new Supabase tables (`studios`, `projects`) with row-level security. A new `studioStore.ts` lazily gets-or-creates a real user's studio row. `projectStore.ts` keeps its exact current public API (`getProjects`, `addProject`, `updateProject`, `subscribeProjects`) but internally branches on demo-vs-real session: demo stays on the existing mock+localStorage logic untouched; real sessions read/write Supabase into an in-memory cache that keeps `getProjects()` synchronous (same pattern Phase 1 used for `getCurrentUser()`).

**Tech Stack:** Supabase (Postgres + JS SDK, already installed from Phase 1), existing `app/src/data/supabaseClient.ts`.

## Global Constraints

- Demo accounts (emails in `DEMO_EMAIL_MAP` in `authStore.ts`) must NEVER trigger a Supabase call for projects — verified via `isDemoSession()` check before any Supabase access.
- `getProjects()`, `addProject()`, `updateProject()`, `subscribeProjects()` in `projectStore.ts` keep their exact current signatures — no consuming screen (Dashboard, Projets, Travail, AIChat, Modeles, ProjectsListView) should need any change.
- Project IDs are client-generated strings in the pattern `pj${Date.now()}` (confirmed at `app/src/components/ProjectsListView.tsx:106`, `app/src/screens/Modeles.tsx:657`, `app/src/components/AIChat.tsx:221`) — the `projects.id` column must be `text`, not `uuid`, to accept these as-is without changing any call site.
- No automated test suite exists in this repo (per CLAUDE.md) — verification is `npx tsc --noEmit -p tsconfig.app.json` (from `app/`), `npm run lint`, and manual browser testing.
- Never request, print, or commit a Supabase `service_role` key. Only the existing anon/publishable key (`app/.env`, gitignored) is used.

---

### Task 1: Supabase schema setup (manual — run by the human, not a subagent)

**Files:** none (this is a database change, not a code change)

**Interfaces:**
- Produces: `studios` table (`id uuid pk`, `owner_user_id uuid unique -> auth.users`, `name text`, `created_at timestamptz`) and `projects` table (`id text pk`, `studio_id uuid -> studios`, plus the `Project` fields) that Task 2 and Task 3 depend on.

- [ ] **Step 1: Open the Supabase SQL editor**

Go to the Supabase dashboard for this project (URL in `app/.env` as `VITE_SUPABASE_URL`, minus the `.supabase.co` API suffix — it's the same project ref, accessed via `https://supabase.com/dashboard/project/<project-ref>/sql/new`) and open a new SQL query.

- [ ] **Step 2: Run this exact SQL**

```sql
create table if not exists studios (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table studios enable row level security;

create policy "studios_select_own" on studios
  for select using (owner_user_id = auth.uid());
create policy "studios_insert_own" on studios
  for insert with check (owner_user_id = auth.uid());
create policy "studios_update_own" on studios
  for update using (owner_user_id = auth.uid());

create table if not exists projects (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  client_id text not null default '',
  client_name text not null default '',
  client_color text not null default '',
  phase text not null default 'preproduction',
  phase_label text not null default 'Pré-production',
  progress int not null default 0,
  task_count int not null default 0,
  deliverable_count int not null default 0,
  delivery_date text not null default '',
  status text not null default 'neutral',
  status_label text not null default '',
  modified_at text not null default '',
  budget numeric,
  description text,
  folder_structure_template_id text,
  members jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table projects enable row level security;

create policy "projects_select_own" on projects
  for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "projects_insert_own" on projects
  for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "projects_update_own" on projects
  for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "projects_delete_own" on projects
  for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));
```

- [ ] **Step 3: Verify the tables exist**

Run this in the same SQL editor:

```sql
select table_name from information_schema.tables where table_name in ('studios', 'projects');
```

Expected: two rows, `studios` and `projects`.

- [ ] **Step 4: Report back to continue**

Confirm the two tables exist before Task 2 starts — Task 2's code will fail against a database without them.

---

### Task 2: `studioStore.ts` + `authStore.ts` additions

**Files:**
- Create: `app/src/data/studioStore.ts`
- Modify: `app/src/data/authStore.ts` (add `isDemoSession`, call `resetStudioIdCache` in `logout`)

**Interfaces:**
- Consumes: `supabase` client from `app/src/data/supabaseClient.ts` (`export const supabase = createClient(...)`).
- Produces:
  - `getStudioId(): Promise<string>` — resolves to the current real user's studio id, creating the studio row on first call. Throws if called with no authenticated Supabase user (never called for demo sessions — Task 3 checks `isDemoSession()` first).
  - `resetStudioIdCache(): void` — clears the in-memory cache; called on logout so a later real login doesn't reuse a stale id.
  - `isDemoSession(): boolean` (in `authStore.ts`) — `true` iff the current session is one of the 3 hardcoded demo accounts.

- [ ] **Step 1: Create `app/src/data/studioStore.ts`**

```ts
// Resolves the current real (non-demo) user's studio row, creating it on first
// access. Demo sessions never call this — see isDemoSession() in authStore.ts.

import { supabase } from './supabaseClient';

let cachedStudioId: string | null = null;

export async function getStudioId(): Promise<string> {
  if (cachedStudioId) return cachedStudioId;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('getStudioId called without an authenticated Supabase user');

  const { data: existing, error: selectError } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    cachedStudioId = existing.id;
    return existing.id;
  }

  const studioName = (user.user_metadata?.studio_name as string) || 'Mon studio';
  const { data: created, error: insertError } = await supabase
    .from('studios')
    .insert({ owner_user_id: user.id, name: studioName })
    .select('id')
    .single();

  if (insertError) throw insertError;

  cachedStudioId = created.id;
  return created.id;
}

export function resetStudioIdCache(): void {
  cachedStudioId = null;
}
```

- [ ] **Step 2: Add `isDemoSession()` to `app/src/data/authStore.ts`**

Add this function after `getCurrentUser()` (after line 71, before `export async function login`):

```ts
export function isDemoSession(): boolean {
  return !!localStorage.getItem(AUTH_KEY);
}
```

- [ ] **Step 3: Clear the studio cache on logout**

In `app/src/data/authStore.ts`, replace:

```ts
export async function logout(): Promise<void> {
  localStorage.removeItem(AUTH_KEY);
  await supabase.auth.signOut();
}
```

with:

```ts
export async function logout(): Promise<void> {
  localStorage.removeItem(AUTH_KEY);
  resetStudioIdCache();
  await supabase.auth.signOut();
}
```

And add the import at the top of the file (after the existing `import { supabase } from './supabaseClient';` line):

```ts
import { resetStudioIdCache } from './studioStore';
```

- [ ] **Step 4: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "studioStore.ts|authStore.ts"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/studioStore.ts app/src/data/authStore.ts
git commit -m "feat: add studioStore for lazy real-user studio creation"
```

---

### Task 3: `projectStore.ts` — dual demo/real path

**Files:**
- Modify: `app/src/data/projectStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `getStudioId()`, `resetStudioIdCache()` from `app/src/data/studioStore.ts` (Task 2); `isDemoSession()` from `app/src/data/authStore.ts` (Task 2); `supabase` from `app/src/data/supabaseClient.ts`; `Project` type from `app/src/types`.
- Produces: `getProjects(): Project[]`, `findProject(id: string): Project | undefined`, `addProject(p: Project): void`, `updateProject(id: string, updates: Partial<Project>): void`, `subscribeProjects(fn: () => void): () => void` — identical signatures to the current file, consumed unchanged by `Dashboard.tsx`, `Projets.tsx`, `Travail.tsx`, `ProjectsListView.tsx`, `Modeles.tsx`, `AIChat.tsx`, and others.

The current file (`app/src/data/projectStore.ts`) is:

```ts
// Reactive project store.
// Seeds from PROJECTS mock; user-created projects are persisted separately
// so mock updates (new seed projects) always appear without overwriting edits.

import { PROJECTS } from './mock';
import type { Project } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_added_projects';
const OVERRIDES_KEY = 'sf_project_overrides';

let _added: Project[] = loadPersisted<Project[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Project>> = loadPersisted<Record<string, Partial<Project>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

export function getProjects(): Project[] {
  return [...PROJECTS, ..._added].map(p =>
    _overrides[p.id] ? { ...p, ..._overrides[p.id] } : p
  );
}

export function findProject(id: string): Project | undefined {
  return getProjects().find(p => p.id === id);
}

export function addProject(p: Project): void {
  _added = [p, ..._added];
  persist();
  notify();
}

export function updateProject(id: string, updates: Partial<Project>): void {
  _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...updates } };
  persistOverrides();
  notify();
}

export function subscribeProjects(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
```

- [ ] **Step 1: Replace the full contents of `app/src/data/projectStore.ts` with**

```ts
// Reactive project store.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage-overrides behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio (see
// studioStore.ts). getProjects() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern authStore.ts uses for
// getCurrentUser() via onAuthStateChange, so no consuming screen needs to
// change to handle a Promise.

import { PROJECTS } from './mock';
import type { Project } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'sf_added_projects';
const OVERRIDES_KEY = 'sf_project_overrides';

let _added: Project[] = loadPersisted<Project[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Project>> = loadPersisted<Record<string, Partial<Project>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

// ── Real (Supabase-backed) session state ──────────────────────────────────
let _supabaseProjects: Project[] = [];
let _supabaseFetchStarted = false;

interface ProjectRow {
  id: string;
  studio_id: string;
  name: string;
  client_id: string;
  client_name: string;
  client_color: string;
  phase: string;
  phase_label: string;
  progress: number;
  task_count: number;
  deliverable_count: number;
  delivery_date: string;
  status: string;
  status_label: string;
  modified_at: string;
  budget: number | null;
  description: string | null;
  folder_structure_template_id: string | null;
  members: Project['members'];
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    clientName: row.client_name,
    clientColor: row.client_color,
    phase: row.phase as Project['phase'],
    phaseLabel: row.phase_label,
    progress: row.progress,
    taskCount: row.task_count,
    deliverableCount: row.deliverable_count,
    members: row.members ?? [],
    deliveryDate: row.delivery_date,
    status: row.status as Project['status'],
    statusLabel: row.status_label,
    modifiedAt: row.modified_at,
    budget: row.budget ?? undefined,
    description: row.description ?? undefined,
    folderStructureTemplateId: row.folder_structure_template_id ?? undefined,
  };
}

function toRow(p: Project, studioId: string): ProjectRow {
  return {
    id: p.id,
    studio_id: studioId,
    name: p.name,
    client_id: p.clientId,
    client_name: p.clientName,
    client_color: p.clientColor,
    phase: p.phase,
    phase_label: p.phaseLabel,
    progress: p.progress,
    task_count: p.taskCount,
    deliverable_count: p.deliverableCount,
    delivery_date: p.deliveryDate,
    status: p.status,
    status_label: p.statusLabel,
    modified_at: p.modifiedAt,
    budget: p.budget ?? null,
    description: p.description ?? null,
    folder_structure_template_id: p.folderStructureTemplateId ?? null,
    members: p.members,
  };
}

async function fetchSupabaseProjects(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false });

  if (error) { console.error('fetchSupabaseProjects failed', error); return; }

  _supabaseProjects = (data as ProjectRow[]).map(toProject);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseProjects();
}

async function addSupabaseProject(p: Project): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('projects').insert(toRow(p, studioId));
  if (error) { console.error('addSupabaseProject failed', error); return; }
  await fetchSupabaseProjects();
}

async function updateSupabaseProject(id: string, updates: Partial<Project>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseProjects.find(p => p.id === id);
  if (!current) { console.error('updateSupabaseProject: project not found in cache', id); return; }
  const merged = { ...current, ...updates };
  const { error } = await supabase.from('projects').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseProject failed', error); return; }
  await fetchSupabaseProjects();
}

// ── Public API (unchanged signatures) ─────────────────────────────────────

export function getProjects(): Project[] {
  if (isDemoSession()) {
    return [...PROJECTS, ..._added].map(p =>
      _overrides[p.id] ? { ...p, ..._overrides[p.id] } : p
    );
  }
  ensureSupabaseFetchStarted();
  return _supabaseProjects;
}

export function findProject(id: string): Project | undefined {
  return getProjects().find(p => p.id === id);
}

export function addProject(p: Project): void {
  if (isDemoSession()) {
    _added = [p, ..._added];
    persist();
    notify();
    return;
  }
  void addSupabaseProject(p);
}

export function updateProject(id: string, updates: Partial<Project>): void {
  if (isDemoSession()) {
    _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...updates } };
    persistOverrides();
    notify();
    return;
  }
  void updateSupabaseProject(id, updates);
}

export function subscribeProjects(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "projectStore.ts"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/projectStore.ts
git commit -m "feat: back projectStore with Supabase for real (non-demo) sessions"
```

---

### Task 4: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — this task exercises Tasks 1–3 together.

- [ ] **Step 1: Full typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: same count as the pre-migration baseline (190, per the Phase 1 ledger) — this chantier must introduce zero new errors.

- [ ] **Step 2: Lint**

Run (from `app/`): `npm run lint 2>&1 | grep -E "authStore.ts|studioStore.ts|projectStore.ts"`
Expected: no output (no new lint errors in the 3 touched/created files).

- [ ] **Step 3: Manual browser verification**

Using the dev server and browser preview tools:
1. Sign up a brand-new real account (unique email). Confirm the Dashboard/Projets screen shows an **empty** project list (not the 6 mock seed projects).
2. Create a project via the existing "Nouveau projet" flow. Confirm it appears immediately.
3. Reload the page. Confirm the created project is still there (proves Supabase persistence, not just in-memory state).
4. Log out, log back in with the same real account. Confirm the project is still there (proves it's tied to the account, not the browser session).
5. Log out, log in as a demo account (e.g. Léa). Confirm the original 6 mock projects show, and the real account's created project does NOT appear.
6. Log back into the real account. Confirm demo-account usage didn't affect its data.

- [ ] **Step 4: Report results**

Confirm all 6 manual checks pass, plus the typecheck/lint counts, before considering this chantier done.
