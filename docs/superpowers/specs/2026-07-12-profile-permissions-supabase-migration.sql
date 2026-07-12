-- Profile fields, permissions, and photo for internal team members + client
-- contacts. Run once in the Supabase SQL editor.
--
-- Previously: ProfileEditPanel.tsx's loadProfile/saveProfile/loadPhoto/
-- savePhoto/loadPermissions/savePermissions were localStorage-only, keyed by
-- the real user id — meanwhile FicheClient.tsx's own internal-member editor
-- (Équipe tab) reimplemented the SAME feature under a DIFFERENT key (the
-- client_contacts row id, not the real user id), so the two editors never
-- actually agreed with each other even on the same browser. This migration
-- makes studio_members the single real source of truth for both.

-- New columns on the existing studio_members table.
alter table studio_members add column phone text;
alter table studio_members add column photo_url text;
alter table studio_members add column permissions text[];

-- studio_members previously had no update grant at all (rows were only ever
-- created by security-definer functions) — needed now so a member can edit
-- their own profile, and the owner can edit anyone's permissions/role.
create policy "members_update_self_or_owner" on studio_members for update
  using (
    user_id = auth.uid()
    or studio_id in (select id from studios where owner_user_id = auth.uid())
  );
grant update on studio_members to authenticated;

-- Carries the permissions chosen at invite time through to acceptance —
-- previously createInvitation had nowhere real to put them, so they were
-- saved under the invite email (a key nothing ever read back once the real
-- member existed under their own user id) and silently lost.
alter table studio_invitations add column permissions text[];

create or replace function accept_studio_invitation(p_token text)
returns void
language plpgsql security definer as $$
declare
  inv studio_invitations%rowtype;
  u auth.users%rowtype;
begin
  select * into inv from studio_invitations where token = p_token and status = 'pending';
  if not found then
    raise exception 'invalid_or_used_invitation';
  end if;

  select * into u from auth.users where id = auth.uid();

  insert into studio_members (studio_id, user_id, name, email, role, initials, avatar_color, is_owner, permissions)
  values (
    inv.studio_id,
    auth.uid(),
    coalesce(u.raw_user_meta_data->>'full_name', inv.email),
    inv.email,
    inv.role,
    upper(left(coalesce(u.raw_user_meta_data->>'full_name', inv.email), 2)),
    '#5c3d8f',
    false,
    inv.permissions
  );

  update studio_invitations set status = 'accepted' where token = p_token;
end;
$$;
grant execute on function accept_studio_invitation(text) to authenticated;

-- New column on client_contacts — external contacts and internal members
-- mirrored into a client's team both get a real photo field, instead of
-- the previous browser-only copy that also used the wrong key for internal
-- members (client_contacts row id instead of their real user id).
alter table client_contacts add column photo_url text;
