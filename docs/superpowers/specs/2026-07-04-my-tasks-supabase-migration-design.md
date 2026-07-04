# Personal Tasks ("Mes tâches") → Supabase Migration (Phase 2, chantier 3b) — Design Spec

**Status:** approved for planning
**Depends on:** Phase 2 chantier 3a — project Tasks migrated to Supabase (merged to `master`, commit `afb58ef`)

## Current State (confirmed by code exploration)

`myTaskStore.ts` is much simpler than the project-scoped `taskStore.ts`: a flat `Task[]` list plus a flat `string[]` of section labels, with NO project scoping and NO structural nesting — a task optionally carries a `mySection?: string` label field, but sections and tasks are two independent flat collections (a section can exist with zero tasks; removing a section just clears the label off any tasks that had it, per `removeMyTaskSection`).

API: `getMyTasks()`, `getMyTaskSections()`, `addMyTaskSection(label)`, `removeMyTaskSection(label)`, `updateMyTask(taskId, patch)`, `addMyTask(task)`, `removeMyTask(taskId)`, `subscribeMyTasks(fn)`.

Unlike `taskStore.ts`, every one of these 7 mutating/reading functions touches storage directly (no shared choke point like `getSections`/`setSections`) — so this migration rewrites all 7, not just 2.

## Architecture

### Schema — two independent tables, no FK between them

```sql
create table if not exists my_sections (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  label text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table my_sections enable row level security;
create policy "my_sections_select_own" on my_sections for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_sections_insert_own" on my_sections for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_sections_update_own" on my_sections for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_sections_delete_own" on my_sections for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, update, delete on my_sections to authenticated;

create table if not exists my_tasks (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table my_tasks enable row level security;
create policy "my_tasks_select_own" on my_tasks for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_tasks_insert_own" on my_tasks for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_tasks_update_own" on my_tasks for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "my_tasks_delete_own" on my_tasks for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, update, delete on my_tasks to authenticated;
```

`my_sections` has no relationship to `my_tasks` at the database level — exactly matching the current in-memory model, where a task's `mySection` is just a plain string field inside its data, not a foreign key.

### Store rewrite — targeted per-operation writes, not full-replace

The project-Tasks chantier used a full delete-then-recreate for `setSections`, which required a write-queue to fix a real race it introduced. Personal tasks don't need that pattern at all: every operation here is naturally already a single targeted row operation, so each function maps to one direct Supabase call with no overlapping-delete risk:

- `getMyTasks()` / `getMyTaskSections()`: demo → unchanged; real → in-memory cache, background-fetched once, kept synchronous via the established trick.
- `addMyTask(task)`: real → `insert into my_tasks`.
- `removeMyTask(taskId)`: real → `delete from my_tasks where id = taskId`.
- `updateMyTask(taskId, patch)`: real → merge patch into the cached task, `update my_tasks set data = merged where id = taskId`.
- `addMyTaskSection(label)`: real → check cache for an existing section with that label (matches current early-return-if-exists behavior), else `insert into my_sections`.
- `removeMyTaskSection(label)`: real → `delete from my_sections where label = X`, then for every cached task whose `mySection === label`, `update my_tasks set data = {...data, mySection: undefined}` — a small number of targeted updates, not a full-table replace.
- `subscribeMyTasks(fn)`: unchanged (pure pub-sub, no storage access).
- `onLogout(resetMyTasksCache)` registered from the start (lesson from every prior chantier).

Because no function does delete-then-recreate of a whole collection, there's no equivalent of the write-queue race found in chantier 3a — each operation targets only the rows it's actually changing.

### Explicitly out of scope

- Any change to `taskStore.ts` (project tasks) — already migrated, untouched here.
- Enforcing any relationship between `mySection` (a plain string on the task) and `my_sections.label` — stays a soft, label-matching association exactly as today.

## Testing

Same as every prior chantier: typecheck, lint, manual E2E — real signup → empty personal task list → add a personal section → add a task to it → reload persists → remove the section (task's `mySection` clears, task itself survives) → logout/relogin persists → demo account's personal tasks completely unaffected.
