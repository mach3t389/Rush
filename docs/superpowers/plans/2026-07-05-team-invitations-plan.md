# Team Invitations → Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fully-decorative "invite a team member" UI with a real Supabase-backed flow — a studio owner generates a copy-paste invite link, the invited person signs up through it and joins the inviting studio (not a new one), and the resulting real team is usable for project membership and task assignment.

**Architecture:** Two new tables (`studio_invitations` for the token lifecycle, `studio_members` for the real roster — same split `invitationStore.ts` already uses for client invitations vs. the client team). Two Postgres `security definer` RPC functions solve the "unauthenticated token lookup" and "atomic join-on-signup" problems that plain RLS can't. A new `teamStore.ts` follows the exact demo/real caching pattern established by `projectStore.ts`/`clientStore.ts`/`taskStore.ts`/`myTaskStore.ts`.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + Auth + RLS + RPC functions), react-router-dom v7 data router, i18next.

## Global Constraints

- Demo sessions (`isDemoSession()` true) are completely unaffected — every store function's demo branch must stay byte-for-byte equivalent to today's behavior.
- A real user belongs to exactly one studio, ever (`studio_members.user_id` is `unique`) — no multi-studio membership.
- No automatic email sending in this chantier — invitations are a copy-paste link only. Automatic email delivery is documented as future work, not built.
- No granular permission enforcement tied to `role` — it stays a display label, matching how `PERMISSION_PRESETS` already behaves today (UI-only, nothing server-side reads it).
- Every new/changed store function keeps the existing "stay-sync-via-cache" pattern: public getters stay synchronous, backed by an in-memory cache populated by a background fetch, refreshed via the existing pub-sub `notify()`/`subscribe()` mechanism.
- Every new real-session cache must be registered via `onLogout()` from `authStore.ts` from the moment it's created (a lesson from the Projects chantier, where this was missed and fixed later).

---

### Task 1: Supabase schema (manual)

**Files:**
- None in the repo — this is SQL the user runs by hand in the Supabase SQL editor, same as every prior chantier's schema task.

**Interfaces:**
- Produces: `studio_invitations` table, `studio_members` table, `get_studio_invitation(p_token text)` RPC, `accept_studio_invitation(p_token text)` RPC — all consumed by `teamStore.ts` (Task 3) and `studioStore.ts` (Task 2).

- [ ] **Step 1: Run this SQL in the Supabase SQL editor**

```sql
create table if not exists studio_invitations (
  token text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  email text not null,
  role text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now()
);
alter table studio_invitations enable row level security;

create policy "invitations_select_own" on studio_invitations for select
  using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "invitations_insert_own" on studio_invitations for insert
  with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "invitations_delete_own" on studio_invitations for delete
  using (studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, delete on studio_invitations to authenticated;

create table if not exists studio_members (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null,
  initials text not null,
  avatar_color text not null,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);
alter table studio_members enable row level security;

create policy "members_select_same_studio" on studio_members for select
  using (studio_id in (select studio_id from studio_members where user_id = auth.uid()));
create policy "members_delete_by_owner" on studio_members for delete
  using (studio_id in (select id from studios where owner_user_id = auth.uid()));
-- Owners may insert (or re-insert, for backfill) only their OWN membership
-- row, and only for a studio they own. Invited members never satisfy this
-- check — the only way a non-owner gets a row is accept_studio_invitation
-- below, which runs as security definer and bypasses RLS entirely.
create policy "members_insert_self_as_owner" on studio_members for insert
  with check (
    user_id = auth.uid()
    and studio_id in (select id from studios where owner_user_id = auth.uid())
  );
grant select, insert, delete on studio_members to authenticated;

create or replace function get_studio_invitation(p_token text)
returns table (email text, role text, studio_name text, status text)
language sql security definer as $$
  select si.email, si.role, s.name, si.status
  from studio_invitations si
  join studios s on s.id = si.studio_id
  where si.token = p_token;
$$;
grant execute on function get_studio_invitation(text) to anon, authenticated;

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

  insert into studio_members (studio_id, user_id, name, email, role, initials, avatar_color, is_owner)
  values (
    inv.studio_id,
    auth.uid(),
    coalesce(u.raw_user_meta_data->>'full_name', inv.email),
    inv.email,
    inv.role,
    upper(left(coalesce(u.raw_user_meta_data->>'full_name', inv.email), 2)),
    '#5c3d8f',
    false
  );

  update studio_invitations set status = 'accepted' where token = p_token;
end;
$$;
grant execute on function accept_studio_invitation(text) to authenticated;
```

- [ ] **Step 2: Confirm the tables and functions exist**

In the Supabase Table Editor, confirm `studio_invitations` and `studio_members` both appear. In SQL editor, run:

```sql
select proname from pg_proc where proname in ('get_studio_invitation', 'accept_studio_invitation');
```

Expected: both function names returned.

---

### Task 2: `studioStore.ts` — real-membership-aware `getStudioId()`

**Files:**
- Modify: `app/src/data/studioStore.ts` (entire file)

**Interfaces:**
- Consumes: `studio_members` table and its `members_insert_self_as_owner` policy from Task 1.
- Produces: `getStudioId(): Promise<string>` (signature unchanged — every existing caller in `projectStore.ts`/`clientStore.ts`/`taskStore.ts`/`myTaskStore.ts` keeps working with no changes), `resetStudioIdCache(): void` (unchanged).

**Why this needs to change:** today, `getStudioId()` only ever looks at `studios.owner_user_id`. An invited (non-owner) member would never match that column — every login would silently create them a brand-new, empty studio instead of resolving to the one they actually belong to. It also needs to backfill an owner membership row for studios created by the four earlier Phase 2 chantiers (Projects/Clients/Tasks/Mes tâches), which predate `studio_members` and have no row in it yet.

- [ ] **Step 1: Replace `app/src/data/studioStore.ts` in full**

```ts
// Resolves the current real (non-demo) user's studio row, creating it on first
// access. Demo sessions never call this — see isDemoSession() in authStore.ts.

import { supabase } from './supabaseClient';

let cachedStudioId: string | null = null;

interface SupabaseUserLike {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

async function insertOwnerMembership(studioId: string, user: SupabaseUserLike): Promise<void> {
  const fullName = (user.user_metadata?.full_name as string) || user.email || 'Moi';
  const parts = fullName.trim().split(' ').filter(Boolean);
  const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || '??';
  const { error } = await supabase.from('studio_members').upsert(
    {
      studio_id: studioId,
      user_id: user.id,
      name: fullName,
      email: user.email ?? '',
      role: 'Admin',
      initials,
      avatar_color: '#5c3d8f',
      is_owner: true,
    },
    { onConflict: 'user_id' }
  );
  if (error) console.error('insertOwnerMembership failed', error);
}

export async function getStudioId(): Promise<string> {
  if (cachedStudioId) return cachedStudioId;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('getStudioId called without an authenticated Supabase user');

  // 1. Already a recorded member (owner or invited). This is the only
  //    correct path for invited members, who never match owner_user_id.
  const { data: membership, error: memberError } = await supabase
    .from('studio_members')
    .select('studio_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) throw memberError;

  if (membership) {
    cachedStudioId = membership.studio_id;
    return membership.studio_id;
  }

  // 2. Legacy path: a studio already exists for this user as owner, created
  //    before studio_members existed. Backfill the missing owner row so they
  //    show up in their own team roster from now on.
  const { data: existing, error: selectError } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    await insertOwnerMembership(existing.id, user);
    cachedStudioId = existing.id;
    return existing.id;
  }

  // 3. Brand-new user: create the studio and its owner membership row together.
  const studioName = (user.user_metadata?.studio_name as string) || 'Mon studio';
  const { data: created, error: insertError } = await supabase
    .from('studios')
    .insert({ owner_user_id: user.id, name: studioName })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await insertOwnerMembership(created.id, user);
  cachedStudioId = created.id;
  return created.id;
}

export function resetStudioIdCache(): void {
  cachedStudioId = null;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors introduced by this file.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/studioStore.ts
git commit -m "feat: getStudioId resolves real membership, backfills owner row"
```

---

### Task 3: `teamStore.ts` (new)

**Files:**
- Create: `app/src/data/teamStore.ts`

**Interfaces:**
- Consumes: `getStudioId()` from `studioStore.ts` (Task 2), `isDemoSession()`/`onLogout()` from `authStore.ts`, `USERS` from `mock.ts`, `User` type from `../types`.
- Produces (consumed by Tasks 4–8):
  - `export interface TeamMemberInfo extends User { email: string; joinedAt: string }`
  - `getTeamMembers(): TeamMemberInfo[]`
  - `subscribeTeam(fn: () => void): () => void`
  - `isTeamOwner(userId: string): boolean`
  - `createInvitation(email: string, role: string): Promise<{ token: string; link: string }>`
  - `export interface TeamInvitationInfo { email: string; role: string; studioName: string; status: 'pending' | 'accepted' }`
  - `getInvitationByToken(token: string): Promise<TeamInvitationInfo | null>`
  - `acceptInvitation(token: string): Promise<void>`
  - `removeMember(userId: string): Promise<void>`
  - `resetTeamCache(): void`

- [ ] **Step 1: Create `app/src/data/teamStore.ts`**

```ts
// Reactive team-membership store.
//
// Demo sessions: unchanged behavior — the 5 hardcoded USERS, no real
// invitations (createInvitation still returns a usable token/link shape so
// MonEquipe.tsx's existing "Envoyé !" UX keeps working, but nothing is
// persisted anywhere).
//
// Real sessions: backed by studio_members/studio_invitations, scoped to the
// user's studio (see studioStore.ts). getTeamMembers() stays synchronous via
// an in-memory cache populated by a background fetch, same pattern as
// projectStore.ts/clientStore.ts.

import { USERS } from './mock';
import type { User } from '../types';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

export interface TeamMemberInfo extends User {
  email: string;
  joinedAt: string;
}

interface StudioMemberRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  avatar_color: string;
  is_owner: boolean;
  created_at: string;
}

function toMember(row: StudioMemberRow): TeamMemberInfo {
  return {
    id: row.user_id,
    name: row.name,
    initials: row.initials,
    avatarColor: row.avatar_color,
    role: row.role,
    email: row.email,
    joinedAt: row.created_at,
  };
}

let _members: TeamMemberInfo[] = [];
let _ownerId: string | null = null;
let _fetchStarted = false;
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }

async function fetchMembers(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studio_members')
    .select('user_id, name, email, role, initials, avatar_color, is_owner, created_at')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchMembers failed', error); return; }

  const rows = data as StudioMemberRow[];
  _members = rows.map(toMember);
  _ownerId = rows.find(r => r.is_owner)?.user_id ?? null;
  notify();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchMembers();
}

export function resetTeamCache(): void {
  _members = [];
  _ownerId = null;
  _fetchStarted = false;
}

onLogout(resetTeamCache);

export function getTeamMembers(): TeamMemberInfo[] {
  if (isDemoSession()) {
    return Object.values(USERS).map(u => ({ ...u, email: '', joinedAt: '' }));
  }
  ensureFetchStarted();
  return _members;
}

export function subscribeTeam(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function isTeamOwner(userId: string): boolean {
  if (isDemoSession()) return userId === USERS.lea.id;
  return userId === _ownerId;
}

function makeToken(): string {
  return `tinv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createInvitation(email: string, role: string): Promise<{ token: string; link: string }> {
  const token = makeToken();
  const link = `${window.location.origin}/invitation-equipe/${token}`;

  if (isDemoSession()) return { token, link };

  const studioId = await getStudioId();
  const { error } = await supabase.from('studio_invitations').insert({
    token,
    studio_id: studioId,
    email: email.trim().toLowerCase(),
    role: role.trim() || 'Membre',
  });
  if (error) throw error;
  return { token, link };
}

export interface TeamInvitationInfo {
  email: string;
  role: string;
  studioName: string;
  status: 'pending' | 'accepted';
}

export async function getInvitationByToken(token: string): Promise<TeamInvitationInfo | null> {
  const { data, error } = await supabase.rpc('get_studio_invitation', { p_token: token });
  if (error) { console.error('getInvitationByToken failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { email: row.email, role: row.role, studioName: row.studio_name, status: row.status };
}

export async function acceptInvitation(token: string): Promise<void> {
  const { error } = await supabase.rpc('accept_studio_invitation', { p_token: token });
  if (error) throw error;
  // The caller now belongs to a different studio than getStudioId()'s cache
  // (if any) would reflect — force every store to re-resolve it from scratch.
  resetTeamCache();
}

export async function removeMember(userId: string): Promise<void> {
  if (isDemoSession()) return;
  if (userId === _ownerId) {
    console.warn('removeMember: refusing to remove the studio owner');
    return;
  }
  const studioId = await getStudioId();
  const { error } = await supabase.from('studio_members').delete().eq('studio_id', studioId).eq('user_id', userId);
  if (error) { console.error('removeMember failed', error); return; }
  await fetchMembers();
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/teamStore.ts
git commit -m "feat: add teamStore.ts for real studio membership + invitations"
```

---

### Task 4: Team invitation accept page + route

**Files:**
- Create: `app/src/screens/TeamInvitationAccept.tsx`
- Modify: `app/src/main.tsx` (add import + route)
- Modify: `app/src/locales/fr.json` (add `teamInvitation` namespace)
- Modify: `app/src/locales/en.json` (add `teamInvitation` namespace)

**Interfaces:**
- Consumes: `getInvitationByToken`, `acceptInvitation` from `teamStore.ts` (Task 3); `register` from `authStore.ts` (existing, unchanged signature `register({ studioName, name, email, password }): Promise<{ ok: boolean; error?: string }>`).
- Produces: route `/invitation-equipe/:token`, standalone (no `AppShell`), reachable without an account.

**Critical ordering requirement:** `acceptInvitation(token)` must be awaited and must succeed *before* this component navigates into the app. If it fails, the user must NOT be navigated in — otherwise the very next store call (e.g. `getProjects()` on the Dashboard) calls `getStudioId()`, finds no membership row, and creates them a new empty studio instead of joining the inviting one.

- [ ] **Step 1: Create `app/src/screens/TeamInvitationAccept.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getInvitationByToken, acceptInvitation, type TeamInvitationInfo } from '../data/teamStore';
import { register } from '../data/authStore';

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

export function TeamInvitationAccept() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loadState, setLoadState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [invitation, setInvitation] = useState<TeamInvitationInfo | null>(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLoadState('invalid'); return; }
      const info = await getInvitationByToken(token);
      if (cancelled) return;
      if (!info || info.status !== 'pending') { setLoadState('invalid'); return; }
      setInvitation(info);
      setLoadState('ready');
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setSubmitting(true);
    setError('');

    const result = await register({
      studioName: invitation.studioName,
      name,
      email: invitation.email,
      password,
    });

    if (!result.ok) {
      setError(t(result.error!));
      setSubmitting(false);
      return;
    }

    try {
      await acceptInvitation(token);
    } catch {
      // Account was created but studio membership wasn't recorded — do NOT
      // navigate into the app, or the next store call would create them a
      // brand-new empty studio instead of joining this one.
      setError(t('teamInvitation.joinFailed'));
      setSubmitting(false);
      return;
    }

    navigate('/', { replace: true });
  };

  if (loadState === 'loading') return <Shell><p style={{ textAlign: 'center', color: 'var(--text-3)' }}>…</p></Shell>;

  if (loadState === 'invalid') {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px' }}>
            {t('teamInvitation.invalidTitle')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
            {t('teamInvitation.invalidDesc')}
          </p>
          <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
            {t('teamInvitation.backToLogin')}
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
        {t('teamInvitation.pendingTitle')}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
        {t('teamInvitation.pendingDesc', { studio: invitation!.studioName, role: invitation!.role })}
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.fullName')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('auth.fullNamePlaceholder')} autoComplete="name" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.email')}</label>
          <input value={invitation!.email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
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
            <SFIcon name="alert-circle" size={14} color="var(--danger)" />
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
          {submitting ? '…' : t('teamInvitation.joinButton')}
        </button>
      </form>
    </Shell>
  );
}
```

- [ ] **Step 2: Add the route in `app/src/main.tsx`**

Add the import near `InvitationAccept` (after line 16):

```ts
import { TeamInvitationAccept } from './screens/TeamInvitationAccept';
```

Add the route near the existing client-invitation route (after line 57, `{ path: '/invitation/:token', element: <InvitationAccept /> },`):

```ts
  // Invitation membre d'équipe — sans sidebar, accessible sans compte (route standalone)
  { path: '/invitation-equipe/:token', element: <TeamInvitationAccept /> },
```

- [ ] **Step 3: Add i18n keys to `app/src/locales/fr.json`**

Add this new top-level key, placed right after the existing `"invitation": { ... }` block (after line 2154's closing `},`):

```json
  "teamInvitation": {
    "invalidTitle": "Lien d'invitation invalide",
    "invalidDesc": "Ce lien n'existe pas, a expiré, ou a déjà été utilisé. Contactez la personne qui vous a invité(e) pour en obtenir un nouveau.",
    "pendingTitle": "Rejoindre l'équipe",
    "pendingDesc": "Vous êtes invité(e) à rejoindre {{studio}} en tant que {{role}}. Créez votre compte pour continuer.",
    "joinButton": "Rejoindre le studio",
    "joinFailed": "Votre compte a été créé, mais l'ajout à l'équipe a échoué. Contactez la personne qui vous a invité(e).",
    "backToLogin": "Retour à la connexion"
  },
```

- [ ] **Step 4: Add the same keys to `app/src/locales/en.json`**

Find the equivalent `"invitation": { ... }` block in `en.json` and add right after it:

```json
  "teamInvitation": {
    "invalidTitle": "Invalid invitation link",
    "invalidDesc": "This link doesn't exist, has expired, or was already used. Contact the person who invited you for a new one.",
    "pendingTitle": "Join the team",
    "pendingDesc": "You've been invited to join {{studio}} as {{role}}. Create your account to continue.",
    "joinButton": "Join the studio",
    "joinFailed": "Your account was created, but joining the team failed. Contact the person who invited you.",
    "backToLogin": "Back to login"
  },
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/TeamInvitationAccept.tsx app/src/main.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add team invitation accept page and route"
```

---

### Task 5: `MonEquipe.tsx` real wiring

**Files:**
- Modify: `app/src/screens/MonEquipe.tsx`

**Interfaces:**
- Consumes: `getTeamMembers`, `subscribeTeam`, `createInvitation` from `teamStore.ts` (Task 3); `isDemoSession` from `authStore.ts`; `getProjects` from `projectStore.ts` (for the real-session "active projects" count, replacing the mock `PROJECTS` import for that computation only).

- [ ] **Step 1: Add imports**

At the top of `app/src/screens/MonEquipe.tsx`, replace line 7 (`import { enterViewAs } from '../data/viewAsStore';`) with:

```ts
import { enterViewAs } from '../data/viewAsStore';
import { isDemoSession } from '../data/authStore';
import { getTeamMembers, subscribeTeam, createInvitation } from '../data/teamStore';
import { getProjects } from '../data/projectStore';
```

- [ ] **Step 2: Add a real-session team list alongside the existing demo `INTERNAL_TEAM`**

`INTERNAL_TEAM` (lines 45–53) stays exactly as-is for demo sessions. Add this new function right after it:

```ts
function getRealTeam(): TeamMember[] {
  const projects = getProjects();
  return getTeamMembers().map(m => ({
    id: m.id,
    name: m.name,
    initials: m.initials,
    avatarColor: m.avatarColor,
    role: m.role,
    email: m.email,
    since: m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '—',
    phone: '—',
    activeProjects: projects.filter(p => p.members.some(pm => pm.id === m.id)).length,
  }));
}
```

- [ ] **Step 3: Rewrite `InviteTeamModal` to generate and surface a real link**

Replace the entire `InviteTeamModal` function (lines 57–141) with:

```tsx
function InviteTeamModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [perms, setPerms] = useState<PermissionKey[]>(PERMISSION_PRESETS[2].perms);

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSending(true);
    savePermissions(email.trim(), perms);
    const result = await createInvitation(email.trim(), role.trim() || 'Membre');
    setLink(result.link);
    setSending(false);
    if (isDemoSession()) setTimeout(onClose, 1500);
  };

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{t('team.inviteMember')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>
        {link && isDemoSession() ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,200,100,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SFIcon name="check" size={24} color="var(--ok)" />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{t('team.invitationSent')}</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{email}</p>
          </div>
        ) : link ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('team.linkReadyHint')}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={link} style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-mono)' }} />
              <SFButton variant="primary" icon={copied ? 'check' : 'copy'} onClick={copyLink}>
                {copied ? t('team.linkCopied') : t('team.copyLink')}
              </SFButton>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SFButton variant="ghost" onClick={onClose}>{t('team.done')}</SFButton>
            </div>
          </div>
        ) : (
          <>
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
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>
                {t('team.permissions')}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {PERMISSION_PRESETS.map(p => {
                  const active = JSON.stringify([...perms].sort()) === JSON.stringify([...p.perms].sort());
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPerms(p.perms)}
                      style={{
                        padding: '8px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                        transition: 'all 0.1s',
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', margin: 0 }}>{t(p.labelKey)}</p>
                      <p style={{ fontSize: 9, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--ff-mono)', lineHeight: 1.4 }}>{t(p.descKey)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.5 }}>
              {isDemoSession() ? t('team.inviteHint') : t('team.inviteHintReal')}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="ghost" onClick={onClose}>{t('team.cancel')}</SFButton>
              <SFButton variant="primary" onClick={submit} disabled={!name.trim() || !email.trim() || sending}>
                {sending ? '…' : t('team.sendInvitation')}
              </SFButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `MonEquipe()` to the real list + team subscription**

Inside the exported `MonEquipe()` function, replace the `filtered` computation and add a subscription. Current code (lines 260–269):

```tsx
export function MonEquipe() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const filtered = INTERNAL_TEAM.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase())
  );
```

Replace with:

```tsx
export function MonEquipe() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);

  const team = isDemoSession() ? INTERNAL_TEAM : getRealTeam();
  const filtered = team.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase())
  );
```

Add `useEffect` to the React import at the top of the file (currently `import { useState } from 'react';` at line 1):

```ts
import { useState, useEffect } from 'react';
```

Also update the subtitle line (existing line 278, `{t('team.subtitle', { count: INTERNAL_TEAM.length })} · Studio StudioFlow`) to use the real count:

```tsx
{t('team.subtitle', { count: team.length })}
```

(Drop the trailing `· Studio StudioFlow` — that was always a hardcoded demo string; the studio's real name isn't threaded into this component and isn't needed for a correct fix.)

- [ ] **Step 5: Add new i18n keys**

Add to the existing `"team": { ... }` block in `app/src/locales/fr.json` (after `"permissions": "Autorisations"` on line 744, add a comma and these keys before the closing `}`):

```json
    "linkReadyHint": "Copiez ce lien et envoyez-le à la personne que vous invitez.",
    "copyLink": "Copier le lien",
    "linkCopied": "Copié !",
    "done": "Terminé",
    "inviteHintReal": "Copiez le lien généré et envoyez-le vous-même — l'envoi automatique par courriel arrivera plus tard."
```

Add the same keys (translated) to `app/src/locales/en.json`'s `"team"` block:

```json
    "linkReadyHint": "Copy this link and send it to the person you're inviting.",
    "copyLink": "Copy link",
    "linkCopied": "Copied!",
    "done": "Done",
    "inviteHintReal": "Copy the generated link and send it yourself — automatic email delivery is coming later."
```

- [ ] **Step 6: Typecheck and lint**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/MonEquipe.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: MonEquipe.tsx generates real invite links and shows real roster"
```

---

### Task 6: `ProjectMembres.tsx` — persistence fix + real member pool

**Files:**
- Modify: `app/src/screens/ProjectMembres.tsx`

**Interfaces:**
- Consumes: `updateProject` from `projectStore.ts` (existing, `updateProject(id: string, updates: Partial<Project>): void`); `getTeamMembers`, `subscribeTeam`, `isTeamOwner` from `teamStore.ts` (Task 3); `isDemoSession` from `authStore.ts`.

**Two independent problems fixed here because they touch the same lines:** (1) member changes on this page are never actually persisted anywhere today, for demo or real accounts — `projectMembersStore` is a throwaway in-memory object; (2) the "internal team" pool to add from is hardcoded to the 5 demo `USERS` even for real sessions.

- [ ] **Step 1: Update imports**

Replace line 6 (`import { getClientExternalTeam } from '../data/clientTeamStore';`) with:

```ts
import { getClientExternalTeam } from '../data/clientTeamStore';
import { updateProject } from '../data/projectStore';
import { isDemoSession } from '../data/authStore';
import { getTeamMembers, subscribeTeam, isTeamOwner } from '../data/teamStore';
```

- [ ] **Step 2: Remove the throwaway in-memory store**

Delete lines 11–20 entirely:

```ts
// ── Local state store (session-only, per project) ─────────────────────────────

const projectMembersStore: Record<string, User[]> = {};

function getMembers(projectId: string, defaultMembers: User[]): User[] {
  if (!projectMembersStore[projectId]) {
    projectMembersStore[projectId] = [...defaultMembers];
  }
  return projectMembersStore[projectId];
}
```

Real persistence now goes straight through `updateProject`, and the source of truth for current members is `project.members` (read fresh from the project object, not a shadow copy).

- [ ] **Step 3: Source `AddMemberModal`'s internal pool from the real team for real sessions**

In `AddMemberModal` (around line 66), replace:

```ts
  const internalPool = Object.values(USERS).filter(u =>
    !currentIds.has(u.id) && u.name.toLowerCase().includes(q)
  );
```

with:

```ts
  const internalTeam = isDemoSession() ? Object.values(USERS) : getTeamMembers();
  const internalPool = internalTeam.filter(u =>
    !currentIds.has(u.id) && u.name.toLowerCase().includes(q)
  );
```

- [ ] **Step 4: Rewire the main `ProjectMembres()` component to persist through `updateProject`**

Replace the state and handlers (current lines 333–386):

```tsx
  const project = PROJECTS.find(p => p.id === projectId);
  const [members, setMembers] = useState<User[]>(() =>
    getMembers(projectId, project?.members ?? [])
  );
  const [showAdd, setShowAdd] = useState(false);
```

with:

```tsx
  const project = PROJECTS.find(p => p.id === projectId);
  const [members, setMembers] = useState<User[]>(project?.members ?? []);
  const [showAdd, setShowAdd] = useState(false);
```

No `subscribeTeam` call is needed in this component: `AddMemberModal` is only mounted while `showAdd` is true (`{showAdd && <AddMemberModal ... />}` below), so it always calls `getTeamMembers()` fresh at the moment the user opens it — there's no persistent on-screen roster here that could go stale.

And replace `handleAdd`/`handleRemove`/`handleRemoveSelected` (current lines 368–386):

```tsx
  const handleAdd = (users: User[]) => {
    const updated = [...members, ...users];
    projectMembersStore[projectId] = updated;
    setMembers(updated);
  };

  const handleRemove = (userId: string) => {
    const updated = members.filter(m => m.id !== userId);
    projectMembersStore[projectId] = updated;
    setMembers(updated);
    setSelected(prev => { const next = new Set(prev); next.delete(userId); return next; });
  };

  const handleRemoveSelected = () => {
    const updated = members.filter(m => !selected.has(m.id));
    projectMembersStore[projectId] = updated;
    setMembers(updated);
    setSelected(new Set());
  };
```

with:

```tsx
  const persistMembers = (updated: User[]) => {
    setMembers(updated);
    updateProject(projectId, { members: updated });
  };

  const handleAdd = (users: User[]) => {
    persistMembers([...members, ...users]);
  };

  const handleRemove = (userId: string) => {
    persistMembers(members.filter(m => m.id !== userId));
    setSelected(prev => { const next = new Set(prev); next.delete(userId); return next; });
  };

  const handleRemoveSelected = () => {
    persistMembers(members.filter(m => !selected.has(m.id)));
    setSelected(new Set());
  };
```

- [ ] **Step 5: Replace the hardcoded owner check**

Current line 350: `const ownerUser = USERS.lea;` — this is used below to decide who can't be removed/deselected (`isOwner={m.id === ownerUser.id}`). Replace with:

```ts
  const isOwnerId = (id: string) => isDemoSession() ? id === USERS.lea.id : isTeamOwner(id);
```

Then update every `m.id === ownerUser.id` comparison in this file (there are two: the `selectableIds` filter and the `MemberCard isOwner=` props) to `isOwnerId(m.id)`. Specifically:

Line 361: `const selectableIds = members.filter(m => m.id !== ownerUser.id).map(m => m.id);` becomes:
```ts
  const selectableIds = members.filter(m => !isOwnerId(m.id)).map(m => m.id);
```

Line 450: `<MemberCard key={m.id} user={m} onRemove={() => handleRemove(m.id)} isOwner={m.id === ownerUser.id} selected={selected.has(m.id)} onToggleSelect={() => toggleSelect(m.id)} />` becomes:
```tsx
<MemberCard key={m.id} user={m} onRemove={() => handleRemove(m.id)} isOwner={isOwnerId(m.id)} selected={selected.has(m.id)} onToggleSelect={() => toggleSelect(m.id)} />
```

(The client-contacts `MemberCard` at line 464 already hardcodes `isOwner={false}` — leave it unchanged, a client contact is never the studio owner.)

- [ ] **Step 6: Typecheck and lint**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: no new errors. If TypeScript flags the removed `Record<string, User[]>` import as now-unused anywhere, remove that import too.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/ProjectMembres.tsx
git commit -m "fix: ProjectMembres persists real project members, sources real team"
```

---

### Task 7: `Travail.tsx` — real `getTeam()`

**Files:**
- Modify: `app/src/screens/Travail.tsx`

**Interfaces:**
- Consumes: `getTeamMembers`, `subscribeTeam` from `teamStore.ts` (Task 3).

- [ ] **Step 1: Update imports**

Add near the existing `isDemoSession, getCurrentUser` import (line 17):

```ts
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getTeamMembers, subscribeTeam } from '../data/teamStore';
```

- [ ] **Step 2: Replace `getTeam()`'s real-session branch**

Current code (lines 366–381):

```ts
// Demo sessions can assign to any of the 5 mock people. Real sessions have
// no team/multi-member system yet (Phase 2 established one real user per
// studio) — the only assignable person is the current user themselves, which
// is forward-compatible with real team invites shipping later.
function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS);
  const authUser = getCurrentUser();
  // getCurrentUser() can briefly return null right after login, before the
  // Supabase auth-state-change listener populates its cache (same one-frame
  // window already accepted in GlobalTopBar.tsx). Fall back to the same
  // FALLBACK_USER-style demo user rather than an empty array, so callers
  // that assume getTeam()[0] is always defined (e.g. the "add task" row's
  // default assignee) never see undefined.
  if (!authUser) return [USERS.lea];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
}
```

Replace with:

```ts
// Demo sessions can assign to any of the 5 mock people. Real sessions read
// the studio's real team roster (teamStore.ts) — invited members, not just
// the current user.
function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS);
  const team = getTeamMembers();
  if (team.length > 0) return team;
  // teamStore's fetch hasn't resolved yet (or getCurrentUser() briefly
  // returns null right after login, same one-frame window already accepted
  // in GlobalTopBar.tsx) — fall back to a placeholder so callers that assume
  // getTeam()[0] is always defined (e.g. the "add task" row's default
  // assignee) never see undefined.
  const authUser = getCurrentUser();
  if (!authUser) return [USERS.lea];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
}
```

- [ ] **Step 3: Force `AddTaskRow` to re-render once the roster fetch resolves**

`AddTaskRow` (starting at line 702) seeds its default assignee from `getTeam()[0]` at mount, before the background fetch in `teamStore.ts` has necessarily resolved. Add a subscription so it re-syncs once real data arrives, without disturbing whatever the user may have already typed. In `AddTaskRow`, right after the existing state declarations (after line 716, `const [addDropRect, setAddDropRect] = useState<DOMRect | null>(null);`), add:

```tsx
  useEffect(() => subscribeTeam(() => {
    setAssignee(prev => (prev.id === USERS.lea.id || prev.id === getCurrentUser()?.id ? getTeam()[0] : prev));
  }), []);
```

This only overwrites the assignee if it's still sitting on the placeholder/self default — if the person has already picked someone else from the dropdown, their choice is left alone.

Other `getTeam()` call sites in this file (the assignee-dropdown `.map()` calls at lines 574 and 804) read the array fresh on every render and don't need their own subscription — they naturally reflect the roster the next time their enclosing dropdown re-renders for any reason, and a dropdown that isn't open yet at mount time has no stale content to show.

- [ ] **Step 4: Typecheck and lint**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "feat: Travail.tsx getTeam() reads the real studio roster"
```

---

### Task 8: `Taches.tsx` — real `TEAM`

**Files:**
- Modify: `app/src/screens/Taches.tsx`

**Interfaces:**
- Consumes: `getTeamMembers`, `subscribeTeam` from `teamStore.ts` (Task 3).

**Gap being fixed:** unlike `Travail.tsx`, the earlier Mes tâches chantier only fixed `addTask`'s *default* assignee (`getCurrentUser()`-based) — the assignee-picker *dropdown list* itself, module-level `const TEAM = Object.values(USERS);`, was never updated. A real user opening any assignee dropdown in Mes tâches still sees the 5 demo people today.

- [ ] **Step 1: Update imports**

Add near the existing `isDemoSession, getCurrentUser` import (line 9):

```ts
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getTeamMembers, subscribeTeam } from '../data/teamStore';
```

- [ ] **Step 2: Replace the module-level `TEAM` constant with a function**

Current line 111: `const TEAM = Object.values(USERS);`

Replace with:

```ts
function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS);
  const team = getTeamMembers();
  if (team.length > 0) return team;
  const authUser = getCurrentUser();
  if (!authUser) return [USERS.lea];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
}
```

(`User` must already be imported in this file for the return type — confirm the existing type import list includes `User`; it does, per the Mes tâches chantier's Task 4 which already added it.)

- [ ] **Step 3: Replace every `TEAM` usage with `getTeam()`**

Five call sites, all direct renames (no logic change):

Line 279: `const [assignee, setAssignee] = useState<typeof TEAM[0] | null>(task.assignee ?? null);` →
```ts
const [assignee, setAssignee] = useState<User | null>(task.assignee ?? null);
```

Line 575: `{TEAM.map(u => ddItem(...` →
```tsx
{getTeam().map(u => ddItem(...
```

Line 816: `type AddOpts = { priority: Priority; assignee: typeof TEAM[0] | null; ... };` →
```ts
type AddOpts = { priority: Priority; assignee: User | null; project: typeof PROJECTS[0] | null; status: string; statusLabel: string; dueDate: string };
```

Line 856: `const [assignee, setAssignee] = useState<typeof TEAM[0] | null>(TEAM[0]);` →
```ts
const [assignee, setAssignee] = useState<User | null>(getTeam()[0]);
```

Line 872: `setTitle(''); setAssignee(TEAM[0]); setProject(null); ...` →
```ts
setTitle(''); setAssignee(getTeam()[0]); setProject(null); setPriority(defaultPriority);
```

Line 970: `{TEAM.map(u => ddItem(...` →
```tsx
{getTeam().map(u => ddItem(...
```

- [ ] **Step 4: Add a re-render subscription where the default assignee is seeded at mount**

Find the component containing the `useState<typeof TEAM[0] | null>(TEAM[0])` from line 856 (the "add task" row for Mes tâches) and add, alongside its other state declarations:

```tsx
  useEffect(() => subscribeTeam(() => {
    setAssignee(prev => (!prev || prev.id === USERS.lea.id || prev.id === getCurrentUser()?.id ? getTeam()[0] : prev));
  }), []);
```

Confirm `useEffect` is already imported from `'react'` in this file (it is, used elsewhere in `Taches.tsx`).

- [ ] **Step 5: Typecheck and lint**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Taches.tsx
git commit -m "fix: Taches.tsx assignee picker reads the real studio roster"
```

---

### Task 9: End-to-end manual verification

**Files:**
- None (manual browser verification, using `mcp__Claude_Preview__*` tools per this project's conventions — no automated test suite exists).

**Interfaces:**
- Consumes: everything from Tasks 1–8.

- [ ] **Step 1: Confirm demo accounts are untouched**

Log in as `lea.marchand@studioflow.fr` (any password). Open Paramètres → Mon équipe: confirm the 5 demo people still show, "Inviter un membre" still shows the "Envoyé !" confirmation (no link, no crash). Open any project's Membres page: confirm add/remove still works and now **persists across a reload** (this was broken before this chantier for demo accounts too).

- [ ] **Step 2: Real signup → invite flow**

Register a new real account (e.g. `owner-test@example.com`). Navigate to Paramètres → Mon équipe, confirm you (the owner) appear in your own team list (this exercises the `insertOwnerMembership` backfill/creation path from Task 2). Click "Inviter un membre", fill name/email/role, submit, confirm a real link is generated and "Copier le lien" works (check the clipboard or the input value directly).

- [ ] **Step 3: Accept flow in a fresh session**

Open the generated link in a private/incognito browser window (or log out first). Confirm the invitation details render (studio name, role). Complete the signup form. Confirm you land on the Dashboard (`/`), not the login/onboarding screen, and — critically — that you're inside the **inviting** studio: check Paramètres → Mon équipe shows both the owner and yourself, not just yourself alone in an empty new studio. This is the core race-condition check from the design spec.

- [ ] **Step 4: Assignment**

As the owner, go to a project's Membres page, add the new member via "Ajouter à l'équipe" (confirm they appear in the internal pool, not just client contacts), save, reload the page, confirm the membership persisted. Open that project's task board, confirm the new member now appears in the assignee dropdown, assign them a task, reload, confirm the assignment persisted.

- [ ] **Step 5: Mes tâches roster fix**

Still as the owner, open Mes tâches ("Ajouter une tâche" row), open the assignee dropdown, confirm it shows the real team (owner + new member), not the 5 demo people.

- [ ] **Step 6: Error paths**

Re-open the already-accepted invite link — confirm the "invalid/expired" state renders, no crash, no duplicate account prompt. Try removing the owner from Mon équipe or from a project's Membres page (if a remove control is reachable for the owner) — confirm it's refused/hidden, not silently successful.

- [ ] **Step 7: Typecheck, lint, and final full-branch check**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npm run build`
Expected: all three succeed with no new errors introduced by this chantier (pre-existing baseline errors from before this branch, if any, are unaffected).
