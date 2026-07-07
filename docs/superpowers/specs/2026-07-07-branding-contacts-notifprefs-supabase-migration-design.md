# Studio Branding + Client Contacts + Notification Preferences Supabase Migration — Design

**Status:** Approved by user (2026-07-07). 8th Phase 2 chantier (backend migration).

## Goal

Migrate three localStorage-only stores to Supabase — `studioLogoStore.ts`, the combined `clientContactsStore.ts`/`clientTeamStore.ts` pair, and `notifPrefsStore.ts` — while keeping the 3 hardcoded demo accounts (Léa, Sarah, Thomas) working unchanged. These were identified via a code-verified audit (2026-07-07) as the highest-impact remaining team-collaboration data still local-only, after Finances was explicitly deferred by the user (see `finance-chantier-deferred` — future feature plans would reshape its design) and `notificationStore.ts`/`commentStore.ts` were explicitly excluded (derived/stale data, meriting separate consideration).

## Scope

Treated as a single chantier with one plan, not three sub-projects — each piece is individually simple and follows the exact same established dual demo/real pattern proven across every prior Phase 2 chantier (RLS + explicit `GRANT`, in-memory cache populated from Supabase for real sessions, `localStorage` unchanged for demo sessions).

**Explicitly out of scope:** `notificationStore.ts`, `commentStore.ts`, `financeStore.ts` (all deferred, see above), `templates.ts`/`templateFavoritesStore.ts`/`formStore.ts` (not yet evaluated, future candidates), and all purely local UI preferences (`pinnedStore.ts`, `viewAsStore.ts`, `shortcutsStore.ts`, `toastStore.ts`) which have no legitimate backend need.

## Part 1 — Studio logos

**Current state (confirmed via code read):** `studioLogoStore.ts` holds two `localStorage` keys (`sf_studio_logo_full`, `sf_studio_logo_square`) storing data URLs, with zero studio scoping — a real bug today, since every studio (and every demo account) sharing a browser sees the same logo.

**Migration:** add two nullable `text` columns directly to the existing `studios` table — `logo_full`, `logo_square` — rather than a new table, since this is a strict 1:1 relationship with a studio. `studioLogoStore.ts` is rewritten with the dual demo/real pattern: demo sessions keep the exact current global-key behavior; real sessions read/write the two columns on the caller's own studio row (resolved via the existing `getStudioId()`), fixing the scoping bug as a side effect of the migration.

## Part 2 — Client contacts (merging `clientContactsStore.ts` + `clientTeamStore.ts`)

**Current state (confirmed via code read):** `clientContactsStore.ts` holds a hardcoded `CLIENT_CONTACTS` mock object (demo/seed data only, like `mock.ts`) plus a portal-permissions mechanism (`loadPortalPermissions`/`savePortalPermissions`) keyed independently by `contactId` in `localStorage` — disconnected from the actual contact list. `clientTeamStore.ts` holds the real, mutable per-client contact roster (`localStorage`, seeded lazily from `clientContactsStore`'s mock on first access). Consumers (`FicheClient.tsx`) read `portalPermissions` from BOTH the contact object's own field AND the separate keyed store, kept in sync manually — a pre-existing design smell.

**Migration:** one new table, `client_contacts`, becomes the single source of truth, folding the previously-duplicated portal permissions into one field per contact:

```sql
create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  studio_id uuid not null references studios(id),
  name text not null,
  role text not null,
  email text not null,
  status text not null default 'active',
  initials text not null,
  color text not null,
  internal boolean not null default false,
  studio_member_id uuid references studio_members(id) on delete set null,
  portal_permissions jsonb not null default '{"approve":false,"comment":true,"download":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- `studio_member_id` replaces the old hardcoded string `userId` link (e.g. `'lea'`, `'sarah'`) with a real foreign key to `studio_members`, confirmed with the user — an internal contact stays correctly tied to a real team member row, and `on delete set null` means removing someone from the team doesn't cascade-delete their historical client-contact record, just detaches the link.
- `clientContactsStore.ts` keeps only its pure/static parts for real sessions too (the demo seed data, `PortalPermissions` type, `PORTAL_PRESETS`, `matchPortalPreset`) — no more stateful load/save functions, since permissions now live directly on each `client_contacts` row.
- `clientTeamStore.ts` becomes the stateful dual demo/real store: demo sessions keep today's exact `localStorage` behavior (seeded from `CLIENT_CONTACTS`); real sessions bulk-fetch a studio's `client_contacts` rows into an in-memory cache, following the same pattern as `resourceStore.ts`.

## Part 3 — Notification preferences

**Current state (confirmed via code read):** `notifPrefsStore.ts` holds one global `localStorage` key (`sf_notif_prefs`) with a `Record<eventKey, {inapp, email}>` shape, merged against hardcoded defaults on read. Single consumer (`Parametres.tsx`).

**Migration:** this preference is inherently per-**user**, not per-studio — the first table in this entire Phase 2 migration series scoped by `user_id` rather than `studio_id`:

```sql
create table notif_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table notif_prefs enable row level security;

create policy "users manage their own notification preferences"
  on notif_prefs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on notif_prefs to authenticated;
```

`notifPrefsStore.ts` is rewritten with the dual demo/real pattern: demo sessions keep the exact current global-key behavior; real sessions read/write the caller's own row (`user_id = auth.uid()`), merging against the same hardcoded `DEFAULTS` as today so new event types added later still degrade gracefully.

## Global constraints (binding on the implementation plan)

- Demo-session behavior for all 3 stores stays byte-for-byte identical to today.
- Every existing exported function signature is preserved across all 3 stores — no consumer file (`Parametres.tsx`, `Sidebar.tsx`, `FicheClient.tsx`, `ProjectMembres.tsx`) needs changes beyond what naturally falls out of the `clientContactsStore`/`clientTeamStore` permission-field consolidation (see below).
- One necessary consumer-side change: `FicheClient.tsx`'s calls to the now-removed `loadPortalPermissions`/`savePortalPermissions` must be updated to read/write `portalPermissions` directly on the contact object instead — this is a direct, mechanical consequence of Part 2's fix for the pre-existing duplication, not scope creep.
- Every new table's SQL must include the `GRANT ... TO authenticated` statement alongside its RLS policy in the same Task 1 step — this has been missed twice before in this project (see `supabase-rls-needs-grant` memory) and must not be missed a third time.
- RLS for studio-scoped data (`client_contacts`, the two new `studios` columns) reuses the existing `my_studio_ids()` helper. RLS for `notif_prefs` uses `user_id = auth.uid()` directly — a new, simpler pattern specific to this one user-scoped table.

## Testing / verification plan

- Demo-session regression: studio logo upload/display, client contact list (add/remove/edit, portal permission changes), notification preference toggles — all behave exactly as before this migration.
- Real-session round-trip: for each of the 3 pieces, create/edit data, reload, confirm it persists via Supabase.
- Studio logo scoping fix: confirm two different real studios (or a real studio vs. a demo account) on the same browser no longer share a logo.
- Internal contact → team member link: add an internal studio member as a client contact, confirm the link survives a page reload, then remove that person from the studio team and confirm the client-contact record survives with the link cleared (not cascade-deleted).
- Cross-studio isolation: confirm `client_contacts` and the `studios` logo columns respect RLS.
- Cross-user isolation: confirm `notif_prefs` returns only the caller's own row, never another user's, even without an explicit filter.
- Final typecheck/lint diff against baseline (185 typecheck errors / 339 lint problems — the baseline confirmed at the end of the Fichiers/Ressources chantier).
