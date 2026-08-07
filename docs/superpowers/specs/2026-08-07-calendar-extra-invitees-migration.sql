-- docs/superpowers/specs/2026-08-07-calendar-extra-invitees-migration.sql
--
-- Adds manual-invitee support to a project's dedicated Google Calendar.
-- Mirrors the existing contacts model on the same table:
--   - project_client_access + client_contacts  = "desired" contacts list
--   - shared_contact_ids                       = subset of contacts actually
--                                                 invited on the Google side
-- For manually-added emails there is no external "desired" source (no
-- client_contacts row), so both halves live directly on this table:
--   - extra_invitees        = desired list of manually-added emails
--   - extra_invitees_shared = subset of extra_invitees actually invited

alter table project_google_calendars
  add column if not exists extra_invitees text[] not null default '{}',
  add column if not exists extra_invitees_shared text[] not null default '{}';
