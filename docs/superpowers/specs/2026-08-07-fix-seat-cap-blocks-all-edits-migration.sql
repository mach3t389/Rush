-- ============================================================
-- Fix: Gratuit-plan seat cap policy blocked EVERY member edit, not just
-- adding a new one over the cap — 2026-08-07
-- Run this entire file once in Supabase → SQL Editor.
-- Safe to re-run: idempotent (drop + recreate).
-- ============================================================

-- Same bug as "block_gratuit_project_overlimit"
-- (see 2026-08-07-fix-project-cap-blocks-all-edits-migration.sql), found by
-- auditing for sibling instances of that exact pattern: "block_seat_overlimit"
-- also used `for all`, so its `with check` applies to every UPDATE, not just
-- INSERT. It counts *other* studio members (correctly excluding the row
-- being written) and blocks the write if that count is already at/over
-- billing_seats — but once a studio has more members than its plan allows
-- (e.g. downgraded from Agence to Gratuit while still having 5 members
-- against a cap of 2, a plausible real state), that condition is true on
-- EVERY edit to EVERY member row forever, since the other members that put
-- it there don't go away. Practical effect: such a studio could no longer
-- save ANY change to ANY studio_members row (role change, anything)
-- referencing this table's RLS.
--
-- Fix: scope to `for insert` only — blocks adding a member beyond the cap
-- (unchanged), stops blocking edits to already-existing member rows.

drop policy if exists "block_seat_overlimit" on studio_members;
create policy "block_seat_overlimit" on studio_members
  as restrictive
  for insert
  with check (
    count_other_studio_members(studio_members.studio_id, studio_members.id) < (
      select coalesce(billing_seats, 2) from studios s
      where s.id = studio_members.studio_id
    )
  );
