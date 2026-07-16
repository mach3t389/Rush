-- Per-project Google Calendar sharing: one dedicated Google Calendar per
-- project that has opted in, shared read-only with that project's client
-- contacts. Same service-role-only access pattern as
-- google_calendar_connections — RLS enabled, no policies, no grants to
-- `authenticated`. Includes the `service_role` grant from the start (this
-- project has forgotten it twice before — see
-- docs/superpowers/specs/2026-07-16-google-calendar-service-role-grant-migration.sql
-- and docs/superpowers/specs/2026-07-16-google-calendar-events-grant-migration.sql).
-- Run once in the Supabase SQL editor.

create table project_google_calendars (
  project_id text primary key references projects(id) on delete cascade,
  studio_id uuid not null references studios(id) on delete cascade,
  google_calendar_id text not null,
  sync_token text,
  active boolean not null default true,
  shared_contact_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_synced_at timestamptz
);

alter table project_google_calendars enable row level security;
grant select, insert, update, delete on project_google_calendars to service_role;
-- Deliberately no policies and no grants to `authenticated` — only the
-- service role (serverless functions) ever reads or writes this table.
