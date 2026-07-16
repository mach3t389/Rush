-- 2026-07-16 — Client portal cleanup: expose the inviting studio's logo to
-- the two invitation RPCs, so ClientInvitationAccept.tsx and
-- TeamInvitationAccept.tsx can show the studio's own branding instead of
-- generic Rush branding. See
-- docs/superpowers/specs/2026-07-16-client-portal-cleanup-design.md.
--
-- MANUAL STEP REQUIRED: paste this whole file into Supabase → SQL Editor
-- and run it (or apply via an authorized Supabase MCP tool call, with
-- explicit user confirmation — do not apply automatically). Nothing in
-- this project applies migrations automatically — see CLAUDE.md's
-- "Migrations Supabase" section.
--
-- Both functions are dropped and recreated (not `create or replace`)
-- because Postgres rejects changing a RETURNS TABLE column list in place —
-- same reasoning as every prior invitation-RPC column addition in this
-- project (see 2026-07-13-invitation-email-check-migration.sql and
-- 2026-07-15-client-access-migration.sql).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. get_client_invitation: add studio_logo_full / studio_logo_square.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists get_client_invitation(text);

create or replace function get_client_invitation(p_token text)
returns table (
  outcome text,
  client_id text,
  client_name text,
  contact_id text,
  contact_name text,
  contact_email text,
  portal_permissions jsonb,
  studio_name text,
  studio_logo_full text,
  studio_logo_square text
)
language sql security definer as $$
  select ci.outcome, ci.client_id, c.name, ci.contact_id, cc.name, cc.email, cc.portal_permissions, s.name, s.logo_full, s.logo_square
  from client_invitations ci
  join clients c on c.id = ci.client_id
  join client_contacts cc on cc.id = ci.contact_id
  join studios s on s.id = ci.studio_id
  where ci.token = p_token;
$$;
grant execute on function get_client_invitation(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. get_studio_invitation: add studio_logo_full / studio_logo_square.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists get_studio_invitation(text);

create or replace function get_studio_invitation(p_token text)
returns table (email text, role text, studio_name text, status text, studio_id uuid, studio_logo_full text, studio_logo_square text)
language sql security definer as $$
  select si.email, si.role, s.name, si.status, si.studio_id, s.logo_full, s.logo_square
  from studio_invitations si
  join studios s on s.id = si.studio_id
  where si.token = p_token;
$$;
grant execute on function get_studio_invitation(text) to anon, authenticated;
