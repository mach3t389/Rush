# Project Tasks → Supabase Migration (Phase 2, chantier 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give real signed-up users their own private, persisted project tasks/sections in Supabase, while demo accounts keep their current mock data, unaffected — repeating the pattern proven by Projects and Clients, adapted for the extra section/task hierarchy.

**Architecture:** Two new Supabase tables (`sections`, `tasks`) scoped by the existing `studios` table. `taskStore.ts` keeps its exact public API. Crucially, every mutating function in the current file (`moveTask`, `moveTasks`, `copyTasks`, `moveSection`, `copySection`, `updateTask`, `deleteTask`, `addDeliverable`) is already implemented purely in terms of `getSections()`/`setSections()` — none of them touch storage directly. So this migration only needs to rewrite `getSections()` and `setSections()` to branch on demo/real; every other function keeps working automatically, completely untouched.

**Tech Stack:** Supabase (already configured), the `getStudioId()`/`isDemoSession()`/`onLogout()` seams already built.

## Global Constraints

- Demo accounts must NEVER trigger a Supabase call for tasks/sections.
- `getSections`, `setSections`, `addDeliverable`, `updateTask`, `deleteTask`, `getDeliverables`, `moveTask`, `moveTasks`, `copyTasks`, `moveSection`, `copySection`, `subscribeStore` all keep their exact current signatures. Only `getSections`/`setSections` change internally; the other 9 functions are NOT modified at all.
- `setSections(projectId, sections)` for real sessions does a **full replace** (delete all sections+tasks for that project, then re-insert everything from the given array) rather than a surgical diff. This is a deliberate simplification: per-project task volumes are small (dozens, not thousands), Postgres delete+insert of a few dozen rows is fast, and it avoids a much more complex and error-prone diffing implementation. Known limitation, accepted for this chantier: two rapid-fire mutations on the same project (e.g., dragging two cards within the same second, before the first write's async chain completes) can race, with the second write's stale base clobbering the first. Not solved here — no different in spirit from the read-after-write cache limitations already accepted in the Projects/Clients chantiers.
- `sections.id` is client-generated (`sec-${Date.now()}-${index}`), `tasks.id` keeps the app's existing `task-${Date.now()}` / `${id}-copy-${Date.now()}-${random}` patterns — no changes needed to task-id generation call sites.
- `tasks.data` is a single JSONB column storing the whole `Task` object — not one column per field. `project_id`/`section_id` are pulled out as real columns since they're the only fields ever filtered/joined on.
- No automated test suite exists in this repo — verification is `npx tsc --noEmit -p tsconfig.app.json` (from `app/`), `npm run lint`, and manual browser testing.
- RLS policies alone are not sufficient — explicit `GRANT`s are required too (confirmed twice now, in the Projects and Clients chantiers).
- Never request, print, or commit a Supabase `service_role` key.

---

### Task 1: Supabase schema setup (manual — run by the human, not a subagent)

**Files:** none (database change)

**Interfaces:**
- Produces: `sections` table (`id text pk`, `studio_id uuid -> studios`, `project_id text`, `label text`, `position int`, `completed boolean`) and `tasks` table (`id text pk`, `studio_id uuid -> studios`, `project_id text`, `section_id text -> sections`, `data jsonb`) that Task 2 depends on.

- [ ] **Step 1: Open the Supabase SQL editor**

Same location as prior chantiers: `https://supabase.com/dashboard/project/iqpwggjekqkmixhzpytr/sql/new`.

- [ ] **Step 2: Run this exact SQL**

```sql
create table if not exists sections (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  project_id text not null,
  label text not null,
  position int not null default 0,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table sections enable row level security;

create policy "sections_select_own" on sections
  for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "sections_insert_own" on sections
  for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "sections_update_own" on sections
  for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "sections_delete_own" on sections
  for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));

grant select, insert, update, delete on sections to authenticated;

create table if not exists tasks (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  project_id text not null,
  section_id text not null references sections(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "tasks_select_own" on tasks
  for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "tasks_insert_own" on tasks
  for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "tasks_update_own" on tasks
  for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "tasks_delete_own" on tasks
  for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));

grant select, insert, update, delete on tasks to authenticated;
```

- [ ] **Step 3: Verify the tables exist**

```sql
select table_name from information_schema.tables where table_name in ('sections', 'tasks');
```

Expected: two rows, `sections` and `tasks`.

- [ ] **Step 4: Report back to continue**

---

### Task 2: `taskStore.ts` — dual demo/real path

**Files:**
- Modify: `app/src/data/taskStore.ts` (rewrite `getSections`/`setSections` and add real-session internals; every other exported function stays byte-identical)

**Interfaces:**
- Consumes: `isDemoSession()`, `onLogout()` from `app/src/data/authStore.ts`; `getStudioId()` from `app/src/data/studioStore.ts`; `supabase` from `app/src/data/supabaseClient.ts`; `Task`, `SectionData` types from `app/src/types`.
- Produces: `getSections(projectId: string): SectionData[]`, `setSections(projectId: string, sections: SectionData[]): void` — identical signatures. `resetTasksCache(): void` (new, mirrors `resetProjectsCache`/`resetClientsCache`).

The current file (`app/src/data/taskStore.ts`) is:

```ts
import { PROJECT_TASKS } from './mock';
import type { Task, SectionData } from '../types';
import { loadPersisted, savePersisted } from './persist';

type ProjectStore = Record<string, SectionData[]>;

const STORAGE_KEY = 'sf_project_tasks';

function seedStore(): ProjectStore {
  return Object.fromEntries(
    Object.entries(PROJECT_TASKS).map(([k, sections]) => [
      k,
      sections.map(s => ({ ...s, tasks: s.tasks.map(t => ({ ...t })) })),
    ])
  );
}

// Seed from mock, then overlay any persisted edits. Projects newly added to the
// seed (not yet in localStorage) still appear; projects the user edited win.
let _store: ProjectStore = (() => {
  const seeded = seedStore();
  const persisted = loadPersisted<ProjectStore | null>(STORAGE_KEY, null);
  return persisted ? { ...seeded, ...persisted } : seeded;
})();

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _store); }

export function getSections(projectId: string): SectionData[] {
  return _store[projectId] ?? [];
}

export function setSections(projectId: string, sections: SectionData[]): void {
  _store = { ..._store, [projectId]: sections };
  persist();
  notify();
}

export function addDeliverable(projectId: string, task: Task): void {
  const sections = getSections(projectId);
  const SECTION = 'Livraison';
  const idx = sections.findIndex(s => s.label === SECTION);
  let next: SectionData[];
  if (idx >= 0) {
    next = sections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, task] } : s);
  } else {
    next = [...sections, { label: SECTION, tasks: [task] }];
  }
  setSections(projectId, next);
}

export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => {
      if (t.id !== taskId) return t;
      const resolvedPatch = (patch.status !== undefined && patch.correctionsRequested === undefined)
        ? { ...patch, correctionsRequested: false }
        : patch;
      return { ...t, ...resolvedPatch };
    }),
  }));
  setSections(projectId, next);
}

export function deleteTask(projectId: string, taskId: string): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== taskId) }));
  setSections(projectId, next);
}

export function getDeliverables(projectId: string): Task[] {
  return getSections(projectId).flatMap(s => s.tasks).filter(t => t.deliverable);
}

export function moveTask(fromProjectId: string, taskId: string, toProjectId: string, toSectionLabel: string): void {
  let movedTask: Task | null = null;
  const fromSections = getSections(fromProjectId).map(s => {
    const found = s.tasks.find(t => t.id === taskId);
    if (found) movedTask = found;
    return { ...s, tasks: s.tasks.filter(t => t.id !== taskId) };
  });
  if (!movedTask) return;
  setSections(fromProjectId, fromSections);

  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  let nextTo: SectionData[];
  if (idx >= 0) {
    nextTo = toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, movedTask!] } : s);
  } else {
    nextTo = [...toSections, { label: toSectionLabel, progress: 0, tasks: [movedTask!] }];
  }
  setSections(toProjectId, nextTo);
}

export function moveSection(fromProjectId: string, sectionLabel: string, toProjectId: string): void {
  const fromSections = getSections(fromProjectId);
  const section = fromSections.find(s => s.label === sectionLabel);
  if (!section) return;
  setSections(fromProjectId, fromSections.filter(s => s.label !== sectionLabel));
  const toSections = getSections(toProjectId);
  const existingIdx = toSections.findIndex(s => s.label === sectionLabel);
  if (existingIdx >= 0) {
    const merged = toSections.map((s, i) => i === existingIdx ? { ...s, tasks: [...s.tasks, ...section.tasks] } : s);
    setSections(toProjectId, merged);
  } else {
    setSections(toProjectId, [...toSections, { ...section }]);
  }
}

export function copyTasks(taskIds: string[], fromProjectId: string, toProjectId: string, toSectionLabel: string): void {
  const idSet = new Set(taskIds);
  const originals: Task[] = [];
  getSections(fromProjectId).forEach(s => s.tasks.forEach(t => { if (idSet.has(t.id)) originals.push(t); }));
  if (!originals.length) return;
  const copies = originals.map(t => ({ ...t, id: `${t.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  if (idx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...copies] } : s));
  } else {
    setSections(toProjectId, [...toSections, { label: toSectionLabel, progress: 0, tasks: copies }]);
  }
}

export function copySection(fromProjectId: string, sectionLabel: string, toProjectId: string): void {
  const section = getSections(fromProjectId).find(s => s.label === sectionLabel);
  if (!section) return;
  const copies = section.tasks.map(t => ({ ...t, id: `${t.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
  const toSections = getSections(toProjectId);
  const existingIdx = toSections.findIndex(s => s.label === sectionLabel);
  if (existingIdx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === existingIdx ? { ...s, tasks: [...s.tasks, ...copies] } : s));
  } else {
    setSections(toProjectId, [...toSections, { ...section, tasks: copies }]);
  }
}

export function moveTasks(fromProjectId: string, taskIds: string[], toProjectId: string, toSectionLabel: string): void {
  const idSet = new Set(taskIds);
  const movedTasks: Task[] = [];
  const fromSections = getSections(fromProjectId).map(s => {
    const kept: Task[] = [];
    s.tasks.forEach(t => { if (idSet.has(t.id)) movedTasks.push(t); else kept.push(t); });
    return { ...s, tasks: kept };
  });
  setSections(fromProjectId, fromSections);
  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  if (idx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...movedTasks] } : s));
  } else {
    setSections(toProjectId, [...toSections, { label: toSectionLabel, progress: 0, tasks: movedTasks }]);
  }
}

export function subscribeStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
```

- [ ] **Step 1: Replace the full contents of `app/src/data/taskStore.ts` with**

```ts
// Reactive task store, keyed by projectId.
//
// Every mutating function below except getSections/setSections is a pure
// wrapper around them — moveTask, moveSection, copyTasks, copySection,
// moveTasks, updateTask, deleteTask, addDeliverable all read via
// getSections() and write via setSections(). So only those two functions
// need to branch on demo/real; everything else keeps working unmodified.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase (sections + tasks tables), scoped to
// the user's studio. setSections() does a full replace (delete all
// sections+tasks for the project, then re-insert from the given array)
// rather than a surgical diff — see the plan's Global Constraints for why.

import { PROJECT_TASKS } from './mock';
import type { Task, SectionData } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

type ProjectStore = Record<string, SectionData[]>;

const STORAGE_KEY = 'sf_project_tasks';

function seedStore(): ProjectStore {
  return Object.fromEntries(
    Object.entries(PROJECT_TASKS).map(([k, sections]) => [
      k,
      sections.map(s => ({ ...s, tasks: s.tasks.map(t => ({ ...t })) })),
    ])
  );
}

let _store: ProjectStore = (() => {
  const seeded = seedStore();
  const persisted = loadPersisted<ProjectStore | null>(STORAGE_KEY, null);
  return persisted ? { ...seeded, ...persisted } : seeded;
})();

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _store); }

// ── Real (Supabase-backed) session state ──────────────────────────────────
const _supabaseSections: Record<string, SectionData[]> = {};
const _fetchedProjectIds = new Set<string>();

interface SectionRow {
  id: string;
  studio_id: string;
  project_id: string;
  label: string;
  position: number;
  completed: boolean;
}

interface TaskRow {
  id: string;
  studio_id: string;
  project_id: string;
  section_id: string;
  data: Task;
}

async function fetchSupabaseSections(projectId: string): Promise<void> {
  const studioId = await getStudioId();

  const { data: sectionRows, error: sectionsError } = await supabase
    .from('sections')
    .select('*')
    .eq('studio_id', studioId)
    .eq('project_id', projectId)
    .order('position', { ascending: true });

  if (sectionsError) { console.error('fetchSupabaseSections: sections failed', sectionsError); return; }

  const { data: taskRows, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('studio_id', studioId)
    .eq('project_id', projectId);

  if (tasksError) { console.error('fetchSupabaseSections: tasks failed', tasksError); return; }

  const rows = (sectionRows ?? []) as SectionRow[];
  const trows = (taskRows ?? []) as TaskRow[];

  _supabaseSections[projectId] = rows.map(r => ({
    label: r.label,
    completed: r.completed,
    tasks: trows.filter(t => t.section_id === r.id).map(t => t.data),
  }));
  notify();
}

function ensureSupabaseFetchStarted(projectId: string): void {
  if (_fetchedProjectIds.has(projectId)) return;
  _fetchedProjectIds.add(projectId);
  void fetchSupabaseSections(projectId);
}

async function writeSupabaseSections(projectId: string, sections: SectionData[]): Promise<void> {
  const studioId = await getStudioId();

  const { error: deleteError } = await supabase
    .from('sections')
    .delete()
    .eq('studio_id', studioId)
    .eq('project_id', projectId);

  if (deleteError) { console.error('writeSupabaseSections: delete failed', deleteError); return; }

  const sectionRows: SectionRow[] = sections.map((s, i) => ({
    id: `sec-${Date.now()}-${i}`,
    studio_id: studioId,
    project_id: projectId,
    label: s.label,
    position: i,
    completed: s.completed ?? false,
  }));

  if (sectionRows.length > 0) {
    const { error: insertSectionsError } = await supabase.from('sections').insert(sectionRows);
    if (insertSectionsError) { console.error('writeSupabaseSections: insert sections failed', insertSectionsError); return; }
  }

  const taskRows: TaskRow[] = sections.flatMap((s, i) =>
    s.tasks.map(t => ({
      id: t.id,
      studio_id: studioId,
      project_id: projectId,
      section_id: sectionRows[i].id,
      data: t,
    }))
  );

  if (taskRows.length > 0) {
    const { error: insertTasksError } = await supabase.from('tasks').insert(taskRows);
    if (insertTasksError) { console.error('writeSupabaseSections: insert tasks failed', insertTasksError); return; }
  }

  _supabaseSections[projectId] = sections;
  notify();
}

export function resetTasksCache(): void {
  Object.keys(_supabaseSections).forEach(k => delete _supabaseSections[k]);
  _fetchedProjectIds.clear();
}

onLogout(resetTasksCache);

// ── Public API (unchanged signatures) ─────────────────────────────────────

export function getSections(projectId: string): SectionData[] {
  if (isDemoSession()) return _store[projectId] ?? [];
  ensureSupabaseFetchStarted(projectId);
  return _supabaseSections[projectId] ?? [];
}

export function setSections(projectId: string, sections: SectionData[]): void {
  if (isDemoSession()) {
    _store = { ..._store, [projectId]: sections };
    persist();
    notify();
    return;
  }
  void writeSupabaseSections(projectId, sections);
}

export function addDeliverable(projectId: string, task: Task): void {
  const sections = getSections(projectId);
  const SECTION = 'Livraison';
  const idx = sections.findIndex(s => s.label === SECTION);
  let next: SectionData[];
  if (idx >= 0) {
    next = sections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, task] } : s);
  } else {
    next = [...sections, { label: SECTION, tasks: [task] }];
  }
  setSections(projectId, next);
}

export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => {
      if (t.id !== taskId) return t;
      const resolvedPatch = (patch.status !== undefined && patch.correctionsRequested === undefined)
        ? { ...patch, correctionsRequested: false }
        : patch;
      return { ...t, ...resolvedPatch };
    }),
  }));
  setSections(projectId, next);
}

export function deleteTask(projectId: string, taskId: string): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== taskId) }));
  setSections(projectId, next);
}

export function getDeliverables(projectId: string): Task[] {
  return getSections(projectId).flatMap(s => s.tasks).filter(t => t.deliverable);
}

export function moveTask(fromProjectId: string, taskId: string, toProjectId: string, toSectionLabel: string): void {
  let movedTask: Task | null = null;
  const fromSections = getSections(fromProjectId).map(s => {
    const found = s.tasks.find(t => t.id === taskId);
    if (found) movedTask = found;
    return { ...s, tasks: s.tasks.filter(t => t.id !== taskId) };
  });
  if (!movedTask) return;
  setSections(fromProjectId, fromSections);

  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  let nextTo: SectionData[];
  if (idx >= 0) {
    nextTo = toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, movedTask!] } : s);
  } else {
    nextTo = [...toSections, { label: toSectionLabel, tasks: [movedTask!] }];
  }
  setSections(toProjectId, nextTo);
}

export function moveSection(fromProjectId: string, sectionLabel: string, toProjectId: string): void {
  const fromSections = getSections(fromProjectId);
  const section = fromSections.find(s => s.label === sectionLabel);
  if (!section) return;
  setSections(fromProjectId, fromSections.filter(s => s.label !== sectionLabel));
  const toSections = getSections(toProjectId);
  const existingIdx = toSections.findIndex(s => s.label === sectionLabel);
  if (existingIdx >= 0) {
    const merged = toSections.map((s, i) => i === existingIdx ? { ...s, tasks: [...s.tasks, ...section.tasks] } : s);
    setSections(toProjectId, merged);
  } else {
    setSections(toProjectId, [...toSections, { ...section }]);
  }
}

export function copyTasks(taskIds: string[], fromProjectId: string, toProjectId: string, toSectionLabel: string): void {
  const idSet = new Set(taskIds);
  const originals: Task[] = [];
  getSections(fromProjectId).forEach(s => s.tasks.forEach(t => { if (idSet.has(t.id)) originals.push(t); }));
  if (!originals.length) return;
  const copies = originals.map(t => ({ ...t, id: `${t.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  if (idx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...copies] } : s));
  } else {
    setSections(toProjectId, [...toSections, { label: toSectionLabel, tasks: copies }]);
  }
}

export function copySection(fromProjectId: string, sectionLabel: string, toProjectId: string): void {
  const section = getSections(fromProjectId).find(s => s.label === sectionLabel);
  if (!section) return;
  const copies = section.tasks.map(t => ({ ...t, id: `${t.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
  const toSections = getSections(toProjectId);
  const existingIdx = toSections.findIndex(s => s.label === sectionLabel);
  if (existingIdx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === existingIdx ? { ...s, tasks: [...s.tasks, ...copies] } : s));
  } else {
    setSections(toProjectId, [...toSections, { ...section, tasks: copies }]);
  }
}

export function moveTasks(fromProjectId: string, taskIds: string[], toProjectId: string, toSectionLabel: string): void {
  const idSet = new Set(taskIds);
  const movedTasks: Task[] = [];
  const fromSections = getSections(fromProjectId).map(s => {
    const kept: Task[] = [];
    s.tasks.forEach(t => { if (idSet.has(t.id)) movedTasks.push(t); else kept.push(t); });
    return { ...s, tasks: kept };
  });
  setSections(fromProjectId, fromSections);
  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  if (idx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...movedTasks] } : s));
  } else {
    setSections(toProjectId, [...toSections, { label: toSectionLabel, tasks: movedTasks }]);
  }
}

export function subscribeStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
```

Note: the three `progress: 0` properties that existed in the original `moveTask`/`copyTasks`/`moveTasks` section-literal fallbacks are dropped in the new version — `SectionData` (`app/src/types/index.ts`) has no `progress` field, so that property was already inert (a pre-existing, harmless excess-property artifact, part of this repo's baseline 190 typecheck errors). Removing it is not a behavior change.

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "taskStore.ts"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/taskStore.ts
git commit -m "feat: back taskStore with Supabase for real (non-demo) sessions"
```

---

### Task 3: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Task 1–2 together.

- [ ] **Step 1: Full typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: 190 (unchanged baseline).

- [ ] **Step 2: Lint**

Run (from `app/`): `npm run lint 2>&1 | grep "taskStore.ts"`
Expected: no output.

- [ ] **Step 3: Manual browser verification**

Using the real UI (prefer real clicks over raw console `import()` calls for anything touching auth/session state, per the lessons from the Projects and Clients chantiers — and specifically watch for the Clients chantier's crash class: any screen that assumes `getSections()`/task data resolves synchronously on first render for a real, not-yet-fetched project):

1. Log in as an existing real user (or sign up fresh) and open a project's Travail (task list) view. Confirm it loads without crashing, showing an empty section list for a brand-new project.
2. Add a new section, then add a task to it. Confirm both appear immediately.
3. Reload the page while on that project's Travail view. Confirm no crash and the section/task are still there.
4. Switch to the Kanban board view for the same project. Confirm the task appears there too (same underlying data, no separate fetch path since `TravailBoard.tsx` only receives props from `Travail.tsx`).
5. Move the task to a different section (drag-and-drop or menu action). Confirm it moves and survives a reload.
6. If the project has 2+ real projects available, test moving/copying a task or section across projects via `BulkMoveModal`. Confirm both projects show correct, non-duplicated state after a reload.
7. Log out, log back in with the same real account. Confirm all task/section data is still there.
8. Log out, log in as a demo account (e.g. Léa). Confirm her mock project tasks are completely unaffected — no real-user data leaked in, no missing mock data.
9. Log back into the real account. Confirm demo-account usage didn't affect its data.

- [ ] **Step 4: Report results**

Confirm all 9 manual checks pass, plus the typecheck/lint counts, before considering this chantier done. If any screen crashes on first load of not-yet-fetched task data (the same async-cache-race class of bug found in the Clients chantier), fix it there using the same pattern: let the relevant state be genuinely empty/undefined until the fetch resolves, subscribe to `subscribeStore()` to update once it does, and if an early-return loading guard is needed, place it strictly after every hook call in the component.
