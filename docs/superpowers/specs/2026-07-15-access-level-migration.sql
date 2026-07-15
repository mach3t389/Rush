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
-- covers this new column with no extra grant. That policy has no WITH
-- CHECK clause though, so it also lets a plain Member UPDATE their own
-- row unrestricted — including access_level. Section 4 below adds a
-- BEFORE UPDATE trigger (not an RLS policy) to close that specific gap.

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

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Trigger: block non-owner changes to access_level. The existing
--    "members_update_self_or_owner" RLS policy (see header comment above)
--    has a USING clause but no WITH CHECK, so Postgres reuses USING as the
--    check too — which means a plain Member can UPDATE their own
--    studio_members row (user_id = auth.uid() is true for their own row),
--    and nothing at the database layer stops them from setting their own
--    access_level to 'admin'. The app's UI never offers that button to a
--    Member, but RLS alone does not enforce it — a direct REST/JS call
--    could. This trigger is a belt-and-suspenders check at the DB layer:
--    it only rejects UPDATEs that actually change access_level, and only
--    when the caller isn't the studio's owner. Ordinary self-profile edits
--    (name, phone, role, photo, permissions) never touch access_level, so
--    they pass through untouched. The studio owner can still change any
--    member's access_level (including their own row, e.g. the
--    insertOwnerMembership upsert in app/src/data/studioStore.ts, which
--    sets access_level = 'owner' on the owner's own row at studio-creation
--    time — the caller is the studio's owner by construction there).
--    is_owner is intentionally left unprotected here — out of scope for
--    this fix.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function prevent_access_level_self_escalation()
returns trigger
language plpgsql security definer as $$
begin
  if new.access_level is distinct from old.access_level then
    if not exists (
      select 1 from studios
      where id = new.studio_id and owner_user_id = auth.uid()
    ) then
      raise exception 'only_owner_can_change_access_level';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_access_level_self_escalation on studio_members;
create trigger trg_prevent_access_level_self_escalation
  before update on studio_members
  for each row execute function prevent_access_level_self_escalation();
