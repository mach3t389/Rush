-- The new form-sign-put/form-sign-get actions in the file-storage Edge
-- Function (2026-07-25-public-form-submission-migration.sql's file-upload
-- follow-up) query the `resources` table via the service-role client to
-- validate a public form link's resourceId. That query failed in
-- production with "permission denied for table resources" — same root
-- cause as the ai_usage and google_calendar_connections service-role grant
-- bugs (2026-07-13, 2026-07-16): RLS bypass on the service_role Postgres
-- role has no bearing on base table GRANT privileges, and `resources` was
-- never explicitly granted to service_role because nothing used to query
-- it with that role.
--
-- MANUAL STEP REQUIRED: paste this into Supabase → SQL Editor and run it.

grant select on resources to service_role;
