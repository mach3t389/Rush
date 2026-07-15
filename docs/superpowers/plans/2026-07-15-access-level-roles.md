# Access-Level Roles (Step A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a structured `accessLevel` (`'owner' | 'admin' | 'member'`) field for studio team members, replacing every ad-hoc `role === 'Admin'` string comparison used for permission decisions, while leaving the free-text `role` field as a display-only job title.

**Architecture:** A new `access_level` column on `studio_members` (and `studio_invitations`) becomes the single source of truth for permission checks, read through `teamStore.ts` (the existing single source for team data in this codebase). No new RLS policy is needed — the existing `members_update_self_or_owner` UPDATE policy on `studio_members` already lets the studio owner update any member's row, which covers the new column. Every UI site that currently branches on `role === 'Admin'` is migrated to branch on `accessLevel` instead.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS), i18next. No automated test suite in this project (per `CLAUDE.md`) — verification is `npm run build` (TypeScript check) after each code task, plus a manual browser walkthrough in the final task.

## Global Constraints

- Never hardcode user-facing text — all UI strings go through `t('namespace.key')`, with the key added to `app/src/locales/fr.json` **and** `app/src/locales/en.json` first (per `CLAUDE.md`'s i18n rule).
- Never use `<input type="date">` — not applicable to this plan (no date pickers touched).
- Supabase migrations are never applied automatically in this project — the SQL file this plan produces must be pasted into Supabase → SQL Editor by the user manually.
- Demo sessions (`isDemoSession()` true) must keep working exactly as today from a UX standpoint — persistence for demo-only fields goes through `localStorage`, never Supabase.
- All styling in touched files is inline `style={}` using the existing CSS custom properties (`var(--text-3)`, `var(--ff-mono)`, etc.) — match the surrounding file's existing style, don't introduce Tailwind classes into files that don't already use them.

---

### Task 1: Supabase migration — `access_level` columns + updated RPC

**Files:**
- Create: `docs/superpowers/specs/2026-07-15-access-level-migration.sql`

**Interfaces:**
- Produces: `studio_members.access_level` (`text`, `not null default 'member'`, one of `'owner' | 'admin' | 'member'`) and `studio_invitations.access_level` (`text`, nullable, one of `'admin' | 'member'` — never `'owner'`). `accept_studio_invitation(p_token text)` now copies `inv.access_level` onto the new `studio_members` row.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Ask the user to run the migration**

This step cannot be automated (no Supabase CLI/migration runner in this project). Tell the user: "Colle et exécute `docs/superpowers/specs/2026-07-15-access-level-migration.sql` dans Supabase → SQL Editor avant de tester en session réelle. Les sessions démo n'en ont pas besoin." Do not proceed to manually verify real-session behavior (Task 10) until the user confirms this ran without error.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-15-access-level-migration.sql
git commit -m "docs: add access_level Supabase migration for Step A"
```

---

### Task 2: `teamStore.ts` — `AccessLevel` type and data model

**Files:**
- Modify: `app/src/data/teamStore.ts`

**Interfaces:**
- Consumes: nothing new (existing `USERS` from `./mock`, `isDemoSession`/`onLogout` from `./authStore`, `getStudioId` from `./studioStore`, `supabase` from `./supabaseClient`).
- Produces: `export type AccessLevel = 'owner' | 'admin' | 'member';` and `TeamMemberInfo.accessLevel: AccessLevel` (required field), used by every later task in this plan.

- [ ] **Step 1: Add the `AccessLevel` type and extend `TeamMemberInfo`**

In `app/src/data/teamStore.ts`, replace:

```ts
export interface TeamMemberInfo extends User {
  email: string;
  joinedAt: string;
  phone?: string;
  photoUrl?: string;
  permissions?: string[];
}
```

with:

```ts
export type AccessLevel = 'owner' | 'admin' | 'member';

export interface TeamMemberInfo extends User {
  email: string;
  joinedAt: string;
  phone?: string;
  photoUrl?: string;
  permissions?: string[];
  accessLevel: AccessLevel;
}
```

- [ ] **Step 2: Read `access_level` in the Supabase row shape**

Replace:

```ts
interface StudioMemberRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  avatar_color: string;
  is_owner: boolean;
  created_at: string;
  phone: string | null;
  photo_url: string | null;
  permissions: string[] | null;
}
```

with:

```ts
interface StudioMemberRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  avatar_color: string;
  is_owner: boolean;
  created_at: string;
  phone: string | null;
  photo_url: string | null;
  permissions: string[] | null;
  access_level: AccessLevel;
}
```

- [ ] **Step 3: Map `access_level` in `toMember()`**

Replace:

```ts
function toMember(row: StudioMemberRow): TeamMemberInfo {
  return {
    id: row.user_id,
    name: row.name,
    initials: row.initials,
    avatarColor: row.avatar_color,
    role: row.role,
    email: row.email,
    joinedAt: row.created_at,
    phone: row.phone ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    permissions: row.permissions ?? undefined,
  };
}
```

with:

```ts
function toMember(row: StudioMemberRow): TeamMemberInfo {
  return {
    id: row.user_id,
    name: row.name,
    initials: row.initials,
    avatarColor: row.avatar_color,
    role: row.role,
    email: row.email,
    joinedAt: row.created_at,
    phone: row.phone ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    permissions: row.permissions ?? undefined,
    accessLevel: row.access_level,
  };
}
```

- [ ] **Step 4: Select the new column in `fetchMembers()`**

Replace:

```ts
  const { data, error } = await supabase
    .from('studio_members')
    .select('user_id, name, email, role, initials, avatar_color, is_owner, created_at, phone, photo_url, permissions')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });
```

with:

```ts
  const { data, error } = await supabase
    .from('studio_members')
    .select('user_id, name, email, role, initials, avatar_color, is_owner, created_at, phone, photo_url, permissions, access_level')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });
```

- [ ] **Step 5: Derive `accessLevel` for demo sessions in `getTeamMembers()`**

Replace:

```ts
export function getTeamMembers(): TeamMemberInfo[] {
  if (isDemoSession()) {
    return Object.values(USERS).map(u => ({ ...u, email: '', joinedAt: '' }));
  }
  ensureFetchStarted();
  return _members;
}
```

with:

```ts
export function getTeamMembers(): TeamMemberInfo[] {
  if (isDemoSession()) {
    return Object.values(USERS).map(u => ({
      ...u,
      email: '',
      joinedAt: '',
      accessLevel: (u.id === USERS.lea.id ? 'owner' : 'member') as AccessLevel,
    }));
  }
  ensureFetchStarted();
  return _members;
}
```

- [ ] **Step 6: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no errors originating from `teamStore.ts`. `TeamMemberInfo` gained a required `accessLevel` field, but every place this file constructs one (`toMember()`, the demo branch of `getTeamMembers()`) now supplies it, and no other file constructs a `TeamMemberInfo` literal from scratch yet. If the build reports an error inside `teamStore.ts` itself, fix it before continuing.

- [ ] **Step 7: Commit**

```bash
git add app/src/data/teamStore.ts
git commit -m "feat: add AccessLevel type and accessLevel field to TeamMemberInfo"
```

---

### Task 3: `teamStore.ts` — `getMyAccessLevel`, `loadAccessLevel`, `saveAccessLevel`, and `updateMemberFields`

**Files:**
- Modify: `app/src/data/teamStore.ts`

**Interfaces:**
- Consumes: `AccessLevel`, `TeamMemberInfo` (Task 2); needs `getCurrentUser` from `./authStore` (not currently imported in this file).
- Produces: `getMyAccessLevel(): AccessLevel`, `loadAccessLevel(userId: string): AccessLevel`, `saveAccessLevel(userId: string, accessLevel: AccessLevel): void` — all consumed by `ProfileEditPanel.tsx` (Task 6), `MonEquipe.tsx` and `GlobalTopBar.tsx` (Tasks 7-8), and `Parametres.tsx` (Task 9).

- [ ] **Step 1: Import `getCurrentUser`**

Replace:

```ts
import { isDemoSession, onLogout } from './authStore';
```

with:

```ts
import { isDemoSession, onLogout, getCurrentUser } from './authStore';
```

- [ ] **Step 2: Add the three new exported functions**

Add this block immediately after `findTeamMember` (right before `async function upsertSupabaseMemberFields`):

```ts
export function getMyAccessLevel(): AccessLevel {
  const user = getCurrentUser();
  if (!user) return 'member';
  if (isDemoSession()) return user.id === USERS.lea.id ? 'owner' : 'member';
  ensureFetchStarted();
  return findTeamMember(user.id)?.accessLevel ?? 'member';
}

const ACCESS_LEVEL_STORAGE_KEY = (id: string) => `sf_access_${id}`;

// Mirrors loadProfile/loadPermissions in ProfileEditPanel.tsx: demo sessions
// persist to localStorage (never Supabase), real sessions read the live
// studio_members cache via findTeamMember. Unlike getMyAccessLevel() above,
// this reads ANY member's level (used when an admin views someone else's
// profile), not just the signed-in user's own.
export function loadAccessLevel(userId: string): AccessLevel {
  if (isDemoSession()) {
    try {
      const raw = localStorage.getItem(ACCESS_LEVEL_STORAGE_KEY(userId));
      if (raw === 'owner' || raw === 'admin' || raw === 'member') return raw;
    } catch { /* noop */ }
    return userId === USERS.lea.id ? 'owner' : 'member';
  }
  return findTeamMember(userId)?.accessLevel ?? 'member';
}

export function saveAccessLevel(userId: string, accessLevel: AccessLevel): void {
  if (isDemoSession()) {
    if (userId === USERS.lea.id) return; // demo owner can't be demoted
    try { localStorage.setItem(ACCESS_LEVEL_STORAGE_KEY(userId), accessLevel); } catch { /* noop */ }
    return;
  }
  updateMemberFields(userId, { accessLevel });
}
```

- [ ] **Step 3: Let `updateMemberFields`/`upsertSupabaseMemberFields` accept `accessLevel`**

Replace:

```ts
async function upsertSupabaseMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions'>>): Promise<void> {
  const studioId = await getStudioId();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined)        row.name = patch.name;
  if (patch.email !== undefined)       row.email = patch.email;
  if (patch.role !== undefined)        row.role = patch.role;
  if (patch.phone !== undefined)       row.phone = patch.phone;
  if (patch.photoUrl !== undefined)    row.photo_url = patch.photoUrl;
  if (patch.permissions !== undefined) row.permissions = patch.permissions;

  const { error } = await supabase.from('studio_members').update(row).eq('studio_id', studioId).eq('user_id', userId);
  if (error) { console.error('upsertSupabaseMemberFields failed', error); return; }
  await fetchMembers();
}
```

with:

```ts
async function upsertSupabaseMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel'>>): Promise<void> {
  const studioId = await getStudioId();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined)        row.name = patch.name;
  if (patch.email !== undefined)       row.email = patch.email;
  if (patch.role !== undefined)        row.role = patch.role;
  if (patch.phone !== undefined)       row.phone = patch.phone;
  if (patch.photoUrl !== undefined)    row.photo_url = patch.photoUrl;
  if (patch.permissions !== undefined) row.permissions = patch.permissions;
  if (patch.accessLevel !== undefined) row.access_level = patch.accessLevel;

  const { error } = await supabase.from('studio_members').update(row).eq('studio_id', studioId).eq('user_id', userId);
  if (error) { console.error('upsertSupabaseMemberFields failed', error); return; }
  await fetchMembers();
}
```

And replace:

```ts
export function updateMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions'>>): void {
```

with:

```ts
export function updateMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel'>>): void {
```

(the function body below that line — `if (isDemoSession()) return; ...` — is unchanged, it already spreads `patch` generically).

- [ ] **Step 4: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no errors originating from `teamStore.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/teamStore.ts
git commit -m "feat: add getMyAccessLevel/loadAccessLevel/saveAccessLevel helpers"
```

---

### Task 4: `teamStore.ts` — `createInvitation` gains an access-level parameter

**Files:**
- Modify: `app/src/data/teamStore.ts`

**Interfaces:**
- Consumes: `AccessLevel` (Task 2).
- Produces: `export type InvitableAccessLevel = 'admin' | 'member';` and `createInvitation(email: string, role: string, accessLevel: InvitableAccessLevel, permissions?: string[])` — new required 3rd parameter (was optional 3rd `permissions`, now shifted to 4th), consumed by `MonEquipe.tsx` (Task 7).

- [ ] **Step 1: Add the narrower `InvitableAccessLevel` type and update the function signature**

Replace:

```ts
export async function createInvitation(email: string, role: string, permissions?: string[]): Promise<{ token: string; link: string }> {
  const token = makeToken();
  const link = `${window.location.origin}/invitation-equipe/${token}`;

  if (isDemoSession()) return { token, link };

  const studioId = await getStudioId();
  const { error } = await supabase.from('studio_invitations').insert({
    token,
    studio_id: studioId,
    email: email.trim().toLowerCase(),
    role: role.trim() || 'Membre',
    permissions: permissions ?? null,
  });
  if (error) throw error;
  return { token, link };
}
```

with:

```ts
// Narrower than AccessLevel: an invitation can never grant 'owner' — there
// is exactly one owner per studio, assigned automatically at studio
// creation (see studioStore.ts's insertOwnerMembership).
export type InvitableAccessLevel = 'admin' | 'member';

export async function createInvitation(email: string, role: string, accessLevel: InvitableAccessLevel, permissions?: string[]): Promise<{ token: string; link: string }> {
  const token = makeToken();
  const link = `${window.location.origin}/invitation-equipe/${token}`;

  if (isDemoSession()) return { token, link };

  const studioId = await getStudioId();
  const { error } = await supabase.from('studio_invitations').insert({
    token,
    studio_id: studioId,
    email: email.trim().toLowerCase(),
    role: role.trim() || 'Membre',
    access_level: accessLevel,
    permissions: permissions ?? null,
  });
  if (error) throw error;
  return { token, link };
}
```

- [ ] **Step 2: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: **fails** now — `MonEquipe.tsx`'s existing call `createInvitation(email.trim(), role.trim() || 'Membre', perms)` no longer matches the new signature (missing the required `accessLevel` argument, and `perms` is now in the wrong position). This is expected and fixed in Task 7 — do not fix it here.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/teamStore.ts
git commit -m "feat: add required accessLevel parameter to createInvitation"
```

---

### Task 5: `studioStore.ts` — new studio owners get `access_level: 'owner'`

**Files:**
- Modify: `app/src/data/studioStore.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports — internal fix so freshly-created studios have a correct `access_level` from the start (without this, a brand-new owner's row would default to `'member'`, the column's DB default, which is wrong).

- [ ] **Step 1: Set `access_level: 'owner'` in `insertOwnerMembership`**

Replace:

```ts
  const { error } = await supabase.from('studio_members').upsert(
    {
      studio_id: studioId,
      user_id: user.id,
      name: fullName,
      email: user.email ?? '',
      role: 'Admin',
      initials,
      avatar_color: '#5B8AF5',
      is_owner: true,
    },
    { onConflict: 'user_id,studio_id' }
  );
```

with:

```ts
  const { error } = await supabase.from('studio_members').upsert(
    {
      studio_id: studioId,
      user_id: user.id,
      name: fullName,
      email: user.email ?? '',
      role: 'Admin',
      initials,
      avatar_color: '#5B8AF5',
      is_owner: true,
      access_level: 'owner',
    },
    { onConflict: 'user_id,studio_id' }
  );
```

- [ ] **Step 2: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: no new errors from `studioStore.ts` (the same pre-existing `MonEquipe.tsx` error from Task 4 is still present — ignore it until Task 7).

- [ ] **Step 3: Commit**

```bash
git add app/src/data/studioStore.ts
git commit -m "fix: set access_level owner when provisioning a new studio"
```

---

### Task 6: `ProfileEditPanel.tsx` — access-level dropdown and `accessLevel`-based permission gating

**Files:**
- Modify: `app/src/components/profile/ProfileEditPanel.tsx`
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Consumes: `AccessLevel`, `loadAccessLevel`, `saveAccessLevel` from `./teamStore` (renamed import path `../../data/teamStore` from this file's location) — added in Task 3.
- Produces: no new exports for other tasks to consume; this is the leaf UI change for the profile drawer.

- [ ] **Step 1: Add the i18n keys**

In `app/src/locales/fr.json`, inside the `"profile"` namespace (the object starting at the line containing `"myProfile": "Mon profil",`), replace:

```json
    "rolePosition": "Rôle / poste",
    "email": "Adresse courriel",
```

with:

```json
    "rolePosition": "Rôle / poste",
    "accessLevel": "Niveau d'accès",
    "accessLevelOwner": "Propriétaire",
    "accessLevelAdmin": "Admin",
    "accessLevelMember": "Membre",
    "email": "Adresse courriel",
```

In `app/src/locales/en.json`, inside the same `"profile"` namespace, replace:

```json
    "rolePosition": "Role / position",
    "email": "Email address",
```

with:

```json
    "rolePosition": "Role / position",
    "accessLevel": "Access level",
    "accessLevelOwner": "Owner",
    "accessLevelAdmin": "Admin",
    "accessLevelMember": "Member",
    "email": "Email address",
```

(If the exact `"email"` line text differs slightly from what's shown above, insert the four new keys directly after `"rolePosition"` instead — the important part is they land inside the `"profile"` namespace, not a different one.)

- [ ] **Step 2: Import the new teamStore helpers**

Replace:

```ts
import { findTeamMember, updateMemberFields } from '../../data/teamStore';
```

with:

```ts
import { findTeamMember, updateMemberFields, loadAccessLevel, saveAccessLevel, type AccessLevel } from '../../data/teamStore';
```

- [ ] **Step 3: Add `memberAccessLevel` state and replace `isAdminRole`**

Replace:

```ts
  const [permissions, setPermissions] = useState<PermissionKey[]>(() => loadPermissions(userId, overrides.role ?? initialRole));
  const [tab, setTab] = useState<'info' | 'permissions'>('info');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdminRole = role === 'Admin';
  const canEditPerms = isAdmin;
```

with:

```ts
  const [permissions, setPermissions] = useState<PermissionKey[]>(() => loadPermissions(userId, overrides.role ?? initialRole));
  const [memberAccessLevel, setMemberAccessLevel] = useState<AccessLevel>(() => loadAccessLevel(userId));
  const [tab, setTab] = useState<'info' | 'permissions'>('info');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Owner and Admin both get full permissions by construction (see the
  // Step A design doc) — 'isAdminRole' kept its name so the diff against
  // every other reference below stays obvious, but it now reads the
  // structured access level instead of comparing the free-text role string.
  const isAdminRole = memberAccessLevel !== 'member';
  const canEditPerms = isAdmin;
```

- [ ] **Step 4: Stop resetting permissions from the free-text role on blur**

The existing `onBlur` handler on the role `<input>` used the free-text role to look up `DEFAULT_PERMISSIONS[role]` — that lookup is unrelated to `accessLevel` and stays as-is (it's a convenience preset, not a permission gate), so no change is needed here. Skip to Step 5.

- [ ] **Step 5: Add the access-level dropdown, right after the role input**

Replace:

```tsx
              <div>
                {label(t('profile.rolePosition'))}
                <input
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  onBlur={() => { if (!isAdminRole && DEFAULT_PERMISSIONS[role]) setPermissions(DEFAULT_PERMISSIONS[role]); }}
                  disabled={!isAdmin}
                  list="profile-role-suggestions"
                  style={inputStyle}
                />
                <datalist id="profile-role-suggestions">
                  {ROLES.map(r => <option key={r} value={r} />)}
                </datalist>
              </div>

              <div>
                {label(t('profile.email'))}
```

with:

```tsx
              <div>
                {label(t('profile.rolePosition'))}
                <input
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  onBlur={() => { if (!isAdminRole && DEFAULT_PERMISSIONS[role]) setPermissions(DEFAULT_PERMISSIONS[role]); }}
                  disabled={!isAdmin}
                  list="profile-role-suggestions"
                  style={inputStyle}
                />
                <datalist id="profile-role-suggestions">
                  {ROLES.map(r => <option key={r} value={r} />)}
                </datalist>
              </div>

              {isAdmin && memberAccessLevel !== 'owner' && (
                <div>
                  {label(t('profile.accessLevel'))}
                  <select
                    value={memberAccessLevel}
                    onChange={e => setMemberAccessLevel(e.target.value as AccessLevel)}
                    style={inputStyle}
                  >
                    <option value="member">{t('profile.accessLevelMember')}</option>
                    <option value="admin">{t('profile.accessLevelAdmin')}</option>
                  </select>
                </div>
              )}
              {memberAccessLevel === 'owner' && (
                <div>
                  {label(t('profile.accessLevel'))}
                  <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('profile.accessLevelOwner')}</p>
                </div>
              )}

              <div>
                {label(t('profile.email'))}
```

- [ ] **Step 6: Persist the access level on save**

Replace:

```ts
  const handleSave = () => {
    saveProfile(userId, { name, role, email, phone });
    savePermissions(userId, permissions);
    if (photo) savePhoto(userId, photo);
    setSaved(true);
    setTimeout(() => {
      onSave?.({ name, role, email, phone, permissions, photoUrl: photo });
      onClose();
    }, 800);
  };
```

with:

```ts
  const handleSave = () => {
    saveProfile(userId, { name, role, email, phone });
    savePermissions(userId, permissions);
    if (isAdmin && memberAccessLevel !== 'owner') saveAccessLevel(userId, memberAccessLevel);
    if (photo) savePhoto(userId, photo);
    setSaved(true);
    setTimeout(() => {
      onSave?.({ name, role, email, phone, permissions, photoUrl: photo });
      onClose();
    }, 800);
  };
```

- [ ] **Step 7: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: no new errors from `ProfileEditPanel.tsx` (the pre-existing `MonEquipe.tsx` `createInvitation` call error from Task 4 is still present — fixed next, in Task 7).

- [ ] **Step 8: Commit**

```bash
git add app/src/components/profile/ProfileEditPanel.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: replace role==='Admin' checks with accessLevel in ProfileEditPanel"
```

---

### Task 7: `MonEquipe.tsx` — access-level selector in the invite modal

**Files:**
- Modify: `app/src/screens/MonEquipe.tsx`
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Consumes: `InvitableAccessLevel` from `../data/teamStore` (Task 4).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Add the i18n keys**

In `app/src/locales/fr.json`, inside the `"team"` namespace (the object starting at the line containing `"inviteMember": "Inviter un membre",`), replace:

```json
    "role": "Rôle",
    "rolePlaceholder": "Ex: Motion designer",
```

with:

```json
    "role": "Rôle",
    "rolePlaceholder": "Ex: Motion designer",
    "accessLevel": "Niveau d'accès",
    "accessLevelAdmin": "Admin — accès complet",
    "accessLevelMember": "Membre — accès limité",
```

In `app/src/locales/en.json`, inside the same `"team"` namespace, replace:

```json
    "role": "Role",
    "rolePlaceholder": "e.g. Motion designer",
```

with:

```json
    "role": "Role",
    "rolePlaceholder": "e.g. Motion designer",
    "accessLevel": "Access level",
    "accessLevelAdmin": "Admin — full access",
    "accessLevelMember": "Member — limited access",
```

- [ ] **Step 2: Import `InvitableAccessLevel` and `getMyAccessLevel`**

Replace:

```ts
import { getTeamMembers, subscribeTeam, createInvitation } from '../data/teamStore';
```

with:

```ts
import { getTeamMembers, subscribeTeam, createInvitation, getMyAccessLevel, type InvitableAccessLevel } from '../data/teamStore';
```

- [ ] **Step 2b: Fix the hardcoded `isAdmin` on the member-edit panel (privilege-escalation guard)**

`MonEquipe.tsx:295` currently passes a hardcoded `isAdmin` (always `true`) to `ProfileEditPanel` when a team member opens *another* member's profile from the team screen — meaning today, any signed-in member (not just admins) can already open a colleague's profile with `isAdmin` set. Before this plan, the only thing that gated was the free-text `role`/`permissions` fields. After Task 6 adds the access-level dropdown (also gated by the `isAdmin` prop), that same hardcoded `true` would let **any member promote another member to Admin** — a real privilege escalation introduced by this feature if left as-is. Fix it here, in the same file this plan already touches.

Replace:

```tsx
      {showEdit && (
        <ProfileEditPanel
          userId={member.id}
          initialName={member.name}
          initialRole={member.role}
          initialEmail={member.email}
          initialPhone={member.phone}
          initialInitials={member.initials}
          initialColor={member.avatarColor}
          isAdmin
          onClose={() => setShowEdit(false)}
        />
      )}
```

with:

```tsx
      {showEdit && (
        <ProfileEditPanel
          userId={member.id}
          initialName={member.name}
          initialRole={member.role}
          initialEmail={member.email}
          initialPhone={member.phone}
          initialInitials={member.initials}
          initialColor={member.avatarColor}
          isAdmin={getMyAccessLevel() !== 'member'}
          onClose={() => setShowEdit(false)}
        />
      )}
```

- [ ] **Step 3: Add `accessLevel` state to `InviteTeamModal`**

Replace:

```tsx
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [link, setLink] = useState<string | null>(null);
```

with:

```tsx
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [accessLevel, setAccessLevel] = useState<InvitableAccessLevel>('member');
  const [link, setLink] = useState<string | null>(null);
```

- [ ] **Step 4: Pass `accessLevel` to `createInvitation`**

Replace:

```tsx
    if (isDemoSession()) savePermissions(email.trim(), perms);
    const result = await createInvitation(email.trim(), role.trim() || 'Membre', perms);
```

with:

```tsx
    if (isDemoSession()) savePermissions(email.trim(), perms);
    const result = await createInvitation(email.trim(), role.trim() || 'Membre', accessLevel, perms);
```

- [ ] **Step 5: Add the access-level selector to the form**

Replace:

```tsx
{[
  { label: t('team.fullNameRequired'), val: name, set: setName, placeholder: t('team.fullNamePlaceholder') },
  { label: t('team.emailRequired'), val: email, set: setEmail, placeholder: t('team.emailPlaceholder') },
  { label: t('team.role'), val: role, set: setRole, placeholder: t('team.rolePlaceholder') },
].map(f => (
  <div key={f.label} style={{ marginBottom: 14 }}>
    <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{f.label}</label>
    <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
  </div>
))}
```

with:

```tsx
{[
  { label: t('team.fullNameRequired'), val: name, set: setName, placeholder: t('team.fullNamePlaceholder') },
  { label: t('team.emailRequired'), val: email, set: setEmail, placeholder: t('team.emailPlaceholder') },
  { label: t('team.role'), val: role, set: setRole, placeholder: t('team.rolePlaceholder') },
].map(f => (
  <div key={f.label} style={{ marginBottom: 14 }}>
    <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{f.label}</label>
    <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
  </div>
))}
<div style={{ marginBottom: 14 }}>
  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{t('team.accessLevel')}</label>
  <select value={accessLevel} onChange={e => setAccessLevel(e.target.value as InvitableAccessLevel)}
    style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}>
    <option value="member">{t('team.accessLevelMember')}</option>
    <option value="admin">{t('team.accessLevelAdmin')}</option>
  </select>
</div>
```

- [ ] **Step 6: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: **succeeds** with zero TypeScript errors — this was the last unresolved call site from Task 4.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/MonEquipe.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add access-level selector to the team invite modal"
```

---

### Task 8: `GlobalTopBar.tsx` — fix the hardcoded `isAdmin` on the self-profile editor

**Files:**
- Modify: `app/src/components/layout/GlobalTopBar.tsx`

**Interfaces:**
- Consumes: `getMyAccessLevel` from `../../data/teamStore` (added in Task 3).
- Produces: nothing new for other tasks.

Same privilege-escalation concern as Task 7 Step 2b, in the top-bar's own "edit my profile" entry point: `GlobalTopBar.tsx:226` passes a hardcoded `isAdmin` (always `true`) to `ProfileEditPanel` for the signed-in user's own profile (`isSelf` is also always `true` here). Once Task 6 adds the access-level dropdown, a plain Member opening their own profile from the top bar would see it and could set their own `accessLevel` to `'admin'` — self-escalation. Fix it here.

- [ ] **Step 1: Import `getMyAccessLevel`**

Replace:

```ts
import { getCurrentUser, logout } from '../../data/authStore';
```

with:

```ts
import { getCurrentUser, logout } from '../../data/authStore';
import { getMyAccessLevel } from '../../data/teamStore';
```

- [ ] **Step 2: Replace the hardcoded `isAdmin`**

Replace:

```tsx
      {showProfile && (
        <ProfileEditPanel
          userId={me.id}
          initialName={me.name}
          initialRole={me.role}
          initialEmail={authUser?.email ?? 'lea.marchand@studioflow.fr'}
          initialPhone="+1 514 555-0101"
          initialInitials={me.initials}
          initialColor={me.avatarColor}
          isSelf
          isAdmin
          onClose={() => setShowProfile(false)}
        />
      )}
```

with:

```tsx
      {showProfile && (
        <ProfileEditPanel
          userId={me.id}
          initialName={me.name}
          initialRole={me.role}
          initialEmail={authUser?.email ?? 'lea.marchand@studioflow.fr'}
          initialPhone="+1 514 555-0101"
          initialInitials={me.initials}
          initialColor={me.avatarColor}
          isSelf
          isAdmin={getMyAccessLevel() !== 'member'}
          onClose={() => setShowProfile(false)}
        />
      )}
```

- [ ] **Step 3: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/layout/GlobalTopBar.tsx
git commit -m "fix: stop granting isAdmin unconditionally on the self-profile editor"
```

---

### Task 9: `Parametres.tsx` — fix the hardcoded current user and the `isAdmin` check

**Files:**
- Modify: `app/src/screens/Parametres.tsx`

**Interfaces:**
- Consumes: `findTeamMember`, `getMyAccessLevel` from `../data/teamStore` (add to the existing `teamStore` import); `getCurrentUser` (already imported from `../data/authStore`).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Import the new teamStore helpers**

Replace:

```ts
import { isTeamOwner, subscribeTeam } from '../data/teamStore';
```

with:

```ts
import { isTeamOwner, subscribeTeam, findTeamMember, getMyAccessLevel } from '../data/teamStore';
```

- [ ] **Step 2: Replace the hardcoded `me`**

Replace:

```ts
  // ── Compte ──────────────────────────────────────────────────────────────────
  const me = USERS.lea; // utilisateur courant (cf. Sidebar)
```

with:

```ts
  // ── Compte ──────────────────────────────────────────────────────────────────
  // Was hardcoded to USERS.lea (a demo-only stand-in) even in real sessions.
  // findTeamMember() resolves the real signed-in user's row in both session
  // kinds (its demo branch keys team members by the same ids as USERS), so
  // the USERS.lea fallback below now only fires while a real session's first
  // team fetch is still in flight — hence the explicit 'member' accessLevel
  // default there, the most restrictive option, so no elevated UI ever
  // flashes before the real value loads.
  const authUser = getCurrentUser();
  const me = (authUser && findTeamMember(authUser.id)) ?? {
    id: authUser?.id ?? USERS.lea.id,
    name: authUser?.name ?? USERS.lea.name,
    initials: authUser?.initials ?? USERS.lea.initials,
    avatarColor: authUser?.avatarColor ?? USERS.lea.avatarColor,
    role: authUser?.role ?? USERS.lea.role,
    accessLevel: 'member' as const,
  };
```

- [ ] **Step 3: Replace the `role === 'Admin'` check**

Replace:

```tsx
          isSelf
          isAdmin={me.role === 'Admin'}
```

with:

```tsx
          isSelf
          isAdmin={getMyAccessLevel() !== 'member'}
```

- [ ] **Step 4: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Parametres.tsx
git commit -m "fix: resolve the real current user in Parametres instead of a hardcoded demo user"
```

---

### Task 10: Manual verification walkthrough

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the dev server and log into a demo account**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run dev`
Open the app, log in as `lea.marchand@studioflow.fr` (any password — demo accounts accept anything).

- [ ] **Step 2: Verify the team screen shows access levels correctly**

Navigate to Paramètres → Équipe (or Mon équipe). Confirm the page loads without console errors. Open Léa's own profile — the new "Niveau d'accès" field should read "Propriétaire" (read-only, no dropdown). Open another demo member's profile (e.g. Sarah Martin) — the "Niveau d'accès" dropdown should appear, defaulted to "Membre", and be changeable to "Admin".

- [ ] **Step 3: Verify the change persists across a reload (demo, localStorage-backed)**

With Sarah's profile open, change her access level to "Admin" and click Sauvegarder. Reload the page, reopen Sarah's profile — it should still show "Admin" (confirms the `sf_access_sarah` localStorage write/read round-trips).

- [ ] **Step 4: Verify the invite modal**

Open the "Inviter un membre" modal. Confirm the new "Niveau d'accès" dropdown appears (Membre / Admin), defaulted to "Membre". Fill the form and submit — in a demo session this should complete without a network error (demo invitations never call Supabase).

- [ ] **Step 5: Note the real-session check is separate**

Real-session behavior (an actual Supabase-backed account) depends on the migration from Task 1 having been run by the user in their Supabase project — this cannot be verified from the demo walkthrough above. Ask the user to confirm they've run it, then spot-check: log into a real account, open Paramètres, confirm no console errors, and that the profile drawer's "Niveau d'accès" field reflects the real `access_level` column value (owner for the studio creator).
