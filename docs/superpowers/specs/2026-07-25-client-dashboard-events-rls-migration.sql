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
