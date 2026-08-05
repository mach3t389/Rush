-- Adds SELECT access to studio_invitations for studio members, needed by the
-- new "Invitations en attente" list in MonEquipe.tsx (getPendingInvitations()
-- in teamStore.ts). Previously this table was only ever written to
-- (createInvitation's insert) or read one-row-at-a-time via the
-- get_studio_invitation SECURITY DEFINER RPC (by token, for the accept
-- flow) — no direct client-side SELECT existed, so no read grant/policy was
-- ever needed until now.
--
-- Idempotent — safe to run even if some/all of it already exists.

alter table studio_invitations enable row level security;

drop policy if exists "studio members view their studio's invitations" on studio_invitations;

create policy "studio members view their studio's invitations"
  on studio_invitations for select
  using (studio_id in (select my_studio_ids()));

grant select on studio_invitations to authenticated;
