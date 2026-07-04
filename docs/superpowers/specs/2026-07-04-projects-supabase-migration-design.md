# Projects → Supabase Migration (Phase 2, chantier 1) — Design Spec

**Status:** approved for planning
**Author:** Claude, in collaboration with the project owner
**Depends on:** Phase 1 — real Supabase authentication (merged to `master`, commit `990feb5`)

## Goal

Prove the "localStorage store → Supabase-backed store" migration pattern end-to-end on a single, representative store (`projectStore.ts`), while keeping every other store (clients, tasks, events, files, etc.) untouched. This chantier establishes the multi-tenant foundation (studios) that every later store migration will reuse.

Real signed-up users get real, private, persisted projects. Demo accounts (Léa/Sarah/Thomas) are completely unaffected — they keep seeing the exact same hardcoded mock projects as today, with zero Supabase involvement, exactly mirroring how Phase 1 kept demo login isolated from real auth.

## Current State (confirmed by code exploration)

- `Project` type lives in `app/src/types/index.ts` — no `studioId`/org field exists anywhere.
- `app/src/data/projectStore.ts` follows the standard mock-seed + localStorage-overrides pattern documented in CLAUDE.md: `getProjects()`, `findProject()`, `addProject()`, `updateProject()`, `subscribeProjects()`.
- `Onboarding.tsx` never creates a project — a real signed-up user today would see the same 6 hardcoded seed projects as everyone else. There is currently no multi-tenancy at all.
- `AuthUser.studioName` (in `authStore.ts`) is a **display string only** — not a relational ID. It comes from Supabase `user_metadata.studio_name` or a localStorage fallback.
- No other store (`clientStore`, `taskStore`, etc.) is studio-scoped. They stay that way — out of scope for this chantier.

## Architecture

### Multi-tenancy: one studio per real user, created lazily

Rather than creating the `studios` row at signup time (which would need error-handling for a failed insert right after signup, and wouldn't cover any edge case where a user exists without one), studio existence is **get-or-created lazily** the first time any Supabase-backed store needs it. This is simpler, self-healing, and is the shared seam every future store migration (clients, tasks, ...) will reuse without duplicating this logic.

New module: `app/src/data/studioStore.ts`
```ts
export async function getStudioId(): Promise<string>
```
- Caches the resolved id in a module-level variable for the session.
- Queries `studios` for a row where `owner_user_id = auth.uid()`.
- If none exists, inserts one (`name` from Supabase `user_metadata.studio_name`, falling back to `'Mon studio'`) and returns the new id.
- Never called for demo sessions (see below) — demo accounts never touch Supabase.

### Demo vs. real dispatch

New exported helper in `authStore.ts`:
```ts
export function isDemoSession(): boolean // true iff localStorage AUTH_KEY is set
```
Every Supabase-backed store checks this first and branches:
- **Demo session** → exactly today's mock-seed + localStorage-overrides logic, completely unchanged.
- **Real session** → Supabase queries scoped to `getStudioId()`.

This mirrors the exact isolation pattern proven in Phase 1's `authStore.login()`.

### Schema (Supabase, real database — I'll provide the exact SQL to run manually)

```sql
create table if not exists studios (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table studios enable row level security;
create policy "studios_select_own" on studios for select using (owner_user_id = auth.uid());
create policy "studios_insert_own" on studios for insert with check (owner_user_id = auth.uid());
create policy "studios_update_own" on studios for update using (owner_user_id = auth.uid());

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
create policy "projects_select_own" on projects for select using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "projects_insert_own" on projects for insert with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "projects_update_own" on projects for update using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "projects_delete_own" on projects for delete using (studio_id in (select id from studios where owner_user_id = auth.uid()));

grant select, insert, update, delete on studios to authenticated;
grant select, insert, update, delete on projects to authenticated;
```

RLS policies alone are not sufficient — Postgres also requires table-level `GRANT`s for the `authenticated` role, or every query fails with `42501 permission denied` regardless of what the RLS policy would allow.

`client_id`/`client_name`/`client_color` stay denormalized free-text columns for now (matching the current `Project` shape) since `clientStore` isn't migrated yet — that's a later chantier. `members` is stored as JSONB since team/user records aren't migrated yet either.

`projects.id` is `text`, not `uuid`: every call site that builds a new `Project` generates its own id client-side in the pattern `pj${Date.now()}` (confirmed in `ProjectsListView.tsx`, `Modeles.tsx`, `AIChat.tsx`) — using `text` accepts these as-is without touching any of those call sites.

### Store API stays synchronous — no ripple to consuming screens

`getProjects()` is read synchronously by many screens today (Dashboard, Projets, Travail, etc.). Converting it to `Promise<Project[]>` would ripple into every one of those call sites — too large and risky for a "prove the pattern" chantier.

Instead, `projectStore.ts` keeps its exact current public signatures:
```ts
getProjects(): Project[]
addProject(p: Project): void
updateProject(id: string, updates: Partial<Project>): void
subscribeProjects(fn: () => void): () => void
```
For real sessions, an in-memory cache (`_supabaseProjects: Project[]`) backs `getProjects()`, populated by an async fetch kicked off on first access and refreshed after every write. This is the exact same "stay-sync-via-cache" trick Phase 1 used for `getCurrentUser()` via `onAuthStateChange` — a validated pattern, now reused.

- `getProjects()` (real session): returns the current cache (empty array until the first fetch resolves), and triggers a background fetch-if-not-yet-fetched.
- `addProject()` / `updateProject()` (real session): fire the Supabase write asynchronously (not awaited by the caller — matches today's fire-and-forget call sites), then update the local cache and call the existing pub-sub `notify()` once the write completes, exactly as local mutations do today. Callers don't need to change.
- Row ↔ camelCase `Project` mapping is a small pair of pure functions (`toProject(row)`, `toRow(project)`) local to `projectStore.ts`.

### New real user experience

No seed/demo data and no auto-created "starter project" — a freshly signed-up real user simply sees an empty project list, and creates their first project through the existing "Nouveau projet" flow already on the Dashboard/Projets screens (unchanged). Auto-seeding a starter project is a nice-to-have left for later, not needed to prove the migration pattern.

### Explicitly out of scope for this chantier

- Migrating `clientStore`, `taskStore`, `eventStore`, or any other store (each gets its own future chantier reusing the `getStudioId()`/`isDemoSession()` seam established here).
- Realtime multi-user sync (Phase 5 per the existing roadmap) — this chantier only needs the acting user's own writes to show up, which the existing local `notify()` pub-sub already covers.
- Team invites / multiple users per studio (still 1 studio : 1 owner for now).
- Auto-creating a starter project during onboarding.
- Offline support / localStorage caching for real users' projects (Supabase is the only source of truth for them).

## Testing

No automated test suite in this repo (per CLAUDE.md) — verification is via `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, and manual end-to-end testing in the browser preview: real signup → empty Projects list → create a project → reload (confirms persistence) → log out/in (confirms it's tied to the account, not the browser) → confirm a demo account still shows the original 6 mock projects untouched.
