-- 2026-07-15 — Step A of the role/permissions overhaul: a structured
-- access_level column on studio_members, replacing the free-text `role`
-- string as the source of truth for admin/owner permission checks. See
-- docs/superpowers/specs/2026-07-15-access-level-roles-design.md for the
-- full design.
--
-- MANUAL STEP REQUIRED: paste this whole file into Supabase → SQL Editor
-- and run it. Nothing in this project applies migrations automatically —
-- see CLAUDE.md's "Migrations Supabase" section.
--
-- No new RLS policy is needed: the existing "members_update_self_or_owner"
-- policy (added in 2026-07-12-profile-permissions-supabase-migration.sql)
-- already lets the studio owner UPDATE any row in studio_members, which
-- covers this new column with no extra grant.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. New column on studio_members, backfilled from existing data so no
--    existing member silently loses access:
--    - is_owner = true            → 'owner'
--    - is_owner = false, role ~ 'Admin' (case-insensitive) → 'admin'
--    - everyone else              → 'member' (the column default)
-- ─────────────────────────────────────────────────────────────────────────

alter table studio_members
  add column access_level text not null default 'member'
  check (access_level in ('owner', 'admin', 'member'));

update studio_members set access_level = 'owner' where is_owner = true;
update studio_members set access_level = 'admin'
  where is_owner = false and role ilike 'admin';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. New column on studio_invitations — the access level chosen at invite
--    time, carried through to acceptance. 'owner' is intentionally not a
--    valid value here: there is exactly one owner per studio (enforced
--    elsewhere), so an invitation can never grant it.
-- ─────────────────────────────────────────────────────────────────────────

alter table studio_invitations
  add column access_level text
  check (access_level in ('admin', 'member'));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. accept_studio_invitation: copy the invitation's access_level onto the
--    new studio_members row (defaulting to 'member' if null — e.g. for any
--    invitation created before this migration). Same return type (void) as
--    the existing function, so `create or replace` is safe to run more than
--    once.
-- ─────────────────────────────────────────────────────────────────────────

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

  if u.email is null or lower(u.email) <> lower(inv.email) then
    raise exception 'invitation_email_mismatch';
  end if;

  insert into studio_members (studio_id, user_id, name, email, role, initials, avatar_color, is_owner, permissions, access_level)
  values (
    inv.studio_id,
    auth.uid(),
    coalesce(u.raw_user_meta_data->>'full_name', inv.email),
    inv.email,
    inv.role,
    upper(left(coalesce(u.raw_user_meta_data->>'full_name', inv.email), 2)),
    '#5c3d8f',
    false,
    inv.permissions,
    coalesce(inv.access_level, 'member')
  );

  update studio_invitations set status = 'accepted' where token = p_token;
end;
$$;
grant execute on function accept_studio_invitation(text) to authenticated;
