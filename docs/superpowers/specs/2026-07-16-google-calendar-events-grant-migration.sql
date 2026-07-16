-- Third occurrence of the same bug: service_role was never granted
-- SELECT/INSERT/UPDATE/DELETE on `events`, `projects`, `client_contacts`,
-- or `project_client_access` — RLS bypass for service_role does not imply
-- base table GRANT privileges (see the ai_usage and google_calendar_connections
-- fixes for the same lesson). This blocks the already-deployed Google
-- Calendar push/pull sync (which reads/writes `events` via service_role)
-- and the upcoming per-project calendar sharing feature (which needs
-- service_role to read `projects`/`client_contacts`/`project_client_access`).
-- Verified via information_schema.role_table_grants: these tables currently
-- only have REFERENCES/TRIGGER/TRUNCATE for service_role, nothing else.
-- Run once in the Supabase SQL editor.

grant select, insert, update, delete on public.events to service_role;
grant select on public.projects to service_role;
grant select on public.client_contacts to service_role;
grant select, insert, update, delete on public.project_client_access to service_role;
