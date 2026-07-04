# Clients → Supabase Migration (Phase 2, chantier 2) — Design Spec

**Status:** approved for planning
**Depends on:** Phase 2 chantier 1 — Projects migrated to Supabase (merged to `master`, commit `bbf5314`)

## Goal

Repeat the exact pattern proven by the Projects migration, this time for `clientStore.ts`. Real signed-up users get their own private, persisted Supabase-backed clients; demo accounts keep the current 6 hardcoded mock clients, unaffected.

## Current State (confirmed by code exploration)

- `Client` type (`app/src/types/index.ts:16-36`): `id, name, initials, avatarColor, sector, city, activeProjects, pendingDeliverables, since, progress, status, statusLabel, lastActivity`, plus optional `address, phone, email, emailCompta, website, notes`.
- `clientStore.ts` follows the identical mock-seed + localStorage-overrides pattern as the pre-migration `projectStore.ts`: `getClients()`, `findClient()`, `addClient()`, `updateClient()`, `subscribeClients()`.
- New client ids are client-generated: `c${Date.now()}` (`Clients.tsx:53`) — same pattern as Projects' `pj${Date.now()}`.
- `Project.clientId/clientName/clientColor` are denormalized free-text with no enforced FK to `Client.id` today, and this migration does not change that (confirmed: no FK added, no `projectStore.ts` changes needed).

## Architecture — identical to the Projects chantier, applied to Clients

Reuses every seam already built:
- **Studio scoping**: `getStudioId()` from `app/src/data/studioStore.ts` (no changes needed there).
- **Demo/real dispatch**: `isDemoSession()` from `app/src/data/authStore.ts` (no changes needed there).
- **Cache-reset-on-logout**: `onLogout()` registry from `app/src/data/authStore.ts` — `clientStore.ts` registers its own `resetClientsCache()`, exactly like `projectStore.ts` did.
- **Sync API preserved**: `getClients(): Client[]`, `findClient(id): Client | undefined`, `addClient(c: Client): void`, `updateClient(id, updates): void`, `subscribeClients(fn): unsubscribe` — identical signatures, no consuming screen changes needed (`Clients.tsx`, `FicheClient.tsx`, `ProjectMembres.tsx`, `ProjetFinances.tsx`, `Finances.tsx`, `Modeles.tsx`).

### Schema (Supabase — SQL to run manually in the SQL editor)

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

`id` is `text`, not `uuid` — matches the client-generated `c${Date.now()}` pattern, same reasoning as Projects.

### Store rewrite (`clientStore.ts`) — mirrors `projectStore.ts` exactly

Same structure: `_clients` in-memory cache + `_fetchStarted` flag for the real path, `toClient`/`toRow` mapping pair, `fetchSupabaseClients()`/`addSupabaseClient()`/`updateSupabaseClient()` internal async helpers, all four exported functions branch on `isDemoSession()` first.

### Explicitly out of scope (unchanged from the Projects spec's philosophy)

- `clientContactsStore.ts`, `clientTeamStore.ts`, `invitationStore.ts`, `financeStore.ts` — all stay localStorage/mock-only. Each is a candidate for its own future chantier reusing this same pattern.
- No FK from `projects.client_id` to `clients.id` — denormalization stays exactly as today.
- Realtime sync, team invites, offline caching — same exclusions as the Projects chantier (Phase 5 and beyond).

## Testing

Same as the Projects chantier: `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, and manual E2E — real signup → empty client list → create a client → reload persists → logout/relogin persists → demo account still shows the original 6 mock clients, real user's client not leaked.
