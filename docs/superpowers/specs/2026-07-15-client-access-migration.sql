-- 2026-07-15 — Step B of the role/permissions overhaul: real client accounts
-- + read-only RLS access to their projects. See
-- docs/superpowers/specs/2026-07-15-client-accounts-and-access-design.md for
-- the full design.
--
-- MANUAL STEP REQUIRED: paste this whole file into Supabase → SQL Editor and
-- run it. Nothing in this project applies migrations automatically — see
-- CLAUDE.md's "Migrations Supabase" section.
--
-- IMPORTANT — read before running: this repo's docs have drifted from the
-- live schema before (my_studio_ids() is used by several existing policies
-- but its definition exists nowhere in docs/superpowers/specs/*.sql — it was
-- evidently created directly in Supabase). This migration does NOT depend on
-- or touch any existing policy or function — every policy below is NEW and
-- ADDITIVE (Postgres OR's multiple SELECT policies together, so adding one
-- never narrows or replaces access an existing policy already grants).
-- Still, before running, please confirm in the Supabase table editor that:
--   (a) `resources.id` and `file_items.resource_id` have the SAME type
--       (one doc says resources.id is `text`, another implies
--       resource_content.resource_id is `uuid` — if there's a real mismatch,
--       the `resources`/`resource_content` policies below (section 6) will
--       fail to run with a clear type-mismatch error; if that happens, the
--       fix is to change every `text` in section 6 below to `uuid`, or vice
--       versa, to match whatever the live columns actually are).
--   (b) `sections.project_id`, `tasks.project_id`, `invoices.project_id`,
--       `file_folders.project_id`, `file_items.project_id` are all `text`
--       (matching `projects.id text primary key`) — this migration assumes
--       they are, per docs/superpowers/specs/2026-07-04-tasks-supabase-
--       migration-design.md and 2026-07-08-finance-supabase-migration-
--       design.md and 2026-07-06-files-metadata-supabase-migration-design.md.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Link a client contact to their real Supabase Auth account. Set once,
--    at invitation-acceptance time (see accept_client_invitation below).
--    Not unique: the same real person (same auth.users row) could in theory
--    be an invited contact for two different studios (two agencies) — that
--    produces two different client_contacts rows, both pointing at the same
--    user_id, which is fine for RLS purposes (each row is scoped to its own
--    studio_id/client_id).
-- ─────────────────────────────────────────────────────────────────────────

alter table client_contacts add column user_id uuid references auth.users(id);
create index if not exists client_contacts_user_id_idx on client_contacts(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Which projects a client contact can read. This is the ONLY place new
--    RLS policies query — never the `projects.members` jsonb column
--    directly (not indexable, not queryable efficiently in a policy). Kept
--    in sync by the application (see Task 11 of the implementation plan:
--    ProjectMembres.tsx's persistMembers) every time a client contact is
--    added to or removed from a project's members list. Studio owners
--    manage this table like any other studio-scoped table; clients never
--    read this table directly (their access comes from the policies in
--    sections 4-6 below, which call is_client_contact_for_project()).
-- ─────────────────────────────────────────────────────────────────────────

create table project_client_access (
  project_id text not null references projects(id) on delete cascade,
  client_contact_id text not null references client_contacts(id) on delete cascade,
  studio_id uuid not null references studios(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, client_contact_id)
);

alter table project_client_access enable row level security;

create policy "project_client_access_manage_own" on project_client_access
  for all
  using (studio_id in (select id from studios where owner_user_id = auth.uid()))
  with check (studio_id in (select id from studios where owner_user_id = auth.uid()));

grant select, insert, update, delete on project_client_access to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Helper function used by every new client-access policy below. security
--    definer so it can read project_client_access/client_contacts
--    regardless of the calling client's own RLS visibility into those two
--    tables (a client is never granted direct SELECT on either — see
--    section 2's comment). Mirrors the is_studio_member() precedent in
--    docs/superpowers/specs/2026-07-14-studios-rls-recursion-fix-
--    migration.sql.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function is_client_contact_for_project(p_project_id text)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1
    from project_client_access pca
    join client_contacts cc on cc.id = pca.client_contact_id
    where pca.project_id = p_project_id and cc.user_id = auth.uid()
  );
$$;
grant execute on function is_client_contact_for_project(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Read-only client access to project status.
-- ─────────────────────────────────────────────────────────────────────────

create policy "projects_select_client_access" on projects
  for select
  using (is_client_contact_for_project(id));

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Read-only client access to tasks/calendar and invoices.
-- ─────────────────────────────────────────────────────────────────────────

create policy "sections_select_client_access" on sections
  for select
  using (is_client_contact_for_project(project_id));

create policy "tasks_select_client_access" on tasks
  for select
  using (is_client_contact_for_project(project_id));

create policy "invoices_select_client_access" on invoices
  for select
  using (project_id is not null and is_client_contact_for_project(project_id));

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Read-only client access to files/resources. `resources` and
--    `resource_content` have no project_id of their own — per CLAUDE.md
--    ("Ressources = Fichiers"), a resource is always backed by a
--    `file_items` row (via file_items.resource_id), and file_items DOES
--    carry project_id — so client access to a resource is scoped through
--    that file_items row instead.
-- ─────────────────────────────────────────────────────────────────────────

create policy "file_folders_select_client_access" on file_folders
  for select
  using (project_id is not null and is_client_contact_for_project(project_id));

create policy "file_items_select_client_access" on file_items
  for select
  using (project_id is not null and is_client_contact_for_project(project_id));

create policy "resources_select_client_access" on resources
  for select
  using (
    id in (
      select resource_id from file_items
      where resource_id is not null
        and project_id is not null
        and is_client_contact_for_project(project_id)
    )
  );

create policy "resource_content_select_client_access" on resource_content
  for select
  using (
    resource_id in (
      select resource_id from file_items
      where resource_id is not null
        and project_id is not null
        and is_client_contact_for_project(project_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 7. get_client_invitation: also return the contact's email, needed by the
--    new account-creation form (ClientInvitationAccept.tsx) to pre-fill and
--    lock the email field, matching how get_studio_invitation already
--    exposes the invited email for the team-invitation equivalent. Dropped
--    and recreated (not create or replace) because this widens the RETURNS
--    TABLE column list, which Postgres rejects via create or replace — same
--    reasoning as the fix applied to get_studio_invitation in
--    docs/superpowers/specs/2026-07-13-invitation-email-check-migration.sql.
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
  studio_name text
)
language sql security definer as $$
  select ci.outcome, ci.client_id, c.name, ci.contact_id, cc.name, cc.email, cc.portal_permissions, s.name
  from client_invitations ci
  join clients c on c.id = ci.client_id
  join client_contacts cc on cc.id = ci.contact_id
  join studios s on s.id = ci.studio_id
  where ci.token = p_token;
$$;
grant execute on function get_client_invitation(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. accept_client_invitation: creates the account↔contact link. Requires
--    the caller to already be authenticated (the client just called
--    supabase.auth.signUp or signInWithPassword client-side — see
--    authStore.ts's registerClient()). Checks the caller's email matches
--    the invitation's contact email BEFORE linking, closing the same class
--    of gap that accept_studio_invitation had to be patched for after the
--    fact (docs/superpowers/specs/2026-07-13-invitation-email-check-
--    migration.sql) — applied here from the start instead.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function accept_client_invitation(p_token text)
returns void
language plpgsql security definer as $$
declare
  inv client_invitations%rowtype;
  contact_email text;
  u auth.users%rowtype;
begin
  select * into inv from client_invitations where token = p_token and outcome = 'pending';
  if not found then
    raise exception 'invalid_or_used_invitation';
  end if;

  select * into u from auth.users where id = auth.uid();
  if u.email is null then
    raise exception 'not_authenticated';
  end if;

  select email into contact_email from client_contacts where id = inv.contact_id;
  if contact_email is null or lower(u.email) <> lower(contact_email) then
    raise exception 'invitation_email_mismatch';
  end if;

  update client_contacts set user_id = auth.uid(), status = 'active' where id = inv.contact_id;
  update client_invitations set outcome = 'accepted' where token = p_token;
end;
$$;
grant execute on function accept_client_invitation(text) to authenticated;
