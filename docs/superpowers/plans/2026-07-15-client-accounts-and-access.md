# Client Accounts and Access (Step B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give invited client contacts a real Supabase Auth account and read-only, RLS-scoped access to the projects they've been added to (status, files/resources, tasks, invoices) — replacing the non-functional token-link portal — without ever letting a client-authenticated session touch studio-scoped code paths (which would silently auto-provision them a phantom studio).

**Architecture:** A new `client_contacts.user_id` column links a contact to their Supabase Auth account, set at invitation-acceptance time by a new `accept_client_invitation` RPC (mirroring the existing team-invitation flow). A new `project_client_access` table — kept in sync from the single place `project.members` is written (`ProjectMembres.tsx`'s `persistMembers`) — is the indexable source of truth new RLS policies query, rather than querying the `members` JSONB blob directly. New, **additive** SELECT-only RLS policies (never replacing or modifying any existing policy — Postgres OR's same-command policies together, so this is safe even though this repo's live RLS state has drifted from its own docs in places) grant client-contact read access to `projects`, `sections`/`tasks`, `invoices`, `file_folders`/`file_items`, and `resources`/`resource_content`. A new client-session detection layer, checked before any studio-scoped store is touched, routes client-authenticated users to a minimal new placeholder screen instead of the studio `AppShell`.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS + Auth), react-router-dom v7 (data router), i18next. No automated test suite in this project (per `CLAUDE.md`) — verification is `npm run build` (TypeScript check) after each code task, plus a manual browser walkthrough in the final task.

## Global Constraints

- Never hardcode user-facing text — all UI strings go through `t('namespace.key')`, with the key added to `app/src/locales/fr.json` **and** `app/src/locales/en.json` first (per `CLAUDE.md`'s i18n rule).
- Supabase migrations are never applied automatically in this project — the SQL file this plan produces must be pasted into Supabase → SQL Editor by the user manually.
- This step is **read-only** for clients: no approval actions, no comments, no writes of any kind from a client-authenticated session. Every new RLS policy in this plan is a `for select` policy — never `for all`, `for insert`, `for update`, or `for delete`.
- Demo sessions (`isDemoSession()` true) must keep working exactly as today — this plan's new code paths are real-session-only (client accounts don't exist as a concept in demo mode); demo branches in touched files return early / are left untouched wherever a demo equivalent already exists.
- The old `/portail/:projectId` token-link flow is replaced, not kept in parallel (per the approved design).
- All styling in touched files is inline `style={}` using the existing CSS custom properties, matching the surrounding file's conventions — this project uses Tailwind only marginally.
- **Known documentation drift, called out explicitly so no task treats it as a surprise:** this repo's `docs/superpowers/specs/*.sql` files do not always match the live Supabase schema — `my_studio_ids()` is referenced by several existing policies but its `create function` body exists nowhere in the docs (defined directly in Supabase at some point, undocumented), and `resource_content.resource_id` is declared `uuid` in one doc while `resources.id` is declared `text` in another. This plan's SQL migration (Task 1) does not depend on or modify either of those — it only **adds new, independent SELECT policies** — but Task 1's Step 2 explicitly asks the user to sanity-check a couple of column types against the live schema before running, precisely because these docs have been wrong before.

---

### Task 1: Supabase migration — client account linkage, project access table, and read-only RLS

**Files:**
- Create: `docs/superpowers/specs/2026-07-15-client-access-migration.sql`

**Interfaces:**
- Produces: `client_contacts.user_id` (uuid, nullable, references `auth.users(id)`); table `project_client_access(project_id text, client_contact_id text, studio_id uuid)`; function `is_client_contact_for_project(p_project_id text) returns boolean`; function `accept_client_invitation(p_token text) returns void`; `get_client_invitation` extended to also return `contact_email`. New additive SELECT policies on `projects`, `sections`, `tasks`, `invoices`, `file_folders`, `file_items`, `resources`, `resource_content`.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Ask the user to run the migration**

This step cannot be automated. Tell the user: "Colle et exécute `docs/superpowers/specs/2026-07-15-client-access-migration.sql` dans Supabase → SQL Editor. Avant de l'exécuter, vérifie rapidement dans l'éditeur de tables Supabase que `resources.id` et `file_items.resource_id` ont bien le même type (texte ou uuid) — sinon la section 6 du script renverra une erreur claire à corriger avant de continuer." Do not proceed to real-session verification (Task 12) until the user confirms this ran without error.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-15-client-access-migration.sql
git commit -m "docs: add client-accounts-and-access Supabase migration for Step B"
```

---

### Task 2: `clientContactsStore.ts` — add `authUserId` to `ClientContact`

**Files:**
- Modify: `app/src/data/clientContactsStore.ts`

**Interfaces:**
- Produces: `ClientContact.authUserId?: string` — the Supabase Auth `user_id` once the contact has registered. Deliberately a **different field** from the existing `userId?: string` (which means "linked `studio_members` row, internal contacts only" — see the comment on that field). Consumed by Task 3 (`clientTeamStore.ts`) and later tasks.

- [ ] **Step 1: Add the field**

Replace:

```ts
export interface ClientContact {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'active' | 'invited' | 'pending';
  initials: string;
  color: string;
  internal?: boolean;
  userId?: string; // links to USERS key if internal studio member (demo sessions only)
  portalPermissions: PortalPermissions;
  photoUrl?: string;
}
```

with:

```ts
export interface ClientContact {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'active' | 'invited' | 'pending';
  initials: string;
  color: string;
  internal?: boolean;
  userId?: string; // links to USERS key if internal studio member (demo sessions only)
  authUserId?: string; // links to the contact's own Supabase Auth account, once registered (Step B) — distinct from `userId` above
  portalPermissions: PortalPermissions;
  photoUrl?: string;
}
```

- [ ] **Step 2: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors — this is an additive optional field, nothing constructing a `ClientContact` literal is affected.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/clientContactsStore.ts
git commit -m "feat: add authUserId field to ClientContact"
```

---

### Task 3: `clientTeamStore.ts` — read/write `user_id` as `authUserId`

**Files:**
- Modify: `app/src/data/clientTeamStore.ts`

**Interfaces:**
- Consumes: `ClientContact.authUserId` (Task 2).
- Produces: `ClientContactRow.user_id` mapped to/from `ClientContact.authUserId` in `toContact()`/`toRow()`; `fetchSupabaseContacts()`'s select list includes `user_id`.

- [ ] **Step 1: Add `user_id` to the row shape**

Replace:

```ts
interface ClientContactRow {
  id: string;
  client_id: string;
  studio_id: string;
  name: string;
  role: string;
  email: string;
  status: string;
  initials: string;
  color: string;
  internal: boolean;
  studio_member_id: string | null;
  portal_permissions: { approve: boolean; comment: boolean; download: boolean };
  photo_url: string | null;
}
```

with:

```ts
interface ClientContactRow {
  id: string;
  client_id: string;
  studio_id: string;
  name: string;
  role: string;
  email: string;
  status: string;
  initials: string;
  color: string;
  internal: boolean;
  studio_member_id: string | null;
  user_id: string | null;
  portal_permissions: { approve: boolean; comment: boolean; download: boolean };
  photo_url: string | null;
}
```

- [ ] **Step 2: Map `user_id` in `toContact()`/`toRow()`**

Replace:

```ts
function toContact(row: ClientContactRow): ClientContact {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    status: row.status as ClientContact['status'],
    initials: row.initials,
    color: row.color,
    internal: row.internal,
    userId: row.studio_member_id ?? undefined,
    portalPermissions: row.portal_permissions,
    photoUrl: row.photo_url ?? undefined,
  };
}
```

with:

```ts
function toContact(row: ClientContactRow): ClientContact {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    status: row.status as ClientContact['status'],
    initials: row.initials,
    color: row.color,
    internal: row.internal,
    userId: row.studio_member_id ?? undefined,
    authUserId: row.user_id ?? undefined,
    portalPermissions: row.portal_permissions,
    photoUrl: row.photo_url ?? undefined,
  };
}
```

Replace:

```ts
function toRow(c: ClientContact, clientId: string, studioId: string): ClientContactRow {
  return {
    id: c.id,
    client_id: clientId,
    studio_id: studioId,
    name: c.name,
    role: c.role,
    email: c.email,
    status: c.status,
    initials: c.initials,
    color: c.color,
    internal: !!c.internal,
    studio_member_id: c.userId ?? null,
    portal_permissions: c.portalPermissions,
    photo_url: c.photoUrl ?? null,
  };
}
```

with:

```ts
function toRow(c: ClientContact, clientId: string, studioId: string): ClientContactRow {
  return {
    id: c.id,
    client_id: clientId,
    studio_id: studioId,
    name: c.name,
    role: c.role,
    email: c.email,
    status: c.status,
    initials: c.initials,
    color: c.color,
    internal: !!c.internal,
    studio_member_id: c.userId ?? null,
    user_id: c.authUserId ?? null,
    portal_permissions: c.portalPermissions,
    photo_url: c.photoUrl ?? null,
  };
}
```

- [ ] **Step 3: Select the new column**

Replace:

```ts
async function fetchSupabaseContacts(clientId: string): Promise<void> {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId);
```

with (unchanged — `select('*')` already includes the new `user_id` column once Task 1's migration runs, no edit needed here):

```ts
async function fetchSupabaseContacts(clientId: string): Promise<void> {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId);
```

Skip this step — `select('*')` already covers the new column once the migration (Task 1) has run. No file change needed for this specific concern; Step 3 exists in this brief only to document that it was checked, not skipped by oversight.

- [ ] **Step 4: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors from `clientTeamStore.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/clientTeamStore.ts
git commit -m "feat: read/write client_contacts.user_id as ClientContact.authUserId"
```

---

### Task 4: `invitationStore.ts` — carry `contactEmail` through, add `acceptClientAccount`

**Files:**
- Modify: `app/src/data/invitationStore.ts`

**Interfaces:**
- Produces: `InvitationDetails.contactEmail: string`; new `export async function acceptClientAccount(token: string): Promise<void>` calling the new `accept_client_invitation` RPC. Consumed by Task 8 (`ClientInvitationAccept.tsx`).
- The existing `acceptInvitation`/`declineInvitation`/`createInvitation`/`getInvitationLink` functions are **unchanged** — they remain the "studio side" functions used by `FicheClient.tsx` to invite/resend/track contacts. `acceptClientAccount` is a new, separate function specifically for the invited client's own acceptance flow (real sessions only — demo sessions never reach `ClientInvitationAccept.tsx`'s registration path in the first place, since demo accounts are fixed and never go through invitation acceptance).

- [ ] **Step 1: Add `contactEmail` to `InvitationDetails` and map it**

Replace:

```ts
export interface InvitationDetails {
  outcome: 'pending' | 'accepted' | 'declined';
  clientId: string;
  clientName: string;
  contactId: string;
  contactName: string;
  portalPermissions: PortalPermissions;
  studioName: string;
}
```

with:

```ts
export interface InvitationDetails {
  outcome: 'pending' | 'accepted' | 'declined';
  clientId: string;
  clientName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  portalPermissions: PortalPermissions;
  studioName: string;
}
```

Replace:

```ts
export async function getInvitationDetails(token: string): Promise<InvitationDetails | null> {
  if (isDemoSession()) {
    const invitation = _invitations.find(i => i.token === token);
    if (!invitation) return null;
    const client = findClient(invitation.clientId);
    if (!client) return null;
    const contact = getClientTeam(invitation.clientId).find(c => c.id === invitation.contactId);
    // A resolved invitation's contact may no longer exist in the live store
    // (declined invitations remove the contact) — only a still-pending
    // invitation needs the contact record to render (name, permissions).
    if (invitation.outcome === 'pending' && !contact) return null;
    return {
      outcome: invitation.outcome,
      clientId: client.id,
      clientName: client.name,
      contactId: invitation.contactId,
      contactName: contact?.name ?? '',
      portalPermissions: contact?.portalPermissions ?? DEFAULT_PORTAL_PERMISSIONS,
      studioName: localStorage.getItem(STUDIO_NAME_KEY) ?? 'Rush',
    };
  }

  const { data, error } = await supabase.rpc('get_client_invitation', { p_token: token });
  if (error) { console.error('getInvitationDetails failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    outcome: row.outcome,
    clientId: row.client_id,
    clientName: row.client_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    portalPermissions: row.portal_permissions ?? DEFAULT_PORTAL_PERMISSIONS,
    studioName: row.studio_name ?? 'Rush',
  };
}
```

with:

```ts
export async function getInvitationDetails(token: string): Promise<InvitationDetails | null> {
  if (isDemoSession()) {
    const invitation = _invitations.find(i => i.token === token);
    if (!invitation) return null;
    const client = findClient(invitation.clientId);
    if (!client) return null;
    const contact = getClientTeam(invitation.clientId).find(c => c.id === invitation.contactId);
    // A resolved invitation's contact may no longer exist in the live store
    // (declined invitations remove the contact) — only a still-pending
    // invitation needs the contact record to render (name, permissions).
    if (invitation.outcome === 'pending' && !contact) return null;
    return {
      outcome: invitation.outcome,
      clientId: client.id,
      clientName: client.name,
      contactId: invitation.contactId,
      contactName: contact?.name ?? '',
      contactEmail: contact?.email ?? '',
      portalPermissions: contact?.portalPermissions ?? DEFAULT_PORTAL_PERMISSIONS,
      studioName: localStorage.getItem(STUDIO_NAME_KEY) ?? 'Rush',
    };
  }

  const { data, error } = await supabase.rpc('get_client_invitation', { p_token: token });
  if (error) { console.error('getInvitationDetails failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    outcome: row.outcome,
    clientId: row.client_id,
    clientName: row.client_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email ?? '',
    portalPermissions: row.portal_permissions ?? DEFAULT_PORTAL_PERMISSIONS,
    studioName: row.studio_name ?? 'Rush',
  };
}
```

- [ ] **Step 2: Add `acceptClientAccount`**

Add this new exported function immediately after the existing `acceptInvitation`:

```ts
// Called after the invited client has just authenticated (registered or
// logged in) on ClientInvitationAccept.tsx — links their new Supabase Auth
// account to this client_contacts row via the accept_client_invitation RPC
// (checks the caller's email matches the invitation server-side). Distinct
// from acceptInvitation() above, which only flips status to 'active' and is
// still used by the studio-side flows that don't involve account creation.
export async function acceptClientAccount(token: string): Promise<void> {
  const { error } = await supabase.rpc('accept_client_invitation', { p_token: token });
  if (error) throw error;
}
```

- [ ] **Step 3: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: **fails** — `InvitationAccept.tsx` (the existing client-invitation screen, replaced in Task 8) does not yet supply `contactEmail` anywhere it might construct an `InvitationDetails`-shaped value, but since `InvitationDetails` is only ever *read* (not constructed) by consumers, and `getInvitationDetails` is the only producer (now updated), the build should actually succeed. If it does fail, check whether any other file constructs an `InvitationDetails` object literal directly (search for `contactName:` string across `app/src/screens`) — if found, that call site needs `contactEmail` added too; do not guess, read the error and match it to the exact literal.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/invitationStore.ts
git commit -m "feat: add contactEmail to InvitationDetails and acceptClientAccount RPC call"
```

---

### Task 5: New `clientSessionStore.ts` — client-identity resolution

**Files:**
- Create: `app/src/data/clientSessionStore.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabaseClient`, `isDemoSession`/`onLogout` from `./authStore`.
- Produces: `export async function isClientSession(): Promise<boolean>`, `export async function getMyClientContactId(): Promise<string | null>`, `export async function getMyClientProjectIds(): Promise<string[]>`, `export function resetClientSessionCache(): void`. Consumed by Task 10 (route guard) and Task 9 (placeholder screen).

- [ ] **Step 1: Write the file**

```ts
// Resolves whether the CURRENT authenticated Supabase user is a client
// contact (has a client_contacts row with user_id = auth.uid()) rather than
// a studio member. This must be checked before any studio-scoped store
// (anything that calls getStudioId()) is touched — a client-authenticated
// user has no studio_members row, and getStudioId() does not treat that as
// an error: it silently auto-provisions a brand-new empty studio instead
// (see studioStore.ts's resolveStudioId, step 3). Demo sessions never reach
// this module's real logic — client accounts don't exist as a concept in
// demo mode, so isClientSession() short-circuits to false for them.

import { supabase } from './supabaseClient';
import { isDemoSession, onLogout } from './authStore';

interface ClientIdentity {
  contactId: string;
  clientId: string;
}

let _cached: ClientIdentity | null | undefined; // undefined = not resolved yet, null = resolved to "not a client"
let _inFlight: Promise<ClientIdentity | null> | null = null;

async function resolveClientIdentity(): Promise<ClientIdentity | null> {
  if (isDemoSession()) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('client_contacts')
    .select('id, client_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('resolveClientIdentity failed', error); return null; }
  if (!data) return null;

  return { contactId: data.id, clientId: data.client_id };
}

async function getClientIdentity(): Promise<ClientIdentity | null> {
  if (_cached !== undefined) return _cached;
  if (!_inFlight) {
    _inFlight = resolveClientIdentity().then(result => {
      _cached = result;
      _inFlight = null;
      return result;
    });
  }
  return _inFlight;
}

export function resetClientSessionCache(): void {
  _cached = undefined;
  _inFlight = null;
}

onLogout(resetClientSessionCache);

export async function isClientSession(): Promise<boolean> {
  return (await getClientIdentity()) !== null;
}

export async function getMyClientContactId(): Promise<string | null> {
  const identity = await getClientIdentity();
  return identity?.contactId ?? null;
}

// The list of project ids this client contact can read — sourced from
// project_client_access (the RLS-backing table, see the Step B migration),
// filtered down for THIS user by that table's own RLS policy (a client
// contact has no direct SELECT grant on project_client_access itself; this
// query relies on is_client_contact_for_project() being usable indirectly
// via the projects table's own new client-access policy instead — see the
// implementation note in Task 5's Step 2 below for why this queries
// `projects`, not `project_client_access`, directly).
export async function getMyClientProjectIds(): Promise<string[]> {
  const { data, error } = await supabase.from('projects').select('id');
  if (error) { console.error('getMyClientProjectIds failed', error); return []; }
  return (data ?? []).map(row => row.id as string);
}
```

- [ ] **Step 2: Implementation note on `getMyClientProjectIds`**

No code change in this step — this is a comment-only clarification for whoever reviews this task. `getMyClientProjectIds()` queries `projects` directly (not `project_client_access`) because a client contact has no SELECT grant on `project_client_access` (only the studio owner does, per Task 1's `project_client_access_manage_own` policy) — but they DO have SELECT on `projects` via Task 1's new `projects_select_client_access` policy, which already filters to exactly the projects `is_client_contact_for_project()` allows. Querying `projects` and reading back `id` achieves the same result the caller needs (a list of accessible project ids) without requiring any new grant. This is intentional, not an oversight — confirm this reasoning holds when reviewing rather than "fixing" it to query `project_client_access` (which would just fail with a permissions error for a real client session).

- [ ] **Step 3: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors — this is a new, self-contained file with no external consumers yet.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/clientSessionStore.ts
git commit -m "feat: add clientSessionStore for client-identity resolution"
```

---

### Task 6: `authStore.ts` — `registerClient`

**Files:**
- Modify: `app/src/data/authStore.ts`

**Interfaces:**
- Produces: `export async function registerClient(data: { name: string; email: string; password: string }): Promise<{ ok: boolean; error?: string }>`. Consumed by Task 8 (`ClientInvitationAccept.tsx`).

- [ ] **Step 1: Add `registerClient`, mirroring `register()` but without studio metadata**

Add this new exported function immediately after the existing `register()` function:

```ts
// Client-contact registration — distinct from register() above, which
// creates a NEW STUDIO for its caller (register() writes studio_name into
// the auth user_metadata, which getStudioId() later reads to provision a
// studio for a first-time studio owner). A client must never trigger studio
// provisioning, so this omits studio_name entirely — the resulting
// auth.users row has no studio_name in its metadata, and the client-session
// detection layer (clientSessionStore.ts) routes this account away from any
// code path that would call getStudioId() in the first place.
export async function registerClient(data: {
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!data.name.trim() || !data.email.trim() || !data.password.trim())
    return { ok: false, error: 'auth.requiredFields' };
  if (data.password.length < 8)
    return { ok: false, error: 'auth.passwordTooShort' };

  const lower = data.email.toLowerCase().trim();
  if (DEMO_EMAIL_MAP[lower]) return { ok: false, error: 'auth.emailTaken' };

  const { error } = await supabase.auth.signUp({
    email: lower,
    password: data.password,
    options: {
      data: {
        full_name: data.name.trim(),
      },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { ok: false, error: 'auth.emailTaken' };
    }
    return { ok: false, error: 'auth.requiredFields' };
  }

  return { ok: true };
}
```

- [ ] **Step 2: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/authStore.ts
git commit -m "feat: add registerClient for client-contact account creation"
```

---

### Task 7: i18n keys for the client invitation/placeholder screens

**Files:**
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Produces: a new `clientInvitation` namespace (mirroring the existing `teamInvitation` namespace's key names/shape) and a new `clientHome` namespace, consumed by Tasks 8 and 9.

- [ ] **Step 1: Find the `teamInvitation` namespace to mirror its shape**

Read `app/src/locales/fr.json` and find the `"teamInvitation"` top-level key (used by `TeamInvitationAccept.tsx`). Note every key inside it (`pendingTitle`, `pendingDesc`, `pendingDescLoggedIn`, `haveAccount`, `createAccount`, `joinButton`, `joinFailed`, `invalidTitle`, `invalidDesc`, `backToLogin`, `wrongAccountTitle`, `wrongAccountDesc`, `switchAccount`) — this task creates a parallel `clientInvitation` namespace with the same key names (so `ClientInvitationAccept.tsx` in Task 8 can be a near-literal copy of `TeamInvitationAccept.tsx` with only the namespace prefix changed).

- [ ] **Step 2: Add the `clientInvitation` and `clientHome` namespaces to `fr.json`**

Add this as a new top-level key in `app/src/locales/fr.json` (anywhere among the other top-level namespaces, e.g. right after the `"teamInvitation"` block — use the Edit tool to insert a new `,\n  "clientInvitation": { ... }` block immediately after the closing `}` of the `"teamInvitation"` namespace, then a second `,\n  "clientHome": { ... }` block right after it):

```json
  "clientInvitation": {
    "pendingTitle": "Rejoindre le portail client",
    "pendingDesc": "Vous avez été invité·e par {{studio}} à accéder au portail client.",
    "pendingDescLoggedIn": "Connecté·e — rejoignez le portail client de {{studio}}.",
    "haveAccount": "J'ai déjà un compte",
    "createAccount": "Créer un compte",
    "joinButton": "Rejoindre",
    "joinFailed": "Impossible de rejoindre le portail. Réessayez.",
    "invalidTitle": "Invitation invalide",
    "invalidDesc": "Ce lien d'invitation n'est plus valide ou a déjà été utilisé.",
    "backToLogin": "Retour à la connexion",
    "wrongAccountTitle": "Mauvais compte",
    "wrongAccountDesc": "Cette invitation a été envoyée à {{invited}}, mais vous êtes connecté·e en tant que {{current}}.",
    "switchAccount": "Changer de compte"
  },
  "clientHome": {
    "title": "Vos projets",
    "subtitle": "Projets auxquels vous avez accès",
    "empty": "Aucun projet ne vous a été partagé pour le moment.",
    "logout": "Se déconnecter"
  }
```

- [ ] **Step 3: Add the same two namespaces to `en.json`**

```json
  "clientInvitation": {
    "pendingTitle": "Join the client portal",
    "pendingDesc": "You've been invited by {{studio}} to access the client portal.",
    "pendingDescLoggedIn": "Signed in — join {{studio}}'s client portal.",
    "haveAccount": "I already have an account",
    "createAccount": "Create an account",
    "joinButton": "Join",
    "joinFailed": "Couldn't join the portal. Please try again.",
    "invalidTitle": "Invalid invitation",
    "invalidDesc": "This invitation link is no longer valid or has already been used.",
    "backToLogin": "Back to login",
    "wrongAccountTitle": "Wrong account",
    "wrongAccountDesc": "This invitation was sent to {{invited}}, but you're signed in as {{current}}.",
    "switchAccount": "Switch account"
  },
  "clientHome": {
    "title": "Your projects",
    "subtitle": "Projects you have access to",
    "empty": "No projects have been shared with you yet.",
    "logout": "Log out"
  }
```

- [ ] **Step 4: Verify both locale files are valid JSON**

Run: `cd "D:\Vibe Coding\Rush\app" && node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json'))" && node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json'))"`
Expected: both commands exit with no output (no error thrown).

- [ ] **Step 5: Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add clientInvitation and clientHome i18n namespaces"
```

---

### Task 8: New screen `ClientInvitationAccept.tsx`

**Files:**
- Create: `app/src/screens/ClientInvitationAccept.tsx`

**Interfaces:**
- Consumes: `getInvitationDetails`, `acceptClientAccount` from `../data/invitationStore` (Task 4); `registerClient` from `../data/authStore` (Task 6); `login`, `logout` from `../data/authStore` (already exported); `t('clientInvitation.*')` (Task 7).
- Produces: the `ClientInvitationAccept` component, consumed by Task 10 (routing).

- [ ] **Step 1: Write the component**

This is a near-literal adaptation of `app/src/screens/TeamInvitationAccept.tsx` (read that file for the exact `Shell`/`inputStyle`/`labelStyle` constants and copy them verbatim) — the differences are: it uses `getInvitationDetails`/`acceptClientAccount` (client invitations) instead of `getInvitationByToken`/`acceptInvitation` (team invitations); `registerClient` instead of `register()`; the `t('clientInvitation.*')` namespace instead of `t('teamInvitation.*')`; and on success it navigates to `/mon-espace` (Task 10's client placeholder route) instead of `/` and does NOT call `switchActiveStudio` (clients have no studio to switch into).

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getInvitationDetails, acceptClientAccount, type InvitationDetails } from '../data/invitationStore';
import { registerClient, login, logout } from '../data/authStore';
import { supabase } from '../data/supabaseClient';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="play" size={14} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '11px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 14, fontFamily: 'var(--ff-text)',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-2)',
  display: 'block', marginBottom: 6, fontFamily: 'var(--ff-text)',
};

export function ClientInvitationAccept() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loadState, setLoadState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined);

  const [mode, setMode] = useState<'choose' | 'login' | 'register'>('choose');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLoadState('invalid'); return; }
      const info = await getInvitationDetails(token);
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!info || info.outcome !== 'pending') { setLoadState('invalid'); return; }
      setInvitation(info);
      setSessionEmail(user?.email ?? null);
      setLoadState('ready');
    })();
    return () => { cancelled = true; };
  }, [token]);

  const acceptAsCurrentSession = async () => {
    setSubmitting(true);
    setError('');
    try {
      await acceptClientAccount(token);
      navigate('/mon-espace', { replace: true });
    } catch {
      setError(t('clientInvitation.joinFailed'));
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const result = await login(invitation!.contactEmail, password);
    if (!result.ok) {
      setError(t(result.error!));
      setSubmitting(false);
      return;
    }
    await acceptAsCurrentSession();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setSubmitting(true);
    setError('');

    const result = await registerClient({
      name,
      email: invitation.contactEmail,
      password,
    });

    if (!result.ok) {
      setError(t(result.error!));
      setSubmitting(false);
      return;
    }

    try {
      await acceptClientAccount(token);
    } catch {
      setError(t('clientInvitation.joinFailed'));
      setSubmitting(false);
      return;
    }

    navigate('/mon-espace', { replace: true });
  };

  if (loadState === 'loading' || sessionEmail === undefined) {
    return <Shell><p style={{ textAlign: 'center', color: 'var(--text-3)' }}>…</p></Shell>;
  }

  if (loadState === 'invalid') {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px' }}>
            {t('clientInvitation.invalidTitle')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
            {t('clientInvitation.invalidDesc')}
          </p>
          <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
            {t('clientInvitation.backToLogin')}
          </Link>
        </div>
      </Shell>
    );
  }

  if (sessionEmail !== null) {
    const emailMatches = sessionEmail.toLowerCase() === invitation!.contactEmail.toLowerCase();

    if (!emailMatches) {
      return (
        <Shell>
          <div style={{ textAlign: 'center' }}>
            <SFIcon name="circle-alert" size={36} color="var(--danger)" />
            <h1 style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '18px 0 10px' }}>
              {t('clientInvitation.wrongAccountTitle')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
              {t('clientInvitation.wrongAccountDesc', { invited: invitation!.contactEmail, current: sessionEmail })}
            </p>
            <button
              onClick={async () => { await logout(); window.location.reload(); }}
              style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('clientInvitation.switchAccount')}
            </button>
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('clientInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('clientInvitation.pendingDescLoggedIn', { studio: invitation!.studioName })}
        </p>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <SFIcon name="circle-alert" size={14} color="var(--danger)" />
            <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
          </div>
        )}
        <button
          onClick={acceptAsCurrentSession}
          disabled={submitting}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: submitting ? 'var(--surface-3)' : 'var(--accent)',
            color: submitting ? 'var(--text-3)' : 'var(--on-accent)',
            fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '…' : t('clientInvitation.joinButton')}
        </button>
      </Shell>
    );
  }

  if (mode === 'choose') {
    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('clientInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('clientInvitation.pendingDesc', { studio: invitation!.studioName })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => setMode('login')}
            style={{ width: '100%', padding: '13px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('clientInvitation.haveAccount')}
          </button>
          <button
            onClick={() => setMode('register')}
            style={{ width: '100%', padding: '13px', borderRadius: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('clientInvitation.createAccount')}
          </button>
        </div>
      </Shell>
    );
  }

  if (mode === 'login') {
    return (
      <Shell>
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 20, textAlign: 'center' }}>
          {t('auth.loginTitle')}
        </h1>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('auth.email')}</label>
            <input value={invitation!.contactEmail} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('auth.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" style={inputStyle} />
          </div>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SFIcon name="circle-alert" size={14} color="var(--danger)" />
              <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !password.trim()}
            style={{
              width: '100%', padding: '13px', borderRadius: 11, border: 'none',
              background: submitting || !password.trim() ? 'var(--surface-3)' : 'var(--accent)',
              color: submitting || !password.trim() ? 'var(--text-3)' : 'var(--on-accent)',
              fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '…' : t('clientInvitation.joinButton')}
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
        {t('clientInvitation.pendingTitle')}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
        {t('clientInvitation.pendingDesc', { studio: invitation!.studioName })}
      </p>

      <form onSubmit={handleRegister}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.fullName')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('auth.fullNamePlaceholder')} autoComplete="name" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.email')}</label>
          <input value={invitation!.contactEmail} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.confirmPassword')}</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" style={inputStyle} />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <SFIcon name="circle-alert" size={14} color="var(--danger)" />
            <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim() || !password.trim() || !confirm.trim()}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: submitting || !name.trim() ? 'var(--surface-3)' : 'var(--accent)',
            color: submitting || !name.trim() ? 'var(--text-3)' : 'var(--on-accent)',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '…' : t('clientInvitation.joinButton')}
        </button>
      </form>
    </Shell>
  );
}
```

- [ ] **Step 2: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors (this file isn't routed anywhere yet — that's Task 10 — so it just needs to type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/ClientInvitationAccept.tsx
git commit -m "feat: add ClientInvitationAccept screen for client account creation"
```

---

### Task 9: New screen `ClientHome.tsx` — minimal placeholder

**Files:**
- Create: `app/src/screens/ClientHome.tsx`

**Interfaces:**
- Consumes: `getMyClientProjectIds` from `../data/clientSessionStore` (Task 5); `logout` from `../data/authStore`; `t('clientHome.*')` (Task 7).
- Produces: the `ClientHome` component, consumed by Task 10 (routing). This is deliberately minimal — a bare list of project ids/names proving RLS access works, NOT the polished dashboard (that's Step C's job per the approved design).

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getMyClientProjectIds } from '../data/clientSessionStore';
import { logout } from '../data/authStore';

export function ClientHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projectIds, setProjectIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await getMyClientProjectIds();
      if (!cancelled) setProjectIds(ids);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '48px 32px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', color: 'var(--text)', marginBottom: 4 }}>
              {t('clientHome.title')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientHome.subtitle')}</p>
          </div>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
          >
            <SFIcon name="log-out" size={14} color="var(--text)" />
            {t('clientHome.logout')}
          </button>
        </div>

        {projectIds === null && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>…</p>
        )}

        {projectIds !== null && projectIds.length === 0 && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('clientHome.empty')}</p>
        )}

        {projectIds !== null && projectIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projectIds.map(id => (
              <div key={id} style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-mono)' }}>
                {id}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/ClientHome.tsx
git commit -m "feat: add ClientHome minimal placeholder screen"
```

---

### Task 10: `main.tsx` — routing: swap invitation screen, add client route + guard, retire the old portal

**Files:**
- Modify: `app/src/main.tsx`

**Interfaces:**
- Consumes: `ClientInvitationAccept` (Task 8), `ClientHome` (Task 9), `isClientSession` from `../data/clientSessionStore` (Task 5).
- Produces: updated route tree — `/invitation/:token` now renders `ClientInvitationAccept`; new `/mon-espace` route (client-only, guarded); the `/` `AppShell` route's loader now also redirects a client-identified session to `/mon-espace` before it can reach any studio-scoped screen; `/portail/:projectId` is removed.

- [ ] **Step 1: Swap the import and the `/invitation/:token` element**

Replace:

```tsx
import { InvitationAccept } from './screens/InvitationAccept';
```

with:

```tsx
import { ClientInvitationAccept } from './screens/ClientInvitationAccept';
import { ClientHome } from './screens/ClientHome';
import { isClientSession } from './data/clientSessionStore';
```

Replace:

```tsx
  // Invitation contact client — sans sidebar, accessible sans compte (route standalone)
  { path: '/invitation/:token', element: <InvitationAccept /> },
```

with:

```tsx
  // Invitation contact client — sans sidebar, accessible sans compte (route standalone)
  { path: '/invitation/:token', element: <ClientInvitationAccept /> },
```

- [ ] **Step 2: Remove the old portal route**

Replace:

```tsx
  // Portail client — sans sidebar (route standalone)
  { path: '/portail/:projectId', element: <Portail />, errorElement: <RouteErrorPage /> },
```

with nothing (delete this line entirely — also remove the now-unused `import { Portail } from './screens/Portail';` line near the top of the file, and the now-unused `Portail` import specifically; do NOT delete the `Portail.tsx` file itself in this task, only stop routing to it, since a later cleanup task or a human decision might still want to inspect/reuse pieces of it).

- [ ] **Step 3: Add the client-only loader and route**

Replace:

```tsx
const authLoader = async () => {
  if (!(await isAuthenticated())) return redirect('/login');
  await preloadResourceContent();
  return null;
};
const guestLoader = async () => { if (await isAuthenticated()) return redirect('/'); return null; };
```

with:

```tsx
const authLoader = async () => {
  if (!(await isAuthenticated())) return redirect('/login');
  // A client-authenticated session must never reach the studio AppShell —
  // every screen under it eventually calls a studio-scoped store, and
  // getStudioId() would silently auto-provision a brand-new empty studio
  // for a user with no studio_members row (see studioStore.ts's
  // resolveStudioId, step 3) instead of failing loudly. Route them to their
  // own minimal space before that can happen.
  if (await isClientSession()) return redirect('/mon-espace');
  await preloadResourceContent();
  return null;
};
const guestLoader = async () => { if (await isAuthenticated()) return redirect('/'); return null; };
const clientLoader = async () => {
  if (!(await isAuthenticated())) return redirect('/login');
  if (!(await isClientSession())) return redirect('/');
  return null;
};
```

- [ ] **Step 4: Add the `/mon-espace` route**

Replace:

```tsx
  // Écran "aucune organisation" — atteint uniquement après avoir quitté sa
  // dernière organisation (voir leaveCurrentStudio dans studioStore.ts).
  { path: '/mes-organisations', element: <NoOrganization />, loader: authLoader },
```

with:

```tsx
  // Écran "aucune organisation" — atteint uniquement après avoir quitté sa
  // dernière organisation (voir leaveCurrentStudio dans studioStore.ts).
  { path: '/mes-organisations', element: <NoOrganization />, loader: authLoader },

  // Espace client — sans sidebar (route standalone), réservé aux comptes
  // client (voir clientLoader ci-dessus). Écran minimal pour cette étape —
  // le vrai tableau de bord client est un chantier séparé.
  { path: '/mon-espace', element: <ClientHome />, loader: clientLoader, errorElement: <RouteErrorPage /> },
```

- [ ] **Step 5: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors. If it reports `Portail` or `InvitationAccept` as unused/missing imports, confirm every reference to those two names was removed from this file's import list (both the component import and, for `Portail`, the JSX usage — there should be zero remaining references to either in `main.tsx`).

- [ ] **Step 6: Delete the now-dead `InvitationAccept.tsx`**

Its only consumer was the `/invitation/:token` route, which Step 1 just repointed to `ClientInvitationAccept`. Confirm nothing else imports `InvitationAccept` (search for `from '.*InvitationAccept'` and `InvitationAccept` across `app/src` — the only remaining match should be inside `ClientInvitationAccept.tsx`'s own filename, not an import of the old one), then delete the file:

```bash
rm app/src/screens/InvitationAccept.tsx
```

- [ ] **Step 7: Verify the TypeScript build again**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors (confirms deleting the file didn't orphan a reference Step 5's check missed).

- [ ] **Step 8: Commit**

```bash
git add app/src/main.tsx
git rm app/src/screens/InvitationAccept.tsx
git commit -m "feat: route client accounts to a dedicated space, retire the token-link portal route"
```

**Known follow-up, explicitly out of scope for this task:** a repo-wide search (`grep -rl "portail/\|Portail\b\|/invitation/" app/src`) turns up 10 files referencing the old portal path or its screen name beyond what this task touches — including `FicheClient.tsx` (likely a "copier le lien du portail" button), `Parametres.tsx`, `notificationStore.ts`, and `deliverableStatus.ts`. This plan deliberately does not chase down and rewrite all 10, since their exact content wasn't read while writing this plan and guessing at fixes would violate the "no placeholder steps" rule. Flag this to the user as a rough edge after Step B ships: some UI surfaces may still show a "portail" link/button that no longer leads anywhere useful, until a small follow-up pass updates or removes them.

---

### Task 11: `ProjectMembres.tsx` — sync `project_client_access` on membership changes

**Files:**
- Modify: `app/src/screens/ProjectMembres.tsx`
- Create: `app/src/data/projectClientAccessStore.ts`

**Interfaces:**
- Produces (new file): `export function syncProjectClientAccess(projectId: string, clientId: string, members: User[]): void` — diffs `members` against the client's external-contact pool and writes exactly the matching rows into `project_client_access` (demo sessions no-op, matching this store's Supabase-only relevance).
- Consumes (in `ProjectMembres.tsx`): the new `syncProjectClientAccess`, called from `persistMembers`.

- [ ] **Step 1: Write `projectClientAccessStore.ts`**

```ts
// Keeps the `project_client_access` table (the RLS-backing table for
// client-contact project access — see the Step B migration,
// docs/superpowers/specs/2026-07-15-client-access-migration.sql) in sync
// with `projects.members`, the JSONB array ProjectMembres.tsx actually
// displays and edits. This is the ONLY place that writes
// project_client_access — see persistMembers() in ProjectMembres.tsx.
//
// Demo sessions no-op: project_client_access is a real-session-only RLS
// concern (demo sessions never hit Supabase RLS at all).

import { isDemoSession } from './authStore';
import { getClientExternalTeam } from './clientTeamStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import type { User } from '../types';

export function syncProjectClientAccess(projectId: string, clientId: string, members: User[]): void {
  if (isDemoSession()) return;
  void doSync(projectId, clientId, members);
}

async function doSync(projectId: string, clientId: string, members: User[]): Promise<void> {
  const externalContactIds = new Set(getClientExternalTeam(clientId).map(c => c.id));
  const nextContactIds = members.map(m => m.id).filter(id => externalContactIds.has(id));

  const { data: existing, error: fetchError } = await supabase
    .from('project_client_access')
    .select('client_contact_id')
    .eq('project_id', projectId);

  if (fetchError) { console.error('syncProjectClientAccess fetch failed', fetchError); return; }

  const existingIds = (existing ?? []).map(row => row.client_contact_id as string);
  const toRemove = existingIds.filter(id => !nextContactIds.includes(id));
  const toAdd = nextContactIds.filter(id => !existingIds.includes(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('project_client_access')
      .delete()
      .eq('project_id', projectId)
      .in('client_contact_id', toRemove);
    if (error) console.error('syncProjectClientAccess delete failed', error);
  }

  if (toAdd.length > 0) {
    const studioId = await getStudioId();
    const { error } = await supabase
      .from('project_client_access')
      .insert(toAdd.map(clientContactId => ({ project_id: projectId, client_contact_id: clientContactId, studio_id: studioId })));
    if (error) console.error('syncProjectClientAccess insert failed', error);
  }
}
```

- [ ] **Step 2: Call it from `persistMembers`**

Replace:

```tsx
  const persistMembers = (updated: User[]) => {
    setMembers(updated);
    updateProject(projectId, { members: updated });
  };
```

with:

```tsx
  const persistMembers = (updated: User[]) => {
    setMembers(updated);
    updateProject(projectId, { members: updated });
    syncProjectClientAccess(projectId, project.clientId, updated);
  };
```

- [ ] **Step 3: Add the import**

Replace:

```tsx
import { getClientExternalTeam, addClientTeamMember } from '../data/clientTeamStore';
```

with:

```tsx
import { getClientExternalTeam, addClientTeamMember } from '../data/clientTeamStore';
import { syncProjectClientAccess } from '../data/projectClientAccessStore';
```

- [ ] **Step 4: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors. If `project.clientId` or `projectId` aren't in scope at the exact point `persistMembers` is defined, check the surrounding component code (read `ProjectMembres.tsx` around the `persistMembers` definition) — both should already be in scope there (the file already uses `project.clientId` elsewhere, per Task 11's Step 1 in the original explore of `handleAdd`), but confirm rather than assume.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/projectClientAccessStore.ts app/src/screens/ProjectMembres.tsx
git commit -m "feat: sync project_client_access whenever project members change"
```

---

### Task 12: Manual verification walkthrough

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Demo-session sanity check (no real Supabase access involved)**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run dev`
Log in as a demo account (e.g. `lea.marchand@studioflow.fr`). Confirm:
- The app loads with no console errors (demo sessions never touch `clientSessionStore.ts`'s real logic, so this just confirms nothing broke at import/render time).
- `Paramètres → Équipe` and `ProjectMembres` (a project's "Membres" screen) still work exactly as before — adding/removing internal and external members behaves unchanged (demo sessions no-op `syncProjectClientAccess`, so there's nothing new to see here, only confirmation nothing regressed).

- [ ] **Step 2: Ask the user to confirm the migration ran**

Do not proceed to Step 3 until the user confirms Task 1's migration ran successfully in their real Supabase project (per Task 1 Step 2).

- [ ] **Step 3: Real-session walkthrough (requires a real studio account + a real client invitation)**

This step requires a live Supabase project with the migration applied and cannot be simulated in demo mode. Ask the user to either perform these steps themselves and report back, or provide a test studio account for a live verification pass:
1. As a real studio owner, invite a client contact to a project's members (via `ProjectMembres.tsx`'s "Ajouter" flow, picking or creating an external contact), and copy the invitation link.
2. Open the invitation link in a private/incognito window — confirm `ClientInvitationAccept` renders (not the old `InvitationAccept`), showing "Rejoindre le portail client".
3. Create an account (register flow) with the invited email. Confirm it redirects to `/mon-espace` after success, and that the project's id appears in the list (proving `is_client_contact_for_project()`'s RLS policy on `projects` correctly grants read access).
4. Reload `/mon-espace` — confirm the same project id still appears (proving the session persists and RLS access isn't a one-time fluke).
5. As the studio owner, remove that client contact from the project's members. Reload `/mon-espace` as the client — confirm the project id no longer appears (proving `syncProjectClientAccess`'s delete path works and RLS access was actually revoked, not just hidden in the UI).
6. Navigate directly to `/` (the studio AppShell root) while logged in as the client account — confirm it redirects to `/mon-espace`, not into the studio dashboard (proving the `authLoader`'s client-session check works and no phantom studio gets created — spot-check this by having the studio owner confirm in their Supabase `studios` table that no new empty studio appeared).

- [ ] **Step 4: Report results**

Summarize which of Step 3's 6 checks passed, and flag any that failed with enough detail (error messages, screenshots if available) to diagnose before considering Step B complete.
