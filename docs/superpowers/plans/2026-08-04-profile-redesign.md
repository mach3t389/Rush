# Refonte du panneau Profil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the side-drawer profile panel with a floating centered modal, fix the initials-desync bug, show profile photos everywhere an avatar renders, collect per-organization profile info when joining a studio, and add a new "Compte" section for email/password change and account deletion.

**Architecture:** Most of the work is additive changes to existing files (`ProfileEditPanel.tsx`, `teamStore.ts`, `authStore.ts`, `SFAvatar.tsx`) plus one new server endpoint. There is no automated test suite in this project — every task ends with a manual verification step using the Vite dev server (`npm run dev` from `app/`) and, where noted, the browser preview tools.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase (Postgres + Auth), Vercel serverless functions (`app/api/*.ts`).

## Global Constraints

- No automated test suite — verification is manual, via the dev server (`npm run dev` in `app/`) or `npx tsc --noEmit -p tsconfig.app.json` for type-checking.
- Vercel Hobby plan is capped at exactly 12 serverless functions in `app/api/*.ts` (not counting `_lib/`) — currently at 12/12. Any new endpoint file must be preceded by consolidating two existing ones (Task 9 does this before Task 10 adds a new file).
- Supabase migrations are never applied automatically — every `.sql` file this plan creates must be manually pasted into Supabase → SQL Editor by the user after the task is implemented. Note this explicitly at the end of the relevant task.
- Session pattern: demo sessions (`isDemoSession()` true) use `localStorage`; real sessions use Supabase, with a synchronous in-memory cache populated by a background fetch (see `teamStore.ts`). Every change must handle both paths.
- Per the approved design (`docs/superpowers/specs/2026-08-04-profile-redesign-design.md`): name, role, phone, and photo stay per-organization (already the `studio_members` structure — no schema change needed for those fields). Email and password become account-level, managed only from the new "Compte" tab, never from the per-organization fields.
- `SFModal` (`app/src/components/ui/SFModal.tsx`) is the existing shared floating-panel component — reuse it, do not build a new floating container.
- i18n: all new user-facing strings go through `t('namespace.key')` with keys added to both `app/src/locales/fr.json` and `app/src/locales/en.json` (French first, matching existing convention).
- Out of scope (previously deferred, tracked in memory as `task-assignee-snapshot-staleness-deferred`): already-stored task/project member snapshots (`Task.assignees`, `Project.members`) do not live-refresh when a person's name/photo changes — this plan does not fix that pre-existing behavior, it only ensures newly-picked assignees carry correct, live initials/photo at pick-time, consistent with how name/initials already behave today.

---

### Task 1: Shared `computeInitials` utility

**Files:**
- Create: `app/src/utils/initials.ts`
- Modify: `app/src/data/authStore.ts:39-45`
- Modify: `app/src/components/profile/ProfileEditPanel.tsx:226`

**Interfaces:**
- Produces: `computeInitials(name: string): string` — takes the first letter of each whitespace-separated word in `name`, uppercased, max 2 characters. Returns `'??'` if `name` is empty/blank.

There are currently three separate copies of this same algorithm (`authStore.ts`, `studioStore.ts`, `ProfileEditPanel.tsx`) plus one that's simply wrong (the SQL function fixed in Task 4). This task creates the one shared version and points the two TypeScript call sites at it (`studioStore.ts` is touched in Task 2, not here, to keep this task's diff small).

- [ ] **Step 1: Create the utility file**

```typescript
// app/src/utils/initials.ts
export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
  return initials || '??';
}
```

- [ ] **Step 2: Use it in `authStore.ts`**

In `app/src/data/authStore.ts`, add the import at the top:

```typescript
import { computeInitials } from '../utils/initials';
```

Replace lines 42-43:

```typescript
  const parts = fullName.trim().split(' ').filter(Boolean);
  const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || '??';
```

with:

```typescript
  const initials = computeInitials(fullName);
```

- [ ] **Step 3: Use it in `ProfileEditPanel.tsx`**

In `app/src/components/profile/ProfileEditPanel.tsx`, add the import at the top:

```typescript
import { computeInitials } from '../../utils/initials';
```

Replace line 226:

```typescript
  const initials = name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || initialInitials;
```

with:

```typescript
  const initials = name.trim() ? computeInitials(name) : initialInitials;
```

(`initialInitials` stays as the fallback for an empty name field, same behavior as before.)

- [ ] **Step 4: Verify**

Run `npx tsc --noEmit -p tsconfig.app.json` from `app/` — must report no new errors. Start the dev server (`npm run dev`) and open a demo session (any `@rushflow.com` account) — confirm the top bar avatar and "Mon profil" still show the expected initials (no visual change expected yet, this task only centralizes the calculation).

- [ ] **Step 5: Commit**

```bash
git add app/src/utils/initials.ts app/src/data/authStore.ts app/src/components/profile/ProfileEditPanel.tsx
git commit -m "refactor: extract shared computeInitials utility"
```

---

### Task 2: Persist initials whenever the name changes

**Files:**
- Modify: `app/src/data/teamStore.ts:188-215`
- Modify: `app/src/components/profile/ProfileEditPanel.tsx:110-134,214-224`

**Interfaces:**
- Consumes: `computeInitials(name: string): string` from Task 1.
- Modifies: `updateMemberFields(userId, patch)` — `patch` gains an optional `initials` field; `upsertSupabaseMemberFields` writes it to `studio_members.initials` when present.
- Modifies: `saveProfile(userId, data)` — recomputes and persists `initials` whenever `data.name` is set.

This is the actual bug fix: today, editing your display name never updates the stored `initials` column (real sessions) or the stored JSON blob (demo sessions), so every other screen that reads `member.initials` (task assignee avatars, team roster, watchers) keeps showing the old initials forever.

- [ ] **Step 1: Let `updateMemberFields` accept and persist `initials`**

In `app/src/data/teamStore.ts`, update the patch type on both functions. Change line 188:

```typescript
async function upsertSupabaseMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel'>>): Promise<void> {
```

to:

```typescript
async function upsertSupabaseMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel' | 'initials'>>): Promise<void> {
```

Add the corresponding row assignment after line 191 (`if (patch.name !== undefined) row.name = patch.name;`):

```typescript
  if (patch.initials !== undefined)    row.initials = patch.initials;
```

Update line 210's signature the same way:

```typescript
export function updateMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel' | 'initials'>>): void {
```

- [ ] **Step 2: Compute and include initials in `saveProfile`**

In `app/src/components/profile/ProfileEditPanel.tsx`, add the import (if not already present from Task 1):

```typescript
import { computeInitials } from '../../utils/initials';
```

Replace the `ProfileOverrides` interface (lines 110-115):

```typescript
export interface ProfileOverrides {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
}
```

with:

```typescript
export interface ProfileOverrides {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  initials?: string;
}
```

Replace `saveProfile` (lines 128-134):

```typescript
export function saveProfile(userId: string, data: ProfileOverrides) {
  if (isDemoSession()) {
    try { localStorage.setItem(PROFILE_STORAGE_KEY(userId), JSON.stringify(data)); } catch { /* noop */ }
    return;
  }
  updateMemberFields(userId, data);
}
```

with:

```typescript
export function saveProfile(userId: string, data: ProfileOverrides) {
  const withInitials: ProfileOverrides = data.name !== undefined
    ? { ...data, initials: computeInitials(data.name) }
    : data;
  if (isDemoSession()) {
    try { localStorage.setItem(PROFILE_STORAGE_KEY(userId), JSON.stringify(withInitials)); } catch { /* noop */ }
    return;
  }
  updateMemberFields(userId, withInitials);
}
```

- [ ] **Step 3: Verify**

Start the dev server. In a demo session, open "Mon profil", change the display name (e.g. "Léa Marchand" → "Léa M."), save. Reopen "Mon profil" — the avatar preview should show "LM" still correctly, and the stored initials should now be "LM" derived from the new name. Open a task assigned to that user (e.g. via Mes tâches or a project's Kanban) and confirm the assignee avatar shows the same initials as the profile — this is the exact bug reported by the user.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/teamStore.ts app/src/components/profile/ProfileEditPanel.tsx
git commit -m "fix: recompute and persist initials whenever the display name changes"
```

---

### Task 3: Fix GlobalTopBar's own avatar to read live per-organization data

**Files:**
- Modify: `app/src/components/layout/GlobalTopBar.tsx:1-45`

**Interfaces:**
- Consumes: `findTeamMember(userId): TeamMemberInfo | undefined` and `subscribeTeam(fn): () => void`, both already exported by `teamStore.ts`.

Root cause found during investigation: `GlobalTopBar.tsx` builds its own avatar (`me`) directly from `getCurrentUser()` (the Supabase Auth session cache, only ever set at login/signup time from `user_metadata.full_name`), never from the live `studio_members` row. This means a real-session user who renames themselves via "Mon profil" (which only updates `studio_members`, per the approved per-organization design) never sees the top bar update — it's frozen at whatever name/initials existed at signup. `Parametres.tsx` already does this correctly (`findTeamMember(authUser.id)` preferred, `authUser` as fallback) — this task applies the same pattern to `GlobalTopBar.tsx`.

- [ ] **Step 1: Add the import**

In `app/src/components/layout/GlobalTopBar.tsx`, add to the existing imports:

```typescript
import { getMyAccessLevel, findTeamMember, subscribeTeam } from '../../data/teamStore';
```

(Replace the existing `import { getMyAccessLevel } from '../../data/teamStore';` line with this one — it already exists at line 11.)

- [ ] **Step 2: Subscribe to team changes so the bar re-renders after a save**

After the existing `useEffect(() => subscribeShortcuts(...), [])` (line 54), add:

```typescript
  useEffect(() => subscribeTeam(() => forceUpdate(n => n + 1)), []);
```

(`forceUpdate` already exists in this component, declared at line 30 for the nav-history tracking — reused here.)

- [ ] **Step 3: Prefer the live team-member record**

Replace lines 42-45:

```typescript
  // Auth user — fall back to Léa if no session (dev convenience)
  const authUser = getCurrentUser();
  const me = authUser
    ? { id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }
    : FALLBACK_USER;
```

with:

```typescript
  // Auth user — fall back to Léa if no session (dev convenience). Prefer the
  // live studio_members record over the Supabase Auth session cache: the
  // latter is only ever set at login/signup time from user_metadata and
  // never reflects a later name/photo change made in "Mon profil" (which
  // writes to studio_members, per the per-organization profile design).
  const authUser = getCurrentUser();
  const liveMember = authUser ? findTeamMember(authUser.id) : undefined;
  const me = liveMember
    ? { id: liveMember.id, name: liveMember.name, initials: liveMember.initials, avatarColor: liveMember.avatarColor, role: liveMember.role }
    : authUser
      ? { id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }
      : FALLBACK_USER;
```

- [ ] **Step 4: Verify**

In a real (non-demo) session, rename yourself via "Mon profil" and save. Without reloading the page, confirm the top bar's avatar/name updates immediately. In a demo session, confirm nothing regresses (demo `getTeamMembers()` and `getCurrentUser()` already read from the same static `USERS` object, so behavior stays identical).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/GlobalTopBar.tsx
git commit -m "fix: GlobalTopBar avatar reflects live studio_members data, not the stale auth cache"
```

---

### Task 4: SQL migration — fix invitation-acceptance initials and accept per-organization fields

**Files:**
- Create: `docs/superpowers/specs/2026-08-04-profile-redesign-migration.sql`

**Interfaces:**
- Produces: `accept_studio_invitation(p_token text, p_name text default null, p_phone text default null, p_photo_url text default null)` — replaces the existing 1-argument version.
- Consumes: existing `studio_invitations`, `studio_members`, `auth.users` tables (unchanged schema — only the function body changes, plus two new nullable columns are NOT needed since `studio_members` already has `phone`/`photo_url` columns per `teamStore.ts`'s `StudioMemberRow` interface).

The existing function (spec `2026-07-15-access-level-migration.sql`) computes initials as `upper(left(name, 2))` — the first two *characters*, not the first letter of each word (e.g. "Léa Marchand" becomes "LÉ" instead of "LM"). It also has no way to receive a display name override, phone, or photo chosen during invitation acceptance (Task 5 adds that UI).

- [ ] **Step 1: Write the migration**

```sql
-- app/src/utils/initials.ts's algorithm, ported to SQL: first letter of each
-- whitespace-separated word, uppercased, max 2 characters. Replaces the old
-- `upper(left(name, 2))` (first two characters — wrong for any two-word name).
create or replace function public.compute_initials(p_name text)
returns text
language sql
immutable
as $function$
  select coalesce(
    upper(
      substr(split_part(trim(p_name), ' ', 1), 1, 1) ||
      case
        when split_part(trim(p_name), ' ', 2) <> ''
          then substr(split_part(trim(p_name), ' ', 2), 1, 1)
        else ''
      end
    ),
    '??'
  );
$function$;

create or replace function accept_studio_invitation(
  p_token text,
  p_name text default null,
  p_phone text default null,
  p_photo_url text default null
)
returns void
language plpgsql security definer as $$
declare
  inv studio_invitations%rowtype;
  u auth.users%rowtype;
  v_name text;
begin
  select * into inv from studio_invitations where token = p_token and status = 'pending';
  if not found then
    raise exception 'invalid_or_used_invitation';
  end if;

  select * into u from auth.users where id = auth.uid();

  if u.email is null or lower(u.email) <> lower(inv.email) then
    raise exception 'invitation_email_mismatch';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), u.raw_user_meta_data->>'full_name', inv.email);

  insert into studio_members (studio_id, user_id, name, email, role, initials, avatar_color, is_owner, permissions, access_level, phone, photo_url)
  values (
    inv.studio_id,
    auth.uid(),
    v_name,
    inv.email,
    inv.role,
    compute_initials(v_name),
    '#5c3d8f',
    false,
    inv.permissions,
    coalesce(inv.access_level, 'member'),
    nullif(trim(p_phone), ''),
    nullif(trim(p_photo_url), '')
  );

  update studio_invitations set status = 'accepted' where token = p_token;
end;
$$;
grant execute on function accept_studio_invitation(text, text, text, text) to authenticated;
```

- [ ] **Step 2: Note the manual execution requirement**

Add a comment at the top of the file (this project never auto-applies migrations):

```sql
-- À exécuter manuellement dans Supabase → SQL Editor. Remplace la fonction
-- accept_studio_invitation existante (spec 2026-07-15-access-level-migration.sql)
-- par une version à 4 arguments (les 3 derniers optionnels, compatibles avec
-- tout appel existant à 1 argument tant que le front n'est pas encore mis à
-- jour par la tâche suivante).
```

- [ ] **Step 3: Verify (after the user runs it in Supabase)**

This step cannot be verified by the implementer alone — flag `DONE_WITH_CONCERNS` (or note it explicitly in the task report) that the SQL file was written but not executed, and that Task 5's manual verification depends on it having been run.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-04-profile-redesign-migration.sql
git commit -m "docs: add migration fixing invitation-acceptance initials and accepting per-org profile fields"
```

---

### Task 5: Collect per-organization profile info when joining a studio

**Files:**
- Modify: `app/src/data/teamStore.ts:288-294`
- Modify: `app/src/screens/TeamInvitationAccept.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `accept_studio_invitation` RPC from Task 4 (4 arguments).
- Modifies: `acceptInvitation(token, extra?)` — `extra` is `{ name?: string; phone?: string; photoUrl?: string }`.

Two flows to fix, both in `TeamInvitationAccept.tsx`:
1. **New account via invitation** (`mode === 'register'`) — already asks for a name; add optional photo and phone fields.
2. **Existing account joining another organization** (`acceptAsCurrentSession`, the "already logged in" branch) — currently accepts immediately with zero info collected for the new organization. Add the same short form first.

- [ ] **Step 1: Update `acceptInvitation` to pass the extra fields**

In `app/src/data/teamStore.ts`, replace lines 288-294:

```typescript
export async function acceptInvitation(token: string): Promise<void> {
  const { error } = await supabase.rpc('accept_studio_invitation', { p_token: token });
  if (error) throw error;
  // The caller now belongs to a different studio than getStudioId()'s cache
  // (if any) would reflect — force every store to re-resolve it from scratch.
  resetTeamCache();
}
```

with:

```typescript
export async function acceptInvitation(token: string, extra?: { name?: string; phone?: string; photoUrl?: string }): Promise<void> {
  const { error } = await supabase.rpc('accept_studio_invitation', {
    p_token: token,
    p_name: extra?.name ?? null,
    p_phone: extra?.phone ?? null,
    p_photo_url: extra?.photoUrl ?? null,
  });
  if (error) throw error;
  // The caller now belongs to a different studio than getStudioId()'s cache
  // (if any) would reflect — force every store to re-resolve it from scratch.
  resetTeamCache();
}
```

- [ ] **Step 2: Add photo/phone fields to the "register" mode form**

In `app/src/screens/TeamInvitationAccept.tsx`, add new state near the existing `name`/`password` state (after line 60):

```typescript
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
```

Add `useRef` to the existing React import (line 1): change

```typescript
import { useEffect, useState } from 'react';
```

to:

```typescript
import { useEffect, useRef, useState } from 'react';
```

Add a photo-file handler near `handleRegister` (after line 116, before `handleRegister`):

```typescript
  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };
```

Update `handleRegister` (lines 118-151) to pass the extra fields — replace:

```typescript
    try {
      await acceptInvitation(token);
    } catch {
```

with:

```typescript
    try {
      await acceptInvitation(token, { phone: phone.trim() || undefined, photoUrl: photo ?? undefined });
    } catch {
```

In the register-mode JSX (after the "Nom complet" field, around line 312, right before the email field), add:

```tsx
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('teamInvitation.photoOptional')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <SFIcon name="user" size={18} color="var(--text-3)" />}
            </div>
            <button type="button" onClick={() => photoInputRef.current?.click()} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              {t('teamInvitation.choosePhoto')}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoFile} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('teamInvitation.phoneOptional')}</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('teamInvitation.phonePlaceholder')} style={inputStyle} />
        </div>
```

- [ ] **Step 3: Add the mini-form for an existing account joining a new organization**

In `app/src/screens/TeamInvitationAccept.tsx`, this is the "already logged in" branch (lines 202-230). Add the same two fields plus a name field pre-filled from the current session, shown before the "Rejoindre" button. Replace the whole `return` block at lines 202-230 with:

```tsx
    return (
      <Shell logoUrl={invitation?.studioLogoFull}>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('teamInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('teamInvitation.pendingDescLoggedIn', { studio: invitation!.studioName, role: invitation!.role })}
        </p>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.fullName')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={sessionEmail ?? ''} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('teamInvitation.photoOptional')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <SFIcon name="user" size={18} color="var(--text-3)" />}
            </div>
            <button type="button" onClick={() => photoInputRef.current?.click()} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              {t('teamInvitation.choosePhoto')}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoFile} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>{t('teamInvitation.phoneOptional')}</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('teamInvitation.phonePlaceholder')} style={inputStyle} />
        </div>
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
          {submitting ? '…' : t('teamInvitation.joinButton')}
        </button>
      </Shell>
    );
```

Update `acceptAsCurrentSession` (lines 86-103) to pass the collected fields — replace:

```typescript
      await acceptInvitation(token);
```

with:

```typescript
      await acceptInvitation(token, { name: name.trim() || undefined, phone: phone.trim() || undefined, photoUrl: photo ?? undefined });
```

- [ ] **Step 4: Add the new i18n keys**

In `app/src/locales/fr.json`, inside the `teamInvitation` namespace, add:

```json
    "photoOptional": "Photo (optionnel)",
    "choosePhoto": "Choisir une photo",
    "phoneOptional": "Téléphone (optionnel)",
    "phonePlaceholder": "514 555-0100",
```

In `app/src/locales/en.json`, same namespace:

```json
    "photoOptional": "Photo (optional)",
    "choosePhoto": "Choose a photo",
    "phoneOptional": "Phone (optional)",
    "phonePlaceholder": "555-0100",
```

- [ ] **Step 5: Verify**

Requires Task 4's migration to have been run in Supabase first. Create a test invitation (via "Mon équipe" → "Inviter un membre") to a fresh email, open the invitation link in an incognito window, choose "Créer un compte", fill in name + a test photo + phone, submit — confirm the new studio member shows the chosen photo/phone/correct initials in "Mon équipe". Repeat with an already-logged-in second account accepting an invitation to a different organization — confirm the mini-form appears and the values land correctly for that organization without affecting the first organization's profile.

- [ ] **Step 6: Commit**

```bash
git add app/src/data/teamStore.ts app/src/screens/TeamInvitationAccept.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: collect per-organization profile info (photo, phone) when joining a studio"
```

---

### Task 6: Convert ProfileEditPanel to a floating modal

**Files:**
- Modify: `app/src/components/profile/ProfileEditPanel.tsx:241-450`

**Interfaces:**
- Consumes: `SFModal` from `app/src/components/ui` (props: `open`, `onClose`, `width`, `maxHeight`, `padding`, `children` — see `app/src/components/ui/SFModal.tsx`).

Replaces the custom right-side drawer markup with `SFModal`, keeping every existing internal section (avatar block, tabs, info fields, permissions) unchanged in content — only the outer container changes.

- [ ] **Step 1: Add the import**

```typescript
import { SFModal } from '../ui';
```

- [ ] **Step 2: Replace the outer container**

Replace the opening wrapper (lines 241-255):

```tsx
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />

      <div style={{ position: 'relative', width: 480, height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-16px 0 48px rgba(0,0,0,0.7)', borderLeft: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{isSelf ? t('profile.myProfile') : t('profile.profileOf', { name: initialName })}</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
              <SFIcon name="x" size={16} />
            </button>
          </div>
```

with:

```tsx
  return (
    <SFModal open onClose={onClose} width={480} maxHeight="85vh" padding={0} zIndex={500}>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '85vh' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{isSelf ? t('profile.myProfile') : t('profile.profileOf', { name: initialName })}</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
              <SFIcon name="x" size={16} />
            </button>
          </div>
```

(`SFModal` renders its own backdrop and centers itself — the manual backdrop `<div>` and the outer `position:fixed` wrapper are no longer needed. `open` is passed as a literal boolean prop shorthand since this component is only ever rendered when `open` should be true — the caller already conditionally renders `<ProfileEditPanel .../>` only when it should be visible.)

- [ ] **Step 3: Close the new wrapper correctly**

At the end of the component, replace the closing tags (lines 448-450):

```tsx
      </div>
    </div>
  );
}
```

with:

```tsx
      </div>
    </SFModal>
  );
}
```

- [ ] **Step 4: Verify**

Start the dev server, open "Mon profil" from the top bar. Confirm it now appears as a centered floating card with a dark backdrop (matching a task detail panel's look), not a right-side drawer. Confirm closing via the X button, clicking the backdrop, and pressing Escape (all handled by `SFModal`) all work. Confirm the Info/Permissions tabs and scrolling within the body still work as before.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/profile/ProfileEditPanel.tsx
git commit -m "refactor: ProfileEditPanel uses SFModal (floating panel) instead of a side drawer"
```

---

### Task 7: "Compte" tab — email display and password change

**Files:**
- Modify: `app/src/components/profile/ProfileEditPanel.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `resetPassword(email): Promise<{ ok: boolean; error?: string }>` and `isDemoSession(): boolean`, both from `app/src/data/authStore.ts`.

Adds a third tab, visible only when `isSelf` (you only manage your own account credentials from here, never someone else's). This task covers email display + password reset; Tasks 8 and 10 add the email-change and account-deletion actions into the same tab.

- [ ] **Step 1: Import what's needed**

Add to the existing imports in `ProfileEditPanel.tsx`:

```typescript
import { resetPassword } from '../../data/authStore';
```

- [ ] **Step 2: Add tab state and a "sent" flag**

Change the `tab` state (line 186) from:

```typescript
  const [tab, setTab] = useState<'info' | 'permissions'>('info');
```

to:

```typescript
  const [tab, setTab] = useState<'info' | 'permissions' | 'account'>('info');
  const [pwResetSent, setPwResetSent] = useState(false);
  const [pwResetSending, setPwResetSending] = useState(false);
```

- [ ] **Step 3: Add the tab button**

Change the tabs row (lines 288-294) from:

```tsx
          <div style={{ display: 'flex', gap: 0 }}>
            {([['info', t('profile.tabInfo')], ['permissions', t('profile.tabPermissions')]] as const).map(([key, lbl]) => (
              <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '9px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: tab === key ? 600 : 400, color: tab === key ? 'var(--text)' : 'var(--text-3)', borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`, fontFamily: 'var(--ff-text)', transition: 'color 0.1s' }}>
                {lbl}
              </button>
            ))}
          </div>
```

to:

```tsx
          <div style={{ display: 'flex', gap: 0 }}>
            {(() => {
              const tabs: { key: 'info' | 'permissions' | 'account'; label: string }[] = [
                { key: 'info', label: t('profile.tabInfo') },
                { key: 'permissions', label: t('profile.tabPermissions') },
              ];
              if (isSelf) tabs.push({ key: 'account', label: t('profile.tabAccount') });
              return tabs.map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '9px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: tab === key ? 600 : 400, color: tab === key ? 'var(--text)' : 'var(--text-3)', borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`, fontFamily: 'var(--ff-text)', transition: 'color 0.1s' }}>
                  {label}
                </button>
              ));
            })()}
          </div>
```

- [ ] **Step 4: Add the password-reset handler**

Near `handleSave` (after line 224), add:

```typescript
  const handlePasswordReset = async () => {
    if (isDemoSession()) return;
    setPwResetSending(true);
    const result = await resetPassword(email);
    setPwResetSending(false);
    if (result.ok) setPwResetSent(true);
  };
```

- [ ] **Step 5: Add the "Compte" tab body**

Right after the `{tab === 'permissions' && ( ... )}` block closes (after line 433, before the closing `</div>` of the body at line 434), add:

```tsx
          {tab === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {isDemoSession() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <SFIcon name="info" size={15} color="var(--text-3)" />
                  <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{t('profile.accountDemoNotice')}</p>
                </div>
              )}
              <div>
                {label(t('profile.email'))}
                <p style={{ fontSize: 13, color: 'var(--text)' }}>{email}</p>
              </div>
              <div>
                {label(t('profile.password'))}
                <button
                  onClick={handlePasswordReset}
                  disabled={isDemoSession() || pwResetSending || pwResetSent}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: isDemoSession() ? 'not-allowed' : 'pointer', opacity: isDemoSession() ? 0.5 : 1, fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name={pwResetSent ? 'check' : 'key-round'} size={14} />
                  {pwResetSent ? t('profile.passwordResetSent') : pwResetSending ? '…' : t('profile.changePassword')}
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 6: Add i18n keys**

In `app/src/locales/fr.json`, inside `profile`:

```json
    "tabAccount": "Compte",
    "password": "Mot de passe",
    "changePassword": "Changer le mot de passe",
    "passwordResetSent": "Courriel envoyé",
    "accountDemoNotice": "Ces actions nécessitent un compte réel — elles sont désactivées en mode démo.",
```

In `app/src/locales/en.json`, inside `profile`:

```json
    "tabAccount": "Account",
    "password": "Password",
    "changePassword": "Change password",
    "passwordResetSent": "Email sent",
    "accountDemoNotice": "These actions require a real account — they're disabled in demo mode.",
```

- [ ] **Step 7: Verify**

Open "Mon profil" in a real session, go to the "Compte" tab, confirm your current email is shown, click "Changer le mot de passe", confirm the button switches to "Courriel envoyé" and a password-reset email arrives. In a demo session, confirm the button is visibly disabled with the explanatory notice shown.

- [ ] **Step 8: Commit**

```bash
git add app/src/components/profile/ProfileEditPanel.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add Compte tab to profile panel — email display and password reset"
```

---

### Task 8: Email change action

**Files:**
- Modify: `app/src/components/profile/ProfileEditPanel.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `supabase.auth.updateUser({ email }): Promise<{ data; error }>` from `app/src/data/supabaseClient.ts`'s shared client.

Supabase's built-in email-change flow sends a confirmation link to the new address before the change takes effect — no custom backend needed.

- [ ] **Step 1: Import the shared Supabase client**

```typescript
import { supabase } from '../../data/supabaseClient';
```

- [ ] **Step 2: Add state for the inline email-change form**

Near the other Compte-tab state added in Task 7, add:

```typescript
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailChangeError, setEmailChangeError] = useState('');
  const [emailChangeSent, setEmailChangeSent] = useState(false);
```

- [ ] **Step 3: Add the submit handler**

```typescript
  const submitEmailChange = async () => {
    setEmailChangeError('');
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailChangeError(t('profile.emailInvalid'));
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim().toLowerCase() });
    if (error) {
      setEmailChangeError(error.message);
      return;
    }
    setEmailChangeSent(true);
  };
```

- [ ] **Step 4: Replace the read-only email block with an editable one**

In the "Compte" tab body added in Task 7, replace:

```tsx
              <div>
                {label(t('profile.email'))}
                <p style={{ fontSize: 13, color: 'var(--text)' }}>{email}</p>
              </div>
```

with:

```tsx
              <div>
                {label(t('profile.email'))}
                {emailChangeSent ? (
                  <p style={{ fontSize: 12, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SFIcon name="mail-check" size={14} color="var(--ok)" /> {t('profile.emailChangeSent', { email: newEmail })}
                  </p>
                ) : changingEmail ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={t('profile.newEmailPlaceholder')} type="email" style={inputStyle} />
                    {emailChangeError && <p style={{ fontSize: 11, color: 'var(--danger)' }}>{emailChangeError}</p>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <SFButton variant="primary" onClick={submitEmailChange}>{t('profile.confirmEmailChange')}</SFButton>
                      <SFButton variant="ghost" onClick={() => { setChangingEmail(false); setNewEmail(''); setEmailChangeError(''); }}>{t('profile.cancel')}</SFButton>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 13, color: 'var(--text)' }}>{email}</p>
                    {!isDemoSession() && (
                      <button onClick={() => setChangingEmail(true)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                        {t('profile.changeEmail')}
                      </button>
                    )}
                  </div>
                )}
              </div>
```

- [ ] **Step 5: Add i18n keys**

In `app/src/locales/fr.json`, inside `profile`:

```json
    "changeEmail": "Changer d'adresse courriel",
    "newEmailPlaceholder": "nouvelle.adresse@exemple.com",
    "confirmEmailChange": "Envoyer le lien de confirmation",
    "emailChangeSent": "Un lien de confirmation a été envoyé à {{email}}. Le changement prendra effet une fois confirmé.",
    "emailInvalid": "Adresse courriel invalide",
```

In `app/src/locales/en.json`, inside `profile`:

```json
    "changeEmail": "Change email address",
    "newEmailPlaceholder": "new.address@example.com",
    "confirmEmailChange": "Send confirmation link",
    "emailChangeSent": "A confirmation link was sent to {{email}}. The change takes effect once confirmed.",
    "emailInvalid": "Invalid email address",
```

- [ ] **Step 6: Verify**

In a real session, go to Compte → "Changer d'adresse courriel", enter a new test address you control, confirm you receive the confirmation link and that logging in still uses the old address until you click it.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/profile/ProfileEditPanel.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: allow changing account email from the Compte tab"
```

---

### Task 9: Consolidate the two Stripe session endpoints to free a serverless function slot

**Files:**
- Create: `app/api/stripe-sessions.ts`
- Delete: `app/api/create-checkout-session.ts`
- Delete: `app/api/create-portal-session.ts`
- Modify: `app/src/screens/Parametres.tsx:1191-1257`

**Interfaces:**
- Produces: `POST /api/stripe-sessions` with body `{ action: 'checkout', studioId, plan, billingCycle, seats, storageTier }` or `{ action: 'portal', studioId }`, response `{ url: string }`.

Vercel Hobby caps at 12 serverless functions; the project is currently at exactly 12 (`app/api/*.ts`, excluding `_lib/`). Task 10 needs a new file for account deletion, so this task merges two near-identical Stripe endpoints first, following the same `action`-discriminated pattern already used in `app/api/admin.ts`.

- [ ] **Step 1: Create the merged endpoint**

```typescript
// app/api/stripe-sessions.ts
// Merged create-checkout-session.ts + create-portal-session.ts into one
// function to stay under Vercel Hobby's 12-serverless-function cap — both
// were near-identical (verify caller's studio membership, then call Stripe),
// differing only by which Stripe API they call.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { STRIPE_PRICE_IDS } from '../src/data/stripePriceIds.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CheckoutBody {
  action: 'checkout';
  studioId: string;
  plan: 'studio' | 'agence';
  billingCycle: 'monthly' | 'yearly';
  seats: number;
  storageTier: number;
}

interface PortalBody {
  action: 'portal';
  studioId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body as CheckoutBody | PortalBody;
  if (body.action !== 'checkout' && body.action !== 'portal') {
    res.status(400).json({ error: 'Invalid action' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { studioId } = body;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const origin = req.headers.origin || 'https://rushflow.app';

  if (body.action === 'portal') {
    const { data: studio, error: studioError } = await supabaseAdmin
      .from('studios')
      .select('stripe_customer_id')
      .eq('id', studioId)
      .single();

    if (studioError || !studio?.stripe_customer_id) {
      res.status(400).json({ error: 'No Stripe customer for this studio' });
      return;
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: studio.stripe_customer_id,
        return_url: `${origin}/parametres?section=plan`,
      });
      res.status(200).json({ url: session.url });
    } catch (error) {
      console.error('Failed to create Stripe billing portal session:', error);
      res.status(500).json({ error: 'Failed to create billing portal session' });
    }
    return;
  }

  // action === 'checkout'
  const { plan, billingCycle, seats, storageTier } = body;
  if (plan !== 'studio' && plan !== 'agence') {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const planPrices = STRIPE_PRICE_IDS[plan];
  const basePriceId = billingCycle === 'monthly' ? planPrices.monthly : planPrices.yearly;
  const seatPriceId = billingCycle === 'monthly' ? planPrices.seatMonthly : planPrices.seatYearly;
  const storagePrices = billingCycle === 'monthly' ? STRIPE_PRICE_IDS.storageMonthly : STRIPE_PRICE_IDS.storageYearly;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: basePriceId, quantity: 1 },
  ];

  const extraSeats = Math.max(0, seats - 2);
  if (extraSeats > 0) {
    lineItems.push({ price: seatPriceId, quantity: extraSeats });
  }

  if (storageTier > 0) {
    lineItems.push({ price: storagePrices[storageTier - 1], quantity: 1 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      allow_promotion_codes: true,
      success_url: `${origin}/parametres?checkout=success`,
      cancel_url: `${origin}/parametres?checkout=cancelled`,
      metadata: { studioId },
      subscription_data: { metadata: { studioId } },
    });
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Failed to create Stripe checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
```

- [ ] **Step 2: Delete the two old files**

```bash
git rm app/api/create-checkout-session.ts app/api/create-portal-session.ts
```

- [ ] **Step 3: Update the front-end call sites**

In `app/src/screens/Parametres.tsx`, replace the checkout-session call (lines 1191-1201):

```typescript
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          studioId,
          plan: draftPlan,
          billingCycle: billing,
          seats: draftSeats,
          storageTier: draftStorage,
        }),
      });
```

with:

```typescript
      const res = await fetch('/api/stripe-sessions', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'checkout',
          studioId,
          plan: draftPlan,
          billingCycle: billing,
          seats: draftSeats,
          storageTier: draftStorage,
        }),
      });
```

Replace the portal-session call (lines 1240-1247):

```typescript
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ studioId }),
      });
```

with:

```typescript
      const res = await fetch('/api/stripe-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'portal', studioId }),
      });
```

- [ ] **Step 4: Verify**

Run `find app/api -maxdepth 1 -name "*.ts" ! -path "*/_lib/*" | wc -l` from the repo root — must print `11` (was 12, now 11 after removing 2 and adding 1). In Parametres → Plan, trigger an upgrade to a paid plan (test mode) — confirm the checkout redirect still works. From an existing paid plan, click "Gérer mon abonnement" — confirm the billing portal still opens.

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe-sessions.ts app/src/screens/Parametres.tsx
git commit -m "chore(api): merge create-checkout-session + create-portal-session into one function"
```

---

### Task 10: Account deletion

**Files:**
- Create: `app/api/account.ts`
- Modify: `app/src/components/profile/ProfileEditPanel.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Produces: `POST /api/account` with body `{ action: 'delete' }` (auth via `Authorization: Bearer <token>` header, same pattern as `stripe-sessions.ts`), response `{ ok: true }` or `{ error: 'owner_must_transfer', studios: string[] }`.

This runs after Task 9 frees a function slot — the project would otherwise stay at the 12-function cap. Deletion logic: block if the caller is the sole owner of any organization that has other members (per the approved design); otherwise delete the Supabase Auth user, which cascades to `studio_members` rows via the existing `on delete cascade` foreign key.

- [ ] **Step 1: Create the endpoint**

```typescript
// app/api/account.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body as { action?: string };
  if (body.action !== 'delete') {
    res.status(400).json({ error: 'Invalid action' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: ownedMemberships, error: ownedError } = await supabaseAdmin
    .from('studio_members')
    .select('studio_id')
    .eq('user_id', user.id)
    .eq('is_owner', true);

  if (ownedError) {
    console.error('Failed to check owned studios:', ownedError);
    res.status(500).json({ error: 'Failed to check account' });
    return;
  }

  const blockedStudioIds: string[] = [];
  for (const { studio_id } of ownedMemberships ?? []) {
    const { count, error: countError } = await supabaseAdmin
      .from('studio_members')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studio_id)
      .neq('user_id', user.id);
    if (countError) {
      console.error('Failed to count studio members:', countError);
      res.status(500).json({ error: 'Failed to check account' });
      return;
    }
    if ((count ?? 0) > 0) blockedStudioIds.push(studio_id);
  }

  if (blockedStudioIds.length > 0) {
    res.status(409).json({ error: 'owner_must_transfer', studios: blockedStudioIds });
    return;
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('Failed to delete account:', deleteError);
    res.status(500).json({ error: 'Failed to delete account' });
    return;
  }

  res.status(200).json({ ok: true });
}
```

- [ ] **Step 2: Verify the new function count**

```bash
find app/api -maxdepth 1 -name "*.ts" ! -path "*/_lib/*" | wc -l
```

Must print `12` (11 after Task 9, +1 here).

- [ ] **Step 3: Add the deletion UI to the Compte tab**

Add state near the other Compte-tab state:

```typescript
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
```

Add the handler near `handlePasswordReset`:

```typescript
  const handleDeleteAccount = async () => {
    setDeleteError('');
    setDeleting(true);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'delete' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError(json.error === 'owner_must_transfer' ? t('profile.deleteBlockedOwner') : t('profile.deleteFailed'));
        setDeleting(false);
        return;
      }
      window.location.href = '/login';
    } catch {
      setDeleteError(t('profile.deleteFailed'));
      setDeleting(false);
    }
  };
```

Append to the end of the "Compte" tab body (inside the `{tab === 'account' && ( ... )}` block, after the password section):

```tsx
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div>
                {label(t('profile.dangerZone'))}
                {!deleteConfirming ? (
                  <button
                    onClick={() => setDeleteConfirming(true)}
                    disabled={isDemoSession()}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: isDemoSession() ? 'not-allowed' : 'pointer', opacity: isDemoSession() ? 0.5 : 1, fontFamily: 'var(--ff-text)' }}
                  >
                    <SFIcon name="trash-2" size={14} color="var(--danger)" />
                    {t('profile.deleteAccount')}
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 10, border: '1px solid var(--danger)', background: 'rgba(255,80,80,0.06)' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('profile.deleteWarning')}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('profile.deleteConfirmInstructions', { email })}</p>
                    <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} style={inputStyle} placeholder={email} />
                    {deleteError && <p style={{ fontSize: 11, color: 'var(--danger)' }}>{deleteError}</p>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirmText.trim().toLowerCase() !== email.trim().toLowerCase() || deleting}
                        style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: deleteConfirmText.trim().toLowerCase() === email.trim().toLowerCase() ? 'var(--danger)' : 'var(--surface-3)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: deleteConfirmText.trim().toLowerCase() === email.trim().toLowerCase() ? 'pointer' : 'not-allowed', fontFamily: 'var(--ff-text)' }}
                      >
                        {deleting ? '…' : t('profile.confirmDelete')}
                      </button>
                      <SFButton variant="ghost" onClick={() => { setDeleteConfirming(false); setDeleteConfirmText(''); setDeleteError(''); }}>{t('profile.cancel')}</SFButton>
                    </div>
                  </div>
                )}
              </div>
```

- [ ] **Step 4: Add i18n keys**

In `app/src/locales/fr.json`, inside `profile`:

```json
    "dangerZone": "Zone de danger",
    "deleteAccount": "Supprimer mon compte",
    "deleteWarning": "Cette action est irréversible. Ton compte et l'accès à toutes tes organisations seront supprimés définitivement.",
    "deleteConfirmInstructions": "Retape ton adresse courriel ({{email}}) pour confirmer.",
    "confirmDelete": "Supprimer définitivement",
    "deleteBlockedOwner": "Tu es seul propriétaire d'au moins une organisation avec d'autres membres. Transfère la propriété avant de supprimer ton compte.",
    "deleteFailed": "La suppression a échoué. Réessaie plus tard.",
```

In `app/src/locales/en.json`, inside `profile`:

```json
    "dangerZone": "Danger zone",
    "deleteAccount": "Delete my account",
    "deleteWarning": "This action is irreversible. Your account and access to all your organizations will be permanently deleted.",
    "deleteConfirmInstructions": "Retype your email ({{email}}) to confirm.",
    "confirmDelete": "Delete permanently",
    "deleteBlockedOwner": "You're the sole owner of at least one organization with other members. Transfer ownership before deleting your account.",
    "deleteFailed": "Deletion failed. Try again later.",
```

- [ ] **Step 5: Verify**

Create two throwaway real test accounts. On an account that is sole owner of an organization with a second member in it, attempt deletion — confirm it's blocked with the explanatory message. On an account that is either not an owner anywhere or owns only organizations with no other members, retype the email and confirm — confirm the account is deleted and you're redirected to `/login`, and that logging in with those credentials afterward fails.

- [ ] **Step 6: Commit**

```bash
git add app/api/account.ts app/src/components/profile/ProfileEditPanel.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add account deletion with owner-transfer guard"
```

---

### Task 11: Show profile photos everywhere an avatar renders

**Files:**
- Modify: `app/src/components/ui/SFAvatar.tsx`
- Modify: `app/src/types/index.ts:7-13`
- Modify: `app/src/data/teamStore.ts:125-136`
- Modify: `app/src/components/ui/AssigneeGroup.tsx:66-70,185`
- Modify: `app/src/components/WatchersRow.tsx:26,47`
- Modify: `app/src/components/ProjectCard.tsx:459`
- Modify: `app/src/screens/ProjectMembres.tsx:208,239,389,549`

**Interfaces:**
- Modifies: `SFAvatar` gains an optional `photoUrl?: string` prop; when set, renders an `<img>` instead of initials text.
- Modifies: `SFAvatarGroup`'s `avatars` array items gain an optional `photoUrl?: string` field.
- Modifies: `User` interface (`app/src/types/index.ts`) gains an optional `photoUrl?: string` field.
- Modifies: `getTeam(): User[]` (`teamStore.ts`) includes `photoUrl` on each returned entry.

`SFAvatar`/`SFAvatarGroup` currently only accept `initials` — every call site that uses them (task assignees, watchers, project member stacks, the "Mon équipe" member picker rows) can never show a photo even when one exists, because the component itself has no way to receive it. `MonEquipe.tsx`'s own member cards already render photos via a separate bespoke `<img>` block (not through `SFAvatar`) — no change needed there.

- [ ] **Step 1: Add `photoUrl` support to `SFAvatar`**

Replace the whole `SFAvatar` function in `app/src/components/ui/SFAvatar.tsx` (lines 1-35):

```tsx
interface SFAvatarProps {
  initials: string;
  bg?: string;
  color?: string;
  size?: number;
  title?: string;
  name?: string;
  photoUrl?: string;
}

export function SFAvatar({ initials, bg, color, size = 28, title, name, photoUrl }: SFAvatarProps) {
  const resolvedBg = bg ?? color ?? 'var(--surface-3)';
  const resolvedTitle = title ?? name;
  return (
    <span
      title={resolvedTitle}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: resolvedBg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.36),
        fontWeight: 600,
        color: '#fff',
        flexShrink: 0,
        letterSpacing: '0.01em',
        fontFamily: 'var(--ff-text)',
        overflow: 'hidden',
      }}
    >
      {photoUrl ? <img src={photoUrl} alt={resolvedTitle ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  );
}
```

- [ ] **Step 2: Add `photoUrl` support to `SFAvatarGroup`**

In the same file, replace the `SFAvatarGroupProps` interface and the `avatars.map` call (lines 37-61):

```tsx
interface SFAvatarGroupProps {
  avatars: { initials: string; bg: string; name?: string; photoUrl?: string }[];
  size?: number;
  max?: number;
}

export function SFAvatarGroup({ avatars, size = 24, max = 4 }: SFAvatarGroupProps) {
  const shown = avatars.slice(0, max);
  const rest = avatars.length - shown.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((a, i) => (
        <span
          key={i}
          style={{ display: 'inline-flex', alignItems: 'center', marginLeft: i === 0 ? 0 : -(size * 0.28), zIndex: shown.length - i }}
        >
          <SFAvatar initials={a.initials} bg={a.bg} size={size} title={a.name} photoUrl={a.photoUrl} />
        </span>
      ))}
```

(the `rest > 0` block below stays unchanged — leave it as-is.)

- [ ] **Step 3: Add `photoUrl` to the `User` type**

In `app/src/types/index.ts`, replace lines 7-13:

```typescript
export interface User {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  role: string;
}
```

with:

```typescript
export interface User {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  role: string;
  photoUrl?: string;
}
```

- [ ] **Step 4: Populate `photoUrl` in `getTeam()`**

In `app/src/data/teamStore.ts`, replace the `getTeam` function (lines 125-136):

```typescript
export function getTeam(): User[] {
  const team = getTeamMembers();
  if (team.length > 0) return team;
  const authUser = getCurrentUser();
  if (!authUser) return [USERS.lea];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
}
```

with:

```typescript
export function getTeam(): User[] {
  const team = getTeamMembers();
  if (team.length > 0) return team.map(m => ({ id: m.id, name: m.name, initials: m.initials, avatarColor: m.avatarColor, role: m.role, photoUrl: m.photoUrl }));
  const authUser = getCurrentUser();
  if (!authUser) return [USERS.lea];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
}
```

(`TeamMemberInfo` already extends `User` and already carries `photoUrl` for real sessions per its `toMember()` mapping; for demo sessions `getTeamMembers()` returns `USERS` entries which have no `photoUrl` — `undefined` there is correct, since `ProfileEditPanel`'s demo photo storage (`loadPhoto`) is keyed separately and not part of `USERS`, matching existing demo-session behavior elsewhere in this component.)

- [ ] **Step 5: Wire `photoUrl` through `AssigneeGroup.tsx`**

In `app/src/components/ui/AssigneeGroup.tsx`, replace line 67:

```typescript
        avatars={assignees.map(u => ({ initials: u.initials, bg: u.avatarColor, name: u.name }))}
```

with:

```typescript
        avatars={assignees.map(u => ({ initials: u.initials, bg: u.avatarColor, name: u.name, photoUrl: u.photoUrl }))}
```

Replace line 185:

```tsx
              <SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />
```

with:

```tsx
              <SFAvatar initials={u.initials} bg={u.avatarColor} size={18} photoUrl={u.photoUrl} />
```

- [ ] **Step 6: Wire `photoUrl` through `WatchersRow.tsx`**

In `app/src/components/WatchersRow.tsx`, replace line 26:

```tsx
          <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} />
```

with:

```tsx
          <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} photoUrl={m.photoUrl} />
```

Replace line 47:

```tsx
                <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} />
```

with:

```tsx
                <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} photoUrl={m.photoUrl} />
```

(`m` here is a `TeamMemberInfo` from `getTeamMembers()`, which already has `photoUrl`.)

- [ ] **Step 7: Wire `photoUrl` through `ProjectCard.tsx`**

In `app/src/components/ProjectCard.tsx`, replace line 459:

```tsx
        <SFAvatarGroup avatars={p.members.map(m => ({ initials: m.initials, bg: m.avatarColor, name: m.name }))} size={22} />
```

with:

```tsx
        <SFAvatarGroup avatars={p.members.map(m => ({ initials: m.initials, bg: m.avatarColor, name: m.name, photoUrl: m.photoUrl }))} size={22} />
```

- [ ] **Step 8: Wire `photoUrl` through `ProjectMembres.tsx`**

In `app/src/screens/ProjectMembres.tsx`, replace each of the four team-member `SFAvatar` calls (lines 208, 239, 389, 549 — leave line 270's client-contact avatar untouched, it isn't a team member):

Line 208:
```tsx
                      <SFAvatar name={u.name} initials={u.initials} color={u.avatarColor} size={28} photoUrl={u.photoUrl} />
```

Line 239:
```tsx
                      <SFAvatar name={u.name} initials={u.initials} color={u.avatarColor} size={28} photoUrl={u.photoUrl} />
```

Line 389:
```tsx
          <SFAvatar name={user.name} initials={user.initials} color={user.avatarColor} size={38} photoUrl={user.photoUrl} />
```

Line 549:
```tsx
                <SFAvatar key={m.id} name={m.name} initials={m.initials} color={m.avatarColor} size={20} photoUrl={m.photoUrl} />
```

- [ ] **Step 9: Verify**

Run `npx tsc --noEmit -p tsconfig.app.json` from `app/` — must report no new errors (this confirms every one of `u`/`user`/`m`/`p.members` above is typed as `User`/`TeamMemberInfo`-compatible and accepts `photoUrl`). Start the dev server, set a profile photo for a real-session test user, then check: a task assigned to them shows the photo instead of initials; adding them as a watcher shows the photo; a project they're a member of shows the photo in its member stack; "Membres du projet" shows the photo. Confirm a user with no photo still shows initials as before (no regression).

- [ ] **Step 10: Commit**

```bash
git add app/src/components/ui/SFAvatar.tsx app/src/types/index.ts app/src/data/teamStore.ts app/src/components/ui/AssigneeGroup.tsx app/src/components/WatchersRow.tsx app/src/components/ProjectCard.tsx app/src/screens/ProjectMembres.tsx
git commit -m "feat: show profile photo instead of initials everywhere an avatar renders"
```
