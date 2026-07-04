# Project Tasks → Supabase Migration (Phase 2, chantier 3) — Design Spec

**Status:** approved for planning
**Depends on:** Phase 2 chantiers 1–2 — Projects and Clients migrated to Supabase (merged to `master`, commits `bbf5314`, `51c46f3`)

## Scope decision

Tasks is bigger than Projects/Clients: there are two independent stores (`taskStore.ts` for project-scoped tasks, `myTaskStore.ts` for personal "Mes tâches") with different shapes. Splitting into two chantiers, same as every prior phase:

- **This chantier (3a): project-scoped tasks** — `taskStore.ts`, consumed by `Travail.tsx` (list) and `TravailBoard.tsx` (Kanban, receives data as props from `Travail.tsx` — it never calls the store directly, so there is no real 2-surface sync problem to solve).
- **Future chantier (3b): personal tasks** — `myTaskStore.ts` + `Taches.tsx`, reusing every seam this chantier builds.

## Current State (confirmed by code exploration)

- `taskStore.ts` API: `getSections(projectId)`, `setSections(projectId, sections)`, `updateTask`, `deleteTask`, `addDeliverable`, `getDeliverables`, `moveTask`, `moveTasks`, `copyTasks`, `moveSection`, `copySection`, `subscribeStore`.
- Data shape: `Record<projectId, SectionData[]>`, where `SectionData = { label: string; tasks: Task[]; completed?: boolean }`. **Sections have no id — identity is the label string.** Moving/copying a section into a project that already has a section with the same label merges the tasks into it.
- Task ids: `task-${Date.now()}` for new tasks, `${originalId}-copy-${Date.now()}-${random}` for copies.
- `Task` has ~25 fields (see `app/src/types/index.ts`) covering status, priority, dates, deliverable-specific fields, subtasks, linked resources, client-sharing flags.
- `TravailBoard.tsx` takes `sections` + callback props from `Travail.tsx` — it does not import `taskStore.ts` itself. This means the "3-surface parity" note in CLAUDE.md is about keeping the *callback wiring* consistent, not about two independent data-fetch paths — good news for this migration, since there's only one real consumer of the store's read/write API (`Travail.tsx`).
- Confirmed absence of the Clients-style crash bug (`?? findX('hardcoded-id')!`) in `Travail.tsx`/`TravailBoard.tsx` — `getSections()` already defaults to `[]` via `??`, not a fake fallback record. Worth re-checking once the real Supabase path exists (empty array is a safe default either way, unlike a fabricated fake object).

## Architecture

### Schema: real `sections` table (departure from label-only identity)

The current label-as-identity model can't survive a database with no id — an *empty* section (a user created "Post-production" but hasn't added tasks yet) has nothing to anchor a row to if identity is just a label on each task. Two tables, mirroring the actual shape (`SectionData` containing `Task[]`) instead of forcing it into one:

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
create policy "sections_select_own" on sections for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "sections_insert_own" on sections for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "sections_update_own" on sections for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "sections_delete_own" on sections for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));
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
create policy "tasks_select_own" on tasks for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "tasks_insert_own" on tasks for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "tasks_update_own" on tasks for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "tasks_delete_own" on tasks for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, update, delete on tasks to authenticated;
```

`sections.id` is client-generated (`sec-${Date.now()}`), matching the existing app-generated-id convention. `project_id` stays a free-text column (not a real FK to the `projects` table) — same denormalization choice already made for `projects.client_id`; enforcing it would need a migration ordering guarantee this chantier doesn't need.

**`tasks.data` is a single JSONB column holding the full `Task` object**, rather than ~25 individual columns. Reasoning: `Task` has many optional, deliverable-specific, and forward-looking fields (subtasks, linked resources, custom dimensions) that would make a 25-column table brittle and force a migration every time a field is added. JSONB keeps the store's `Partial<Task>` patch semantics (`updateTask`) trivial (`jsonb || patch`), matches how the data is actually consumed (always as a whole `Task` object, never queried by individual field in SQL), and is consistent with `projects.members`/`clients`-adjacent JSONB precedent already in this schema. `section_id` and `project_id` are pulled out as real columns because they're the only fields ever filtered/joined on.

### Store rewrite (`taskStore.ts`)

Same demo/real branching as `projectStore.ts`/`clientStore.ts`, applied per-project (not globally) since the store's public API is already keyed by `projectId`:
- `getSections(projectId)`: demo → unchanged; real → in-memory cache keyed by `projectId`, populated by a background fetch scoped to that project, kept synchronous via the established cache trick.
- `setSections(projectId, sections)`: demo → unchanged; real → diffs against the cache to know which sections/tasks are new/changed/removed, and issues the minimal Supabase writes (insert new sections, delete removed ones, upsert task rows) — a full "replace everything" is wasteful and would blow away other users' concurrent edits in a future multi-user world, but for now (single-owner-per-studio) the priority is correctness, not concurrency.
- `moveTask`/`moveTasks`/`copyTasks`/`moveSection`/`copySection`: for real sessions, translate directly into `update tasks set section_id = ...` / `insert into sections ...` calls rather than reading-then-calling-setSections, to keep each operation a single targeted write instead of a full-cache round-trip.
- `updateTask`/`deleteTask`/`addDeliverable`/`getDeliverables`: same fire-and-forget-write + cache pattern as `addProject`/`updateProject`.
- `onLogout(resetTasksCache)` registered from the start (per the lesson from the Projects chantier).

### Explicitly out of scope

- `myTaskStore.ts` / `Taches.tsx` (personal tasks) — chantier 3b, reuses this chantier's `sections`/`tasks` tables and the same store-rewrite pattern.
- Changing the section-merge-on-same-label behavior when moving/copying across projects — preserved exactly as today.
- Realtime multi-user sync, concurrent-edit conflict resolution — same exclusions as every prior chantier.
- Enforcing `project_id`/`section_id` as real foreign keys to a normalized `projects`/`sections` schema beyond what's specified above.

## Testing

Same as prior chantiers: typecheck, lint, manual E2E — real signup → empty project (from chantier 1) → add a section → add a task → reload persists → move/copy a task between sections → logout/relogin persists → demo account's tasks (across all 6 mock projects) completely unaffected. Given the Clients chantier's lesson (async-cache races can crash detail screens), specifically test: creating a task and immediately interacting with it (edit, drag in board view) before any artificial delay, and reloading `Travail.tsx` mid-session.
