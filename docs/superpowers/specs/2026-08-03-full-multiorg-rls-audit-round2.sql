-- Third and final batch closing out the multi-org RLS audit started
-- 2026-08-03 (see the two prior migration specs in this same folder).
-- A full listing of every RLS policy in the public schema turned up four
-- more tables still checking only studios.owner_user_id, plus two
-- deliberate permission decisions confirmed with the user:
--
--   - my_sections / my_tasks (personal "Mes tâches" data): owner-only,
--     should be any studio member -> my_studio_ids()
--   - project_client_access (who a client contact can see): owner-only,
--     should be any studio member -> my_studio_ids()
--   - studio_invitations (inviting/removing team members): owner-only,
--     confirmed this should be admin-level, not every member ->
--     new my_admin_studio_ids() helper
--   - studio_members (changing another member's role/access level):
--     owner-only, confirmed admins should be able to do this too, but
--     never touch the owner's own row -> my_admin_studio_ids() AND
--     is_owner = false
--   - studios (name/logo/branding): owner-only, confirmed admins should
--     be able to update this too -> my_admin_studio_ids()
--
-- Run this once, in Supabase -> SQL Editor. Idempotent — ALTER POLICY and
-- CREATE OR REPLACE FUNCTION both simply replace what's there, safe to
-- re-run.

-- New helper: same shape as my_studio_ids(), but scoped to members whose
-- access_level is 'owner' or 'admin' — for actions that should be
-- restricted to team-management roles rather than every member.
create or replace function public.my_admin_studio_ids()
returns setof uuid
language sql
stable security definer
as $function$
  select studio_id from public.studio_members
  where user_id = auth.uid() and access_level in ('owner', 'admin');
$function$;

-- my_sections
alter policy my_sections_select_own on public.my_sections
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy my_sections_insert_own on public.my_sections
  with check (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy my_sections_update_own on public.my_sections
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy my_sections_delete_own on public.my_sections
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

-- my_tasks
alter policy my_tasks_select_own on public.my_tasks
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy my_tasks_insert_own on public.my_tasks
  with check (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy my_tasks_update_own on public.my_tasks
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy my_tasks_delete_own on public.my_tasks
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

-- project_client_access
alter policy project_client_access_manage_own on public.project_client_access
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  )
  with check (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

-- studio_invitations — admin-level, not every member (same sensitivity as
-- changing someone else's role, below).
alter policy invitations_select_own on public.studio_invitations
  using (
    studio_id in (select my_admin_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy invitations_insert_own on public.studio_invitations
  with check (
    studio_id in (select my_admin_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

alter policy invitations_delete_own on public.studio_invitations
  using (
    studio_id in (select my_admin_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );

-- studio_members — admins can now update another member's role/access
-- level too, but never the owner's own row.
alter policy members_update_self_or_owner on public.studio_members
  using (
    (user_id = auth.uid())
    or (studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid()))
    or (studio_id in (select my_admin_studio_ids()) and is_owner = false)
  );

-- studios — admins can now update the studio's own name/logo/branding too.
alter policy studios_update_own on public.studios
  using (
    (owner_user_id = auth.uid())
    or (id in (select my_admin_studio_ids()))
  );
