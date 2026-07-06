# Calendar Supabase Migration — Design

**Status:** Approved by user (2026-07-06). Sixth chantier of Phase 2 backend migration.

## Goal

Migrate `eventStore.ts` and `eventTypeStore.ts` from localStorage/mock to real Supabase persistence for real (non-demo) users, following the exact dual demo/real pattern already shipped for Projects, Clients, project Tasks, personal Tasks ("Mes tâches"), and Team/Invitations. Demo accounts (Léa, Sarah, Thomas) keep their current in-memory/localStorage behavior byte-for-byte unchanged.

As part of the same chantier, fix a pre-existing bug found during scoping: the event participant picker in `CalendrierGlobal.tsx` and `ProjetCalendrier.tsx` hardcodes the 5 demo `USERS` instead of the real studio team — the same bug class already fixed in `Travail.tsx`/`Taches.tsx` during the Team Invitations chantier.

## Why this chantier is low-risk

Unlike the still-pending Files/Resources chantier (which will require object storage — Supabase Storage or Cloudflare R2 — plus recursive folder-tree semantics and soft-delete state), the calendar system is a near-exact structural match to the already-completed **Projects** migration:

- Flat, one-row-per-record model (`CalendarEvent`, `EventType`) — no binary content.
- No per-user ownership/assignee field (`memberIds` is just a list of attendees, not a creator) — the whole studio sees the same events, exactly like Projects/Clients. This means **no "Mes tâches"-style assignee-filtering design question** — it's a straightforward `studio_id`-scoped shared table.
- Small consumer surface: `CalendrierGlobal.tsx`, `ProjetCalendrier.tsx`, `Dashboard.tsx` (read-only), `AIChat.tsx` (calls `addEvent()` as an agent tool, no direct `USERS` coupling).

## Data model

### `events` table
Mirrors `CalendarEvent` from `eventStore.ts`, `studio_id`-scoped, one row per event:
- `id` (text, pk) — client-generated `ev_${Date.now()}`, matching the existing convention.
- `studio_id` (uuid, fk → studios.id)
- `title` (text)
- `event_type_id` (text)
- `project_id` (text, nullable)
- `start` (text, ISO string — kept as text to match the existing `CalendarEvent.start: string` shape exactly, no new date-handling logic introduced)
- `"end"` (text, ISO string)
- `all_day` (boolean, nullable)
- `description` (text, nullable)
- `location` (text, nullable)
- `meeting_url` (text, nullable)
- `member_ids` (jsonb — array of member ids; for real sessions these are real `studio_members`/auth user UUIDs instead of demo ids like `'lea'`)

### `event_types` table
Mirrors `EventType` from `eventTypeStore.ts`, `studio_id`-scoped:
- `id` (text, pk) — client-generated `et_${Date.now()}` for user-created types; the 6 built-in ids (`tournage`, `livraison`, `reunion`, `deadline`, `montage`, `autre`) are seeded once per new real studio at creation time (mirrors `DEFAULT_TYPES` today).
- `studio_id` (uuid, fk → studios.id)
- `label` (text)
- `color` (text)
- `icon` (text)
- `built_in` (boolean, nullable) — guards default types from deletion, same as today.

Both tables get the same RLS shape already used for `projects`/`clients`/`sections`/`tasks`: `select/insert/update/delete` policies scoped to `studio_id in (select id from studios where owner_user_id = auth.uid()) or studio_id in (select my_studio_ids())` (reusing the `my_studio_ids()` helper already created during the Team Invitations chantier), plus the matching `grant`s. New real studios get the 6 built-in event types inserted at the same point `studio_members`' owner row is backfilled (in `getStudioId()`'s "brand-new studio" branch).

## Store rewrites

`eventStore.ts` and `eventTypeStore.ts` are rewritten in place, following the exact shape of `projectStore.ts`:
- `isDemoSession()` branch at the top of every exported function — demo path is the current code, byte-for-byte unchanged.
- Real path: module-level cache (`_supabaseEvents` / `_supabaseEventTypes`) + a "fetch started" flag, populated by a background `fetchSupabaseEvents()`/`fetchSupabaseEventTypes()` that calls `notify()` on completion — `getEvents()`/`getEventTypes()` stay synchronous, matching every current call site (`Dashboard.tsx`, `CalendrierGlobal.tsx`, `ProjetCalendrier.tsx`, `AIChat.tsx`) with zero signature changes.
- `addEvent`/`updateEvent`/`deleteEvent` and `addEventType`/`updateEventType`/`deleteEventType` branch to real Supabase writes (`.insert()`/`.update()`/`.delete()` scoped by `studio_id`), with an optimistic local-cache update + `notify()`, mirroring `clientStore.ts`'s pattern.
- `onLogout(resetEventsCache)` and `onLogout(resetEventTypesCache)` registered from the start (no repeat of the Projects-chantier oversight).

No write-queue is needed (unlike `taskStore.ts`'s `setSections`): every write here is a single-row insert/update/delete, not a delete-then-recreate batch, so there's no race window to serialize.

## Participant picker fix

In `CalendrierGlobal.tsx` and `ProjetCalendrier.tsx` (2 sites each: the add-event modal and the edit-event modal, 4 call sites total):
- Replace `Object.values(USERS).filter(u=>u.role!=='Cliente')` with a `getTeam()`-style helper (real sessions: `getTeamMembers()` from `teamStore.ts`, filtered the same way if a "role" equivalent applies — team members don't have a `'Cliente'` role today so the filter is a no-op for real sessions, kept only for demo parity). Demo sessions keep `Object.values(USERS)` unchanged.
- Replace the hardcoded default participant `['lea']` with the real current user's id for real sessions (`getCurrentUser()?.id`), falling back to `['lea']` only in the demo branch.

## Testing / verification plan

Same shape as every prior chantier: manual E2E covering demo-unchanged behavior, a fresh real signup creating an event and an event type, reload-persistence, the participant picker showing real team members, and a final typecheck/lint/build diff against the pre-chantier baseline (185 errors / 338 lint problems, per the Team Invitations chantier's confirmed baseline).
