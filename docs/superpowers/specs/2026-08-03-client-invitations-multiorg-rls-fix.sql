-- Second occurrence of the same gap fixed in
-- 2026-08-03-clients-projects-tasks-sections-multiorg-rls-fix.sql: the
-- 2026-07-13 multi-org migration introduced my_studio_ids() as the RLS
-- check every studio-scoped table should use (a person can belong to more
-- than one organisation via studio_members), but client_invitations was
-- never updated — its single "ALL" policy still checks only
-- studios.owner_user_id = auth.uid(), so a non-owner studio member can't
-- read, create, or manage client invitations for their own studio.
--
-- Found during a full audit of the remaining Supabase tables after the
-- first occurrence surfaced live on a real invited member, 2026-08-03.
--
-- Run this once, in Supabase -> SQL Editor. Idempotent — ALTER POLICY simply
-- replaces the USING/WITH CHECK expression, safe to re-run.

alter policy "studio members manage their own client invitations" on public.client_invitations
  using (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  )
  with check (
    studio_id in (select my_studio_ids())
    or studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid())
  );
