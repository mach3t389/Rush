-- Fix: client_contacts writes not persisting for real (non-demo) accounts.
--
-- Diagnosis: the table exists (confirmed live), but the RLS policy and/or
-- the GRANT to the `authenticated` role appear to be missing or incomplete —
-- the exact same class of issue as the sidebar_prefs incident (2026-07-12).
-- All Supabase calls in clientTeamStore.ts silently swallow errors
-- (console.error + early return), so a permission-denied write looks like
-- it worked in the UI (optimistic cache update) but never actually saves.
--
-- This migration is idempotent — safe to run even if some/all of it already
-- exists.

alter table client_contacts enable row level security;

drop policy if exists "studio members manage their client contacts" on client_contacts;

create policy "studio members manage their client contacts"
  on client_contacts for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on client_contacts to authenticated;
