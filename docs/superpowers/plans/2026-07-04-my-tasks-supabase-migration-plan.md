# Personal Tasks ("Mes tâches") → Supabase Migration (Phase 2, chantier 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give real signed-up users their own private, persisted personal tasks/sections in Supabase, while demo accounts keep their current mock data, unaffected.

**Architecture:** Two new, mutually-independent Supabase tables (`my_sections`, `my_tasks`) scoped by the existing `studios` table. Unlike the project-Tasks chantier, every one of `myTaskStore.ts`'s 7 storage-touching functions is rewritten individually as a targeted single-row Supabase operation (insert/update/delete on exactly the row being changed) — there is no full delete-then-recreate anywhere, so there is no equivalent of the write-race bug fixed in chantier 3a to guard against.

**Tech Stack:** Supabase (already configured), the `getStudioId()`/`isDemoSession()`/`onLogout()` seams already built.

## Global Constraints

- Demo accounts must NEVER trigger a Supabase call for personal tasks/sections.
- `getMyTasks`, `getMyTaskSections`, `addMyTaskSection`, `removeMyTaskSection`, `updateMyTask`, `addMyTask`, `removeMyTask`, `subscribeMyTasks` all keep their exact current signatures.
- `my_tasks.data` is a single JSONB column holding the whole `Task` object (same reasoning as `taskStore.ts`'s `tasks.data`). `my_sections` has no relationship to `my_tasks` at the database level — `mySection` stays a plain string field inside a task's JSONB data, matched by label only, exactly as today.
- No automated test suite exists in this repo — verification is `npx tsc --noEmit -p tsconfig.app.json` (from `app/`), `npm run lint`, and manual browser testing.
- RLS policies alone are not sufficient — explicit `GRANT`s are required too.
- Never request, print, or commit a Supabase `service_role` key.

---

### Task 1: Supabase schema setup (manual — run by the human, not a subagent)

**Files:** none (database change)

**Interfaces:**
- Produces: `my_sections` table (`id text pk`, `studio_id uuid -> studios`, `label text`, `position int`) and `my_tasks` table (`id text pk`, `studio_id uuid -> studios`, `data jsonb`) that Task 2 depends on.

- [ ] **Step 1: Open the Supabase SQL editor**

Same location as prior chantiers: `https://supabase.com/dashboard/project/iqpwggjekqkmixhzpytr/sql/new`.

- [ ] **Step 2: Run this exact SQL**

```sql
create table if not exists my_sections (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  label text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table my_sections enable row level security;

create policy "my_sections_select_own" on my_sections
  for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_sections_insert_own" on my_sections
  for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_sections_update_own" on my_sections
  for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_sections_delete_own" on my_sections
  for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));

grant select, insert, update, delete on my_sections to authenticated;

create table if not exists my_tasks (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table my_tasks enable row level security;

create policy "my_tasks_select_own" on my_tasks
  for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_tasks_insert_own" on my_tasks
  for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_tasks_update_own" on my_tasks
  for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_tasks_delete_own" on my_tasks
  for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));

grant select, insert, update, delete on my_tasks to authenticated;
```

- [ ] **Step 3: Verify the tables exist**

```sql
select table_name from information_schema.tables where table_name in ('my_sections', 'my_tasks');
```

Expected: two rows.

- [ ] **Step 4: Report back to continue**

---

### Task 2: `myTaskStore.ts` — dual demo/real path

**Files:**
- Modify: `app/src/data/myTaskStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `isDemoSession()`, `onLogout()` from `app/src/data/authStore.ts`; `getStudioId()` from `app/src/data/studioStore.ts`; `supabase` from `app/src/data/supabaseClient.ts`; `Task` type from `app/src/types`.
- Produces: `getMyTasks(): Task[]`, `getMyTaskSections(): string[]`, `addMyTaskSection(label: string): void`, `removeMyTaskSection(label: string): void`, `updateMyTask(taskId: string, patch: Partial<Task>): void`, `addMyTask(task: Task): void`, `removeMyTask(taskId: string): void`, `subscribeMyTasks(fn: () => void): () => void` — identical signatures to the current file.

The current file (`app/src/data/myTaskStore.ts`) is:

```ts
import { MY_TASKS } from './mock';
import type { Task } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_my_tasks';
const SECTIONS_KEY = 'sf_my_task_sections';

let _tasks: Task[] = loadPersisted(STORAGE_KEY, MY_TASKS.map(t => ({ ...t })));
let _sections: string[] = loadPersisted(SECTIONS_KEY, []);
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

export const getMyTasks = (): Task[] => [..._tasks];
export const getMyTaskSections = (): string[] => [..._sections];

export function addMyTaskSection(label: string): void {
  if (_sections.includes(label)) return;
  _sections = [..._sections, label];
  savePersisted(SECTIONS_KEY, _sections);
  notify();
}

export function removeMyTaskSection(label: string): void {
  _sections = _sections.filter(s => s !== label);
  // Move tasks from deleted section to "no section"
  _tasks = _tasks.map(t => t.mySection === label ? { ...t, mySection: undefined } : t);
  savePersisted(SECTIONS_KEY, _sections);
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function updateMyTask(taskId: string, patch: Partial<Task>): void {
  _tasks = _tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function addMyTask(task: Task): void {
  _tasks = [..._tasks, task];
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function removeMyTask(taskId: string): void {
  _tasks = _tasks.filter(t => t.id !== taskId);
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function subscribeMyTasks(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
```

- [ ] **Step 1: Replace the full contents of `app/src/data/myTaskStore.ts` with**

```ts
// Reactive personal-tasks ("Mes tâches") store — a flat task list plus a
// flat list of section labels, independent of any project.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase (my_tasks + my_sections tables), scoped
// to the user's studio. Unlike taskStore.ts, every function here maps to a
// single targeted insert/update/delete on exactly the row it changes — no
// full delete-then-recreate anywhere, so there is no write-race class to
// guard against.

import { MY_TASKS } from './mock';
import type { Task } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'sf_my_tasks';
const SECTIONS_KEY = 'sf_my_task_sections';

let _tasks: Task[] = loadPersisted(STORAGE_KEY, MY_TASKS.map(t => ({ ...t })));
let _sections: string[] = loadPersisted(SECTIONS_KEY, []);
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

// ── Real (Supabase-backed) session state ──────────────────────────────────
let _supabaseTasks: Task[] = [];
let _supabaseSectionRows: { id: string; label: string }[] = [];
let _fetchStarted = false;

interface MySectionRow {
  id: string;
  studio_id: string;
  label: string;
  position: number;
}

interface MyTaskRow {
  id: string;
  studio_id: string;
  data: Task;
}

async function fetchSupabaseMyTasks(): Promise<void> {
  const studioId = await getStudioId();

  const { data: sectionRows, error: sectionsError } = await supabase
    .from('my_sections')
    .select('*')
    .eq('studio_id', studioId)
    .order('position', { ascending: true });

  if (sectionsError) { console.error('fetchSupabaseMyTasks: sections failed', sectionsError); return; }

  const { data: taskRows, error: tasksError } = await supabase
    .from('my_tasks')
    .select('*')
    .eq('studio_id', studioId);

  if (tasksError) { console.error('fetchSupabaseMyTasks: tasks failed', tasksError); return; }

  _supabaseSectionRows = ((sectionRows ?? []) as MySectionRow[]).map(r => ({ id: r.id, label: r.label }));
  _supabaseTasks = ((taskRows ?? []) as MyTaskRow[]).map(r => r.data);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabaseMyTasks();
}

export function resetMyTasksCache(): void {
  _supabaseTasks = [];
  _supabaseSectionRows = [];
  _fetchStarted = false;
}

onLogout(resetMyTasksCache);

async function addSupabaseMyTask(task: Task): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('my_tasks').insert({ id: task.id, studio_id: studioId, data: task });
  if (error) { console.error('addSupabaseMyTask failed', error); return; }
  _supabaseTasks = [..._supabaseTasks, task];
  notify();
}

async function removeSupabaseMyTask(taskId: string): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('my_tasks').delete().eq('studio_id', studioId).eq('id', taskId);
  if (error) { console.error('removeSupabaseMyTask failed', error); return; }
  _supabaseTasks = _supabaseTasks.filter(t => t.id !== taskId);
  notify();
}

async function updateSupabaseMyTask(taskId: string, patch: Partial<Task>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseTasks.find(t => t.id === taskId);
  if (!current) { console.error('updateSupabaseMyTask: task not found in cache', taskId); return; }
  const merged = { ...current, ...patch };
  const { error } = await supabase.from('my_tasks').update({ data: merged }).eq('studio_id', studioId).eq('id', taskId);
  if (error) { console.error('updateSupabaseMyTask failed', error); return; }
  _supabaseTasks = _supabaseTasks.map(t => t.id === taskId ? merged : t);
  notify();
}

async function addSupabaseMyTaskSection(label: string): Promise<void> {
  if (_supabaseSectionRows.some(s => s.label === label)) return;
  const studioId = await getStudioId();
  const id = `my-sec-${Date.now()}`;
  const { error } = await supabase.from('my_sections').insert({
    id, studio_id: studioId, label, position: _supabaseSectionRows.length,
  });
  if (error) { console.error('addSupabaseMyTaskSection failed', error); return; }
  _supabaseSectionRows = [..._supabaseSectionRows, { id, label }];
  notify();
}

async function removeSupabaseMyTaskSection(label: string): Promise<void> {
  const studioId = await getStudioId();
  const row = _supabaseSectionRows.find(s => s.label === label);
  if (row) {
    const { error } = await supabase.from('my_sections').delete().eq('studio_id', studioId).eq('id', row.id);
    if (error) { console.error('removeSupabaseMyTaskSection: delete section failed', error); return; }
  }
  _supabaseSectionRows = _supabaseSectionRows.filter(s => s.label !== label);

  const affected = _supabaseTasks.filter(t => t.mySection === label);
  for (const t of affected) {
    const merged: Task = { ...t, mySection: undefined };
    const { error } = await supabase.from('my_tasks').update({ data: merged }).eq('studio_id', studioId).eq('id', t.id);
    if (error) { console.error('removeSupabaseMyTaskSection: clear task section failed', error); continue; }
    _supabaseTasks = _supabaseTasks.map(x => x.id === t.id ? merged : x);
  }
  notify();
}

// ── Public API (unchanged signatures) ─────────────────────────────────────

export const getMyTasks = (): Task[] => {
  if (isDemoSession()) return [..._tasks];
  ensureSupabaseFetchStarted();
  return [..._supabaseTasks];
};

export const getMyTaskSections = (): string[] => {
  if (isDemoSession()) return [..._sections];
  ensureSupabaseFetchStarted();
  return _supabaseSectionRows.map(s => s.label);
};

export function addMyTaskSection(label: string): void {
  if (isDemoSession()) {
    if (_sections.includes(label)) return;
    _sections = [..._sections, label];
    savePersisted(SECTIONS_KEY, _sections);
    notify();
    return;
  }
  void addSupabaseMyTaskSection(label);
}

export function removeMyTaskSection(label: string): void {
  if (isDemoSession()) {
    _sections = _sections.filter(s => s !== label);
    _tasks = _tasks.map(t => t.mySection === label ? { ...t, mySection: undefined } : t);
    savePersisted(SECTIONS_KEY, _sections);
    savePersisted(STORAGE_KEY, _tasks);
    notify();
    return;
  }
  void removeSupabaseMyTaskSection(label);
}

export function updateMyTask(taskId: string, patch: Partial<Task>): void {
  if (isDemoSession()) {
    _tasks = _tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
    savePersisted(STORAGE_KEY, _tasks);
    notify();
    return;
  }
  void updateSupabaseMyTask(taskId, patch);
}

export function addMyTask(task: Task): void {
  if (isDemoSession()) {
    _tasks = [..._tasks, task];
    savePersisted(STORAGE_KEY, _tasks);
    notify();
    return;
  }
  void addSupabaseMyTask(task);
}

export function removeMyTask(taskId: string): void {
  if (isDemoSession()) {
    _tasks = _tasks.filter(t => t.id !== taskId);
    savePersisted(STORAGE_KEY, _tasks);
    notify();
    return;
  }
  void removeSupabaseMyTask(taskId);
}

export function subscribeMyTasks(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "myTaskStore.ts"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/myTaskStore.ts
git commit -m "feat: back myTaskStore with Supabase for real (non-demo) sessions"
```

---

### Task 3: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Task 1–2 together.

- [ ] **Step 1: Full typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: same as the current baseline immediately before this chantier starts (record it as the first action of Task 3, since it may differ from 184 if other unrelated work has landed on `master` in the meantime — the important thing is this chantier introduces zero NEW errors).

- [ ] **Step 2: Lint**

Run (from `app/`): `npm run lint 2>&1 | grep "myTaskStore.ts"`
Expected: no output.

- [ ] **Step 3: Manual browser verification**

Using the real UI where practical (prefer real clicks over raw console `import()` calls for anything touching auth/session state; direct store calls are fine for read/persistence checks, per the lessons from every prior chantier):

1. Log in as a real user with no personal tasks yet. Open "Mes tâches" (`Taches.tsx`). Confirm it loads without crashing, showing an empty list.
2. Add a personal section, then add a task and assign it to that section. Confirm both appear immediately.
3. Reload (or navigate away and back). Confirm the section and task are still there.
4. Remove the section. Confirm the task itself is NOT deleted, and its section assignment clears (matches `removeMyTaskSection`'s existing behavior).
5. Log out, log back in with the same real account. Confirm the task is still there.
6. Log out, log in as a demo account (e.g. Léa). Confirm her personal tasks are completely unaffected — no real-user data leaked in.
7. Log back into the real account. Confirm demo-account usage didn't affect its data.

- [ ] **Step 4: Report results**

Confirm all 7 manual checks pass, plus the typecheck/lint counts, before considering this chantier done.
