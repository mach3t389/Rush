-- 2026-07-25 — Étape C of the role/permissions overhaul: real client
-- dashboard. This is the only new RLS policy this step needs — Step B
-- (docs/superpowers/specs/2026-07-15-client-access-migration.sql) never
-- granted clients read access to `events`, because at the time no
-- client-facing calendar existed yet. Additive only: does not touch any
-- existing policy.
--
-- MANUAL STEP REQUIRED: paste this into Supabase → SQL Editor and run it.
-- Nothing in this project applies migrations automatically — see
-- CLAUDE.md's "Migrations Supabase" section.
--
-- Assumes events.project_id is `text`, matching projects.id text primary
-- key (same assumption Step B made for sections/tasks/invoices/file_*).

drop policy if exists "events_select_client_access" on events;
create policy "events_select_client_access" on events
  for select
  using (project_id is not null and is_client_contact_for_project(project_id));

grant select on public.events to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Event types RLS policy (additive only; discovered during Task 5)
--
-- The getMyClientEvents() method in clientSessionStore.ts joins events to
-- event_types(color) to resolve each event's display color. Without read
-- access to event_types rows, the color lookup silently returns null, and
-- the app falls back to hardcoded '#888'. Since event_types is studio-wide
-- (scoped by studio_id, not project_id), we grant a client read access to
-- an event_type row if there exists at least one readable events row that
-- uses that type. This allows the join to resolve the color without
-- exposing types from projects the client cannot access.

drop policy if exists "event_types_select_via_readable_events" on event_types;
create policy "event_types_select_via_readable_events" on event_types
  for select
  using (
    exists (
      select 1 from events
      where events.event_type_id = event_types.id
        and events.project_id is not null
        and is_client_contact_for_project(events.project_id)
    )
  );

grant select on public.event_types to authenticated;
