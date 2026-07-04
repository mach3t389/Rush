# Personal Tasks ("Mes tâches") → Supabase Migration (Phase 2, chantier 3b) Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan supersedes v1** (`git log` shows a v1 `myTaskStore.ts` rewrite commit in this chantier's worktree — it implemented "Mes tâches" as a fully independent list, matching demo behavior. The user clarified this should work like Asana instead: tasks assigned to the real user across their projects. v1's store commit has been reset out of the worktree; start fresh from Task 2 below.)

**Goal:** "Mes tâches" shows, for a real user: every task assigned to them across all their projects (live, same record the project view shows — not a copy), plus their own freestanding personal to-dos. Demo accounts are completely unaffected — they keep today's fully-disconnected behavior exactly as-is.

**Architecture:** Real users become assignable to tasks (there's no team/multi-member system yet, so this just means "the current user themselves" — forward-compatible with real team invites later). `myTaskStore.ts`'s `getMyTasks()` becomes a computed union of two Supabase sources: the `tasks` table (already exists from chantier 3a) filtered by `assignee.id === currentUser.id`, and a new `my_tasks` table for freestanding personal tasks. Mutations route to whichever table actually owns the task.

**Tech Stack:** Supabase (already configured), the `getStudioId()`/`isDemoSession()`/`onLogout()`/`getCurrentUser()` seams already built, `taskStore.ts`'s `updateTask()` (from chantier 3a, reused directly — not reimplemented).

## Global Constraints

- Demo accounts must NEVER trigger a Supabase call, and their `getMyTasks()`/`getMyTaskSections()` must return exactly today's disconnected mock+localStorage data.
- `Task.projectId` is a required (non-optional) `string`. Freestanding personal tasks use the existing sentinel `'int'` (already used by `Taches.tsx`'s `addTask` when no project is picked, and by `MY_TASKS` mock data) — this plan does not introduce a new convention, it reuses this one.
- `getMyTasks`, `getMyTaskSections`, `addMyTaskSection`, `removeMyTaskSection`, `updateMyTask`, `addMyTask`, `removeMyTask`, `subscribeMyTasks` all keep their exact current signatures. One new export is added: `isAssignedTask(taskId: string): boolean` (always `false` for demo sessions), used by `Taches.tsx` to decide whether "remove from Mes tâches" is a valid action for a given task.
- Removing an assigned (project-origin) task from "Mes tâches" is not a supported action — only freestanding personal tasks can be removed from this view. `removeMyTask` on an assigned task must be a safe no-op (logged), and `Taches.tsx` must not offer the remove action for such tasks in the first place.
- Checking/patching an assigned task from "Mes tâches" must call `taskStore.ts`'s real `updateTask(projectId, taskId, patch)` — the exact same function `Travail.tsx` uses — so the change is visible in the project view too.
- No automated test suite exists in this repo — verification is `npx tsc --noEmit -p tsconfig.app.json` (from `app/`), `npm run lint`, and manual browser testing.
- RLS policies alone are not sufficient — explicit `GRANT`s are required too.
- Never request, print, or commit a Supabase `service_role` key.

---

### Task 1: Supabase schema — already complete

`my_sections` and `my_tasks` tables were already created in this chantier's Task 1 (manual SQL step, confirmed done). No new tables needed for the assigned-tasks side — it reuses chantier 3a's `tasks` table read-only. **Skip this task — proceed to Task 2.**

---

### Task 2: `myTaskStore.ts` — dual demo/real path, with assigned-task filtering

**Files:**
- Modify: `app/src/data/myTaskStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `isDemoSession()`, `onLogout()`, `getCurrentUser()` from `app/src/data/authStore.ts`; `getStudioId()` from `app/src/data/studioStore.ts`; `supabase` from `app/src/data/supabaseClient.ts`; `updateTask` from `app/src/data/taskStore.ts` (aliased as `updateProjectTask` to avoid a name clash); `Task` type from `app/src/types`.
- Produces: `getMyTasks(): Task[]`, `getMyTaskSections(): string[]`, `addMyTaskSection(label: string): void`, `removeMyTaskSection(label: string): void`, `updateMyTask(taskId: string, patch: Partial<Task>): void`, `addMyTask(task: Task): void`, `removeMyTask(taskId: string): void`, `subscribeMyTasks(fn: () => void): () => void`, and the new `isAssignedTask(taskId: string): boolean`.

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
// Reactive personal-tasks ("Mes tâches") store.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage behavior — a fully independent list, exactly as before this
// migration.
//
// Real sessions: "Mes tâches" is a computed union of two Supabase sources —
// tasks assigned to the current user across ALL their projects (read from
// the tasks table already built in the project-Tasks chantier, filtered by
// assignee.id), plus freestanding personal tasks (this chantier's own
// my_tasks table). Assigned tasks are never copied — mutating one calls
// taskStore.ts's real updateTask(), so "Mes tâches" and the project view
// always show the same record.

import { MY_TASKS } from './mock';
import type { Task } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout, getCurrentUser } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { updateTask as updateProjectTask } from './taskStore';

const STORAGE_KEY = 'sf_my_tasks';
const SECTIONS_KEY = 'sf_my_task_sections';

let _tasks: Task[] = loadPersisted(STORAGE_KEY, MY_TASKS.map(t => ({ ...t })));
let _sections: string[] = loadPersisted(SECTIONS_KEY, []);
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

// ── Real (Supabase-backed) session state ──────────────────────────────────
let _freestandingTasks: Task[] = [];
let _assignedTasks: Task[] = [];
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

interface ProjectTaskRow {
  id: string;
  studio_id: string;
  project_id: string;
  section_id: string;
  data: Task;
}

async function fetchSupabaseMyTasks(): Promise<void> {
  const studioId = await getStudioId();
  const myUserId = getCurrentUser()?.id;

  const { data: sectionRows, error: sectionsError } = await supabase
    .from('my_sections')
    .select('*')
    .eq('studio_id', studioId)
    .order('position', { ascending: true });

  if (sectionsError) { console.error('fetchSupabaseMyTasks: my_sections failed', sectionsError); return; }

  const { data: freestandingRows, error: freestandingError } = await supabase
    .from('my_tasks')
    .select('*')
    .eq('studio_id', studioId);

  if (freestandingError) { console.error('fetchSupabaseMyTasks: my_tasks failed', freestandingError); return; }

  const { data: projectTaskRows, error: projectTasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('studio_id', studioId);

  if (projectTasksError) { console.error('fetchSupabaseMyTasks: tasks failed', projectTasksError); return; }

  _supabaseSectionRows = ((sectionRows ?? []) as MySectionRow[]).map(r => ({ id: r.id, label: r.label }));
  _freestandingTasks = ((freestandingRows ?? []) as MyTaskRow[]).map(r => r.data);
  _assignedTasks = ((projectTaskRows ?? []) as ProjectTaskRow[])
    .map(r => r.data)
    .filter(t => !!myUserId && t.assignee?.id === myUserId);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabaseMyTasks();
}

export function resetMyTasksCache(): void {
  _freestandingTasks = [];
  _assignedTasks = [];
  _supabaseSectionRows = [];
  _fetchStarted = false;
}

onLogout(resetMyTasksCache);

async function addSupabaseMyTask(task: Task): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('my_tasks').insert({ id: task.id, studio_id: studioId, data: task });
  if (error) { console.error('addSupabaseMyTask failed', error); return; }
  _freestandingTasks = [..._freestandingTasks, task];
  notify();
}

async function removeSupabaseMyTask(taskId: string): Promise<void> {
  if (!_freestandingTasks.some(t => t.id === taskId)) {
    console.warn('removeSupabaseMyTask: refusing to remove an assigned project task from Mes tâches', taskId);
    return;
  }
  const studioId = await getStudioId();
  const { error } = await supabase.from('my_tasks').delete().eq('studio_id', studioId).eq('id', taskId);
  if (error) { console.error('removeSupabaseMyTask failed', error); return; }
  _freestandingTasks = _freestandingTasks.filter(t => t.id !== taskId);
  notify();
}

async function updateSupabaseMyTask(taskId: string, patch: Partial<Task>): Promise<void> {
  const freestanding = _freestandingTasks.find(t => t.id === taskId);
  if (freestanding) {
    const studioId = await getStudioId();
    const merged = { ...freestanding, ...patch };
    const { error } = await supabase.from('my_tasks').update({ data: merged }).eq('studio_id', studioId).eq('id', taskId);
    if (error) { console.error('updateSupabaseMyTask (freestanding) failed', error); return; }
    _freestandingTasks = _freestandingTasks.map(t => t.id === taskId ? merged : t);
    notify();
    return;
  }

  const assigned = _assignedTasks.find(t => t.id === taskId);
  if (assigned) {
    updateProjectTask(assigned.projectId, taskId, patch);
    _assignedTasks = _assignedTasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
    notify();
    return;
  }

  console.error('updateSupabaseMyTask: task not found in either cache', taskId);
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

  const affected = _freestandingTasks.filter(t => t.mySection === label);
  for (const t of affected) {
    const merged: Task = { ...t, mySection: undefined };
    const { error } = await supabase.from('my_tasks').update({ data: merged }).eq('studio_id', studioId).eq('id', t.id);
    if (error) { console.error('removeSupabaseMyTaskSection: clear task section failed', error); continue; }
    _freestandingTasks = _freestandingTasks.map(x => x.id === t.id ? merged : x);
  }
  notify();
}

// ── Public API (unchanged signatures, plus isAssignedTask) ────────────────

export const getMyTasks = (): Task[] => {
  if (isDemoSession()) return [..._tasks];
  ensureSupabaseFetchStarted();
  return [..._assignedTasks, ..._freestandingTasks];
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

export function isAssignedTask(taskId: string): boolean {
  if (isDemoSession()) return false;
  return _assignedTasks.some(t => t.id === taskId);
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
git commit -m "feat: back myTaskStore with Supabase, syncing assigned project tasks (Asana-style)"
```

---

### Task 3: `Travail.tsx` — real users become assignable

**Files:**
- Modify: `app/src/screens/Travail.tsx`

**Interfaces:**
- Consumes: `isDemoSession()`, `getCurrentUser()` from `app/src/data/authStore.ts`; `User` type from `app/src/types`.
- Produces: `getTeam(): User[]` (new, module-scoped function replacing the `TEAM` constant) — not exported, used only within this file.

The current file has, at module scope (line 366):

```ts
const TEAM = Object.values(USERS);
```

- [ ] **Step 1: Add the new imports**

At the top of `app/src/screens/Travail.tsx`, find:

```ts
import type { Task, Priority, ResourceType, SectionData, Status, Project } from '../types';
```

Replace with:

```ts
import type { Task, Priority, ResourceType, SectionData, Status, Project, User } from '../types';
import { isDemoSession, getCurrentUser } from '../data/authStore';
```

- [ ] **Step 2: Replace the `TEAM` constant with a function**

Find:

```ts
const TEAM = Object.values(USERS);
```

Replace with:

```ts
// Demo sessions can assign to any of the 5 mock people. Real sessions have
// no team/multi-member system yet (Phase 2 established one real user per
// studio) — the only assignable person is the current user themselves, which
// is forward-compatible with real team invites shipping later.
function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS);
  const authUser = getCurrentUser();
  if (!authUser) return [];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
}
```

- [ ] **Step 3: Replace every remaining `TEAM` usage**

Find (inside `TaskRow`):

```ts
  const [assignee, setAssignee] = useState<typeof TEAM[0] | null>(task.assignee);
```

Replace with:

```ts
  const [assignee, setAssignee] = useState<User | null>(task.assignee);
```

Find:

```ts
            {TEAM.map(u => ddItem(() => { setAssignee(u); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { assignee: u }); },
              <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
              assignee?.id === u.id
            ))}
```

Replace with:

```ts
            {getTeam().map(u => ddItem(() => { setAssignee(u); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { assignee: u }); },
              <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
              assignee?.id === u.id
            ))}
```

Find (inside the "add task" row component):

```ts
  const [assignee, setAssignee] = useState<typeof TEAM[0]>(TEAM[0]);
```

Replace with:

```ts
  const [assignee, setAssignee] = useState<User>(() => getTeam()[0]);
```

Find:

```ts
    setTitle(''); setAssignee(TEAM[0]); setPriority('normal');
```

Replace with:

```ts
    setTitle(''); setAssignee(getTeam()[0]); setPriority('normal');
```

Find:

```ts
              {TEAM.map(u => ddItem(() => { setAssignee(u); setOpenField(null); },
                <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
                assignee.id === u.id
              ))}
```

Replace with:

```ts
              {getTeam().map(u => ddItem(() => { setAssignee(u); setOpenField(null); },
                <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
                assignee.id === u.id
              ))}
```

- [ ] **Step 4: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "Travail.tsx"`
Expected: no NEW errors beyond whatever pre-existing ones this file already had before this change (compare the count before/after this step; this task must not increase it).

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "feat: allow real users to be assigned to tasks (Travail.tsx)"
```

---

### Task 4: `Taches.tsx` — sensible defaults + guard against removing assigned tasks

**Files:**
- Modify: `app/src/screens/Taches.tsx`

**Interfaces:**
- Consumes: `isAssignedTask` (new, from Task 2's `myTaskStore.ts`), `isDemoSession()`, `getCurrentUser()` from `app/src/data/authStore.ts`.

- [ ] **Step 1: Add imports**

Find:

```ts
import { getMyTasks, updateMyTask, addMyTask, removeMyTask, subscribeMyTasks, getMyTaskSections, addMyTaskSection, removeMyTaskSection } from '../data/myTaskStore';
```

Replace with:

```ts
import { getMyTasks, updateMyTask, addMyTask, removeMyTask, subscribeMyTasks, getMyTaskSections, addMyTaskSection, removeMyTaskSection, isAssignedTask } from '../data/myTaskStore';
import { isDemoSession, getCurrentUser } from '../data/authStore';
```

- [ ] **Step 2: Fix the assignee default when creating a personal task**

Find:

```ts
  const addTask = useCallback((title: string, opts: AddOpts & { mySection?: string }) => {
    const newTask: Task = {
      id: `my-${Date.now()}`,
      title,
      projectId: opts.project?.id ?? 'int',
      projectName: opts.project?.name ?? 'Interne',
      projectColor: opts.project?.clientColor ?? 'var(--text-3)',
      assignee: opts.assignee ?? USERS.lea,
```

Replace with:

```ts
  const addTask = useCallback((title: string, opts: AddOpts & { mySection?: string }) => {
    const authUser = getCurrentUser();
    const defaultAssignee = isDemoSession() || !authUser
      ? USERS.lea
      : { id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role };
    const newTask: Task = {
      id: `my-${Date.now()}`,
      title,
      projectId: opts.project?.id ?? 'int',
      projectName: opts.project?.name ?? 'Interne',
      projectColor: opts.project?.clientColor ?? 'var(--text-3)',
      assignee: opts.assignee ?? defaultAssignee,
```

- [ ] **Step 3: Guard the 3 single-task remove call sites**

There are 3 occurrences of this exact pattern (one per task-list section rendered in this file):

```ts
onDelete={() => removeMyTask(task.id)}
```

Replace **all 3 occurrences** with:

```ts
onDelete={isAssignedTask(task.id) ? undefined : () => removeMyTask(task.id)}
```

- [ ] **Step 4: Guard the bulk-remove button**

Find:

```ts
          <button onClick={() => {
            [...multiSelIds].forEach(id => removeMyTask(id));
            setMultiSelIds(new Set());
          }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', cursor: 'pointer', color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
```

Replace with:

```ts
          <button onClick={() => {
            [...multiSelIds].filter(id => !isAssignedTask(id)).forEach(id => removeMyTask(id));
            setMultiSelIds(new Set());
          }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', cursor: 'pointer', color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
```

- [ ] **Step 5: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "Taches.tsx"`
Expected: no NEW errors beyond this file's pre-existing baseline.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Taches.tsx
git commit -m "feat: default personal tasks to the real user, guard removing assigned tasks"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Tasks 2–4 together.

- [ ] **Step 1: Full typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: no new errors versus the baseline recorded at the start of this chantier (record that baseline as the first action of this task, since other unrelated work may have landed on `master` since — the requirement is zero NEW errors from this chantier's 3 changed files).

- [ ] **Step 2: Lint**

Run (from `app/`): `npm run lint 2>&1 | grep -E "myTaskStore.ts|Travail.tsx|Taches.tsx"`
Expected: no NEW findings versus each file's pre-existing baseline.

- [ ] **Step 3: Manual browser verification**

Using the real UI where practical (prefer real clicks over raw console `import()` calls for anything touching auth/session state; direct store calls are fine for read/persistence checks):

1. Log in as a real user. Create a project (or use an existing one), add a task, and assign it to yourself via the assignee picker (it should now show your own name/avatar as an option, not just demo people).
2. Open "Mes tâches". Confirm that task appears automatically — you did not add it there manually.
3. Check the task off from within "Mes tâches". Go to the project's Travail view and confirm it shows checked there too (same task, not a disconnected copy).
4. Back in "Mes tâches", add a freestanding personal task (no project selected). Confirm it appears, and confirm it does NOT show up in any project's task list.
5. Confirm the assigned task from step 1 does NOT offer a "remove" action in "Mes tâches" (or that clicking it — if still visible — has no effect and logs a console warning, not an error). Confirm the freestanding task from step 4 CAN be removed normally.
6. Reload. Confirm both the assigned task's checked state and the freestanding task still show correctly.
7. Log out, log back in with the same real account. Confirm both are still there.
8. Log out, log in as a demo account (e.g. Léa). Confirm her "Mes tâches" and project tasks are completely unaffected — the historical disconnected mock behavior, unchanged.
9. Log back into the real account. Confirm demo-account usage didn't affect its data.

- [ ] **Step 4: Report results**

Confirm all 9 manual checks pass, plus the typecheck/lint counts, before considering this chantier done.
