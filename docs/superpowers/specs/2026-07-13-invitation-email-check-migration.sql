-- 2026-07-13 — Final-review fixes for the multi-organization feature
-- (see docs/superpowers/plans/2026-07-13-multi-organization-plan.md, Task 5).
--
-- MANUAL STEP REQUIRED: paste this whole file into Supabase → SQL Editor and
-- run it. Nothing in this project applies migrations automatically — see
-- CLAUDE.md's "Migrations Supabase" section. Both statements below are
-- idempotent `create or replace function` calls, safe to run more than once.

-- ─────────────────────────────────────────────────────────────────────────
-- Fix 1 (Critical): accept_studio_invitation never checked that the caller's
-- email matches the invitation's target email.
--
-- Before this feature, the only way to accept an invitation was through
-- register(), which always used the invitation's own email to create the
-- account — so the caller's email was implicitly guaranteed to match by
-- construction. This same feature added a second path: an ALREADY-LOGGED-IN
-- user can now open an invitation link and accept it with their existing
-- session. React checks that the logged-in email matches the invitation's
-- email before showing the "join" button (see TeamInvitationAccept.tsx) —
-- but that check is UI-only. Nothing stopped a signed-in user from calling
-- `supabase.rpc('accept_studio_invitation', { p_token: '<token>' })` directly
-- with someone else's leaked/forwarded invitation token and joining an
-- organisation the invitation was never addressed to them for. This
-- replaces the function (already live in the real database) to add a
-- server-side email check, closing that gap.
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

-- ─────────────────────────────────────────────────────────────────────────
-- Fix 2 (part of Important Finding 3): get_studio_invitation didn't return
-- studio_id, which the client now needs to switch the active organisation
-- to the one just joined (see Finding 3 of the 2026-07-13 final review —
-- previously, accepting an invitation as an already-logged-in user left the
-- OLD organisation active, so the user silently joined the new org but kept
-- looking at the old one). Widening a security-definer function's return
-- columns to include a public, non-sensitive identifier is safe — studio_id
-- is already implicitly disclosed via studio_name.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function get_studio_invitation(p_token text)
returns table (email text, role text, studio_name text, status text, studio_id uuid)
language sql security definer as $$
  select si.email, si.role, s.name, si.status, si.studio_id
  from studio_invitations si
  join studios s on s.id = si.studio_id
  where si.token = p_token;
$$;
grant execute on function get_studio_invitation(text) to anon, authenticated;
