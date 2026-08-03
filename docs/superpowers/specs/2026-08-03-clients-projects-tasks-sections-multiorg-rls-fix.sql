-- Fix: clients/projects/sections/tasks RLS policies never followed the
-- 2026-07-13 multi-org migration (docs/superpowers/specs/2026-07-13-multi-org-migration.sql).
--
-- That migration introduced studio_members as the real membership model
-- (a person can belong to more than one organisation) and my_studio_ids()
-- as the helper function every table's RLS should check. events and
-- resources were updated to use it (OR'd alongside the legacy
-- studios.owner_user_id check for backward compat). clients, projects,
-- sections, and tasks were missed — their policies still check ONLY
-- studios.owner_user_id = auth.uid(), so any studio member who is not the
-- original owner (admin or otherwise) gets zero rows back, even though
-- their studio_members row is completely valid.
--
-- Symptom this fixes: a team member accepts an invitation, sees the
-- organisation itself (name/branding), but Projets and Clients are empty,
-- and other members can't assign them to tasks — confirmed live on the
-- "Meshwork" studio, 2026-08-03.
--
-- Run this once, in Supabase -> SQL Editor. Idempotent — ALTER POLICY simply
-- replaces the USING/WITH CHECK expression, safe to re-run.

-- clients
alter policy clients_select_own on public.clients
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy clients_insert_own on public.clients
  with check (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy clients_update_own on public.clients
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy clients_delete_own on public.clients
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

-- projects
alter policy projects_select_own on public.projects
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy projects_insert_own on public.projects
  with check (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy projects_update_own on public.projects
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy projects_delete_own on public.projects
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

-- sections
alter policy sections_select_own on public.sections
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy sections_insert_own on public.sections
  with check (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy sections_update_own on public.sections
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy sections_delete_own on public.sections
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

-- tasks
alter policy tasks_select_own on public.tasks
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy tasks_insert_own on public.tasks
  with check (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy tasks_update_own on public.tasks
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy tasks_delete_own on public.tasks
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );
