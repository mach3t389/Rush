-- google_calendar_connections was created with RLS enabled and *zero* grants,
-- on the assumption that service_role bypassing RLS was enough. It isn't:
-- RLS bypass has no bearing on base table GRANT privileges, so the serverless
-- functions (oauth-callback, status, disconnect, pull) were all failing with
-- "permission denied for table google_calendar_connections" (42501).
-- Same root cause as the ai_usage service_role grant bug fixed 2026-07-14.
-- Run once in the Supabase SQL editor.

grant select, insert, update, delete on public.google_calendar_connections to service_role;
