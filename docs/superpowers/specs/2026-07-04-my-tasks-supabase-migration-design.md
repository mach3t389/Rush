# Personal Tasks ("Mes tâches") → Supabase Migration (Phase 2, chantier 3b) — Design Spec (v2)

**Status:** approved for planning
**Depends on:** Phase 2 chantier 3a — project Tasks migrated to Supabase (merged to `master`, commit `afb58ef`)
**Supersedes:** the original v1 of this spec, which treated "Mes tâches" as a fully independent list (matching today's demo behavior). The user clarified mid-implementation that, like Asana, "Mes tâches" should show tasks assigned to you across your projects — not a disconnected personal copy. v1's `myTaskStore.ts` rewrite (already committed in this chantier's worktree) is discarded and redone under this design.

## The gap this closes

Confirmed by code exploration: today, `MY_TASKS` (personal) and `PROJECT_TASKS` (project-scoped) are two completely disjoint arrays with no overlapping ids, no sync in either direction, and a code comment explicitly documenting the disconnect ("Les tâches terminées disparaissent de Mes tâches, elles restent dans leur projet"). This is demo/mock behavior only — it does not represent what real users should see.

**Root cause of why this gap exists today:** task `assignee` is always one of 5 hardcoded demo people (`USERS` in `mock.ts`) — a real signed-up user has never been an assignable person anywhere in the app. There's also no real team/multi-member system yet (Phase 2 established one studio per real user, no invited teammates). So there was structurally no way to compute "tasks assigned to me" for a real account until now.

## Architecture

### 1. Real users become assignable to tasks

`Travail.tsx`'s assignee picker currently hardcodes `const TEAM = Object.values(USERS)`. For a real (non-demo) session, `TEAM` must include the current real user, converted from `AuthUser` to `User` shape — using the exact conversion `GlobalTopBar.tsx` already does:
```ts
const me: User = { id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role };
```
Since there's no real team system yet, `TEAM` for a real session is just `[me]` — the only real person available to assign to. This is intentionally minimal and forward-compatible: when real team invites ship in a later phase, `TEAM` grows to include them with no further change to this chantier's logic. Demo sessions keep `TEAM = Object.values(USERS)` exactly as today.

### 2. "Mes tâches" becomes a live filter, not a copy

For real sessions, `getMyTasks()` returns the union of:
- **Assigned project tasks**: every row in the `tasks` table (from chantier 3a) scoped to the user's `studio_id` — a single query across ALL of their projects at once, since `tasks` is one table keyed by `studio_id`/`project_id`, not fetched per-project — filtered client-side where `data.assignee?.id === currentRealUserId`.
- **Freestanding personal tasks**: the `my_tasks` table (this chantier's own schema, unchanged from v1), for genuine to-dos with no project.

These are never merged into one stored collection — the project-origin tasks stay live rows in `tasks`; "Mes tâches" is a computed view over two sources. `Task.projectId` naturally distinguishes the two: unset/empty for freestanding personal tasks, a real project id for assigned tasks.

### 3. Mutations route to the correct underlying table

`updateMyTask(taskId, patch)`: look up which collection `taskId` belongs to (search the assigned-tasks cache first, then the freestanding cache). If it's a project-origin task, call `taskStore.ts`'s `updateTask(task.projectId, taskId, patch)` — the SAME function `Travail.tsx` uses — so checking a task done in "Mes tâches" marks the real project task done, not a disconnected copy. If it's freestanding, update the `my_tasks` row directly (as in v1).

`removeMyTask(taskId)`: only ever applies to freestanding personal tasks — removing a project-assigned task from "Mes tâches" isn't a supported action (you don't delete someone's project task by unchecking it from your personal view; unassigning happens in the project itself). `Taches.tsx` must hide/disable the remove action for project-origin tasks in this view — this is a UI change, not just a store change.

`addMyTask(task)`: unchanged from v1 — always creates a freestanding personal task in `my_tasks`. The existing "tag with a project" picker in `Taches.tsx`'s add-task row stays exactly as it is today (decorative metadata only, does not create a real project task) — the user's ask was specifically about *existing* project-assigned tasks becoming visible in "Mes tâches", not about task creation flows. Out of scope for this chantier; can be revisited later if wanted.

`addMyTaskSection` / `removeMyTaskSection`: unchanged from v1 (personal sections are independent of both projects and assigned tasks — an assigned task is never grouped into a personal section, since it already belongs to its project's real section).

### Schema — unchanged from v1

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

No new table needed for the assigned-tasks side — it reuses chantier 3a's `tasks` table as-is, read-only from this chantier's perspective except for routing `updateMyTask` writes through `taskStore.ts`'s existing `updateTask`.

### Explicitly out of scope

- Real team invites / multiple real users per studio — `TEAM` for real sessions stays `[me]` until that ships.
- Making "add a personal task with a project tag" actually create a real project task — stays decorative, as today.
- Demo accounts — completely unaffected; `MY_TASKS`/`PROJECT_TASKS` stay disconnected for them exactly as today, since demo data intentionally has multiple named people and isn't meant to model this real-user-specific flow.

## Testing

Real signup → create a project, add a task, assign it to yourself via the assignee picker → open "Mes tâches", confirm that task appears automatically (not manually added) → check it off in "Mes tâches" → go back to the project's task list, confirm it shows checked there too (same task, not a copy) → add a freestanding personal task in "Mes tâches" → confirm it does NOT appear in any project's task list → reload, confirm both persist → logout/relogin persists → demo account's "Mes tâches" and project tasks stay exactly as disconnected as they are today.
