-- ============================================================
-- Fix: Gratuit-plan project cap policy blocked EVERY edit, not just new
-- creations — 2026-08-07
-- Run this entire file once in Supabase → SQL Editor.
-- Safe to re-run: idempotent (drop + recreate).
-- ============================================================

-- Root cause: "block_gratuit_project_overlimit" (added in
-- 2026-08-04-server-side-plan-gating-migration.sql) used `for all`, which
-- applies its `with check` to every UPDATE, not just INSERT. The check
-- counts *other* active projects (correctly excluding the row being
-- written) and blocks the write if a Gratuit studio already has 3+ of
-- them — but that condition is true on EVERY edit once a studio has
-- reached the cap, since the other 3+ projects that put it there don't go
-- away. Practical effect: a Gratuit studio with 3+ active projects could
-- no longer save ANY change to ANY of its projects (rename, client
-- assignment, description, archiving, anything) — confirmed live via a
-- "La modification n'a pas pu être enregistrée" failure trying to remove
-- a project's client, on a studio already past the cap.
--
-- Fix: scope the restrictive check to `for insert` only. Creating a
-- brand-new active project while at/over the cap is still blocked
-- (unchanged) — canCreateNewProject() already gates this client-side too,
-- this is defense-in-depth for that one action, not for editing existing
-- rows. Un-archiving a project past the cap is no longer blocked by this
-- policy (a narrower, pre-existing gap traded for a much bigger one) —
-- not addressed here; flag separately if it needs its own guard later.

drop policy if exists "block_gratuit_project_overlimit" on projects;
create policy "block_gratuit_project_overlimit" on projects
  as restrictive
  for insert
  with check (
    exists (select 1 from studios s where s.id = projects.studio_id and s.plan <> 'gratuit')
    or count_other_active_projects(projects.studio_id, projects.id) < 3
  );
