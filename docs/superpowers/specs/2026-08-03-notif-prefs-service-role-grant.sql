-- Fixes the "Récap quotidien" cron (handleDigestRun in app/api/send-email.ts,
-- triggered externally via cron-job.org): it queries and updates
-- notif_prefs using the service_role client, but service_role was never
-- granted table-level access on notif_prefs, so every run failed with
-- Postgres error 42501 ("permission denied for table notif_prefs"),
-- surfaced as a 500. RLS bypass and table GRANTs are separate concerns —
-- service_role bypasses row-level policies but still needs an explicit
-- GRANT on the table itself.
--
-- Confirmed via the exact Postgres error from Vercel's function logs,
-- 2026-08-03: { code: '42501', hint: 'Grant the required privileges to
-- the current role with: GRANT SELECT ON public.notif_prefs TO
-- service_role;' } — UPDATE is also needed since handleDigestRun writes
-- last_digest_sent_at back to the same table.
--
-- Run this once, in Supabase -> SQL Editor.

grant select, update on public.notif_prefs to service_role;
