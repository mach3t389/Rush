# Studio Branding + Client Contacts + Notification Preferences Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate three localStorage-only stores (`studioLogoStore.ts`, the combined `clientContactsStore.ts`/`clientTeamStore.ts` pair, `notifPrefsStore.ts`) to Supabase, fixing two pre-existing bugs along the way (studio logos not scoped per studio; portal permissions duplicated between a contact field and a disconnected localStorage key).

**Architecture:** Same dual demo/real-session pattern proven across every prior Phase 2 chantier — demo sessions keep exact current `localStorage` behavior; real sessions read/write Supabase, with an in-memory cache for the list-shaped store (`client_contacts`) and direct row reads for the two single-row stores (studio logo columns, notif prefs).

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + `supabase-js`), existing `authStore.ts`/`studioStore.ts` session/studio resolution helpers.

## Global Constraints

- Demo-session behavior for all 3 stores must stay byte-for-byte identical to today.
- Every existing exported function signature is preserved, with two explicit, intentional exceptions (not accidental breakage): `ClientContact.portalPermissions` becomes a required field (no longer optional), and `loadPortalPermissions`/`savePortalPermissions` are removed entirely (folded into the contact object itself).
- `CLIENT_CONTACTS`, `DEFAULT_CLIENT_CONTACTS`, and `NOTIF_EVENTS` hardcoded demo/seed data must not be modified.
- Every new/altered table's SQL must include the `GRANT ... TO authenticated` statement in the same Task 1 step — this has been missed twice before in this project (see the `supabase-rls-needs-grant` lesson) and must not be missed a third time.
- RLS for `client_contacts` and the two new `studios` columns reuses the existing `my_studio_ids()` helper.
- RLS for `notif_prefs` uses `user_id = auth.uid()` directly — a new per-user (not per-studio) pattern, the first of its kind in this project.
- Baseline to compare against at the end: 185 typecheck errors, 339 lint problems (309 errors, 30 warnings).

---

### Task 1: Supabase schema (manual, user runs it)

**Files:** None — manual SQL step run by the user in the Supabase Dashboard's SQL Editor.

**Interfaces:**
- Produces: two new columns on `studios` (`logo_full`, `logo_square`), the `client_contacts` table, the `notif_prefs` table — all consumed by Tasks 2-4.

- [ ] **Step 1: Run this SQL in the Supabase Dashboard → SQL Editor → New query**

```sql
alter table studios add column logo_full text, add column logo_square text;

create table client_contacts (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  studio_id uuid not null references studios(id),
  name text not null,
  role text not null,
  email text not null,
  status text not null default 'active',
  initials text not null,
  color text not null,
  internal boolean not null default false,
  studio_member_id uuid references studio_members(id) on delete set null,
  portal_permissions jsonb not null default '{"approve":false,"comment":true,"download":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table client_contacts enable row level security;

create policy "studio members can manage their client contacts"
  on client_contacts for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on client_contacts to authenticated;

create table notif_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table notif_prefs enable row level security;

create policy "users manage their own notification preferences"
  on notif_prefs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on notif_prefs to authenticated;
```

Expected: "Success. No rows returned."

- [ ] **Step 2: Verify in the Table Editor**

Confirm `studios` now has `logo_full`/`logo_square` columns, and that `client_contacts` and `notif_prefs` both appear as new tables.

---

### Task 2: `studioLogoStore.ts` full rewrite

**Files:**
- Modify: `app/src/data/studioLogoStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `isDemoSession` from `./authStore`; `getStudioId` from `./studioStore`; `supabase` from `./supabaseClient`.
- Produces: same 5 exports as today, unchanged signatures: `getLogoFull(): string | null`, `getLogoSquare(): string | null`, `setLogoFull(dataUrl: string | null): void`, `setLogoSquare(dataUrl: string | null): void`, `subscribeStudioLogos(fn: () => void): () => void`.

- [ ] **Step 1: Replace the full contents of `app/src/data/studioLogoStore.ts` with:**

```ts
import { isDemoSession } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const KEY_FULL = 'sf_studio_logo_full';
const KEY_SQUARE = 'sf_studio_logo_square';

type Listener = () => void;
const listeners: Listener[] = [];

function notify() {
  listeners.forEach(l => l());
}

export function subscribeStudioLogos(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

// ── Real-session in-memory cache ────────────────────────────────────────────
let _logoFull: string | null = null;
let _logoSquare: string | null = null;
let _fetchStarted = false;

async function fetchSupabaseLogos(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studios')
    .select('logo_full, logo_square')
    .eq('id', studioId)
    .single();

  if (error) { console.error('fetchSupabaseLogos failed', error); return; }

  _logoFull = data.logo_full;
  _logoSquare = data.logo_square;
  notify();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabaseLogos();
}

async function setSupabaseLogo(column: 'logo_full' | 'logo_square', dataUrl: string | null): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('studios').update({ [column]: dataUrl }).eq('id', studioId);
  if (error) console.error('setSupabaseLogo failed', error);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getLogoFull(): string | null {
  if (isDemoSession()) {
    try { return localStorage.getItem(KEY_FULL); } catch { return null; }
  }
  ensureFetchStarted();
  return _logoFull;
}

export function getLogoSquare(): string | null {
  if (isDemoSession()) {
    try { return localStorage.getItem(KEY_SQUARE); } catch { return null; }
  }
  ensureFetchStarted();
  return _logoSquare;
}

export function setLogoFull(dataUrl: string | null) {
  if (isDemoSession()) {
    try {
      if (dataUrl) localStorage.setItem(KEY_FULL, dataUrl);
      else localStorage.removeItem(KEY_FULL);
      notify();
    } catch { /* noop */ }
    return;
  }
  _logoFull = dataUrl;
  notify();
  void setSupabaseLogo('logo_full', dataUrl);
}

export function setLogoSquare(dataUrl: string | null) {
  if (isDemoSession()) {
    try {
      if (dataUrl) localStorage.setItem(KEY_SQUARE, dataUrl);
      else localStorage.removeItem(KEY_SQUARE);
      notify();
    } catch { /* noop */ }
    return;
  }
  _logoSquare = dataUrl;
  notify();
  void setSupabaseLogo('logo_square', dataUrl);
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "^src/"`
Expected: 185 (baseline — this task must not introduce new errors; `Parametres.tsx`/`Sidebar.tsx` need zero changes since signatures are unchanged)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/studioLogoStore.ts
git commit -m "feat: studioLogoStore.ts real per-studio Supabase persistence"
```

---

### Task 3: `clientContactsStore.ts` + `clientTeamStore.ts` combined rewrite, `FicheClient.tsx` call-site updates

**Files:**
- Modify: `app/src/data/clientContactsStore.ts` (remove `loadPortalPermissions`/`savePortalPermissions`, keep everything else unchanged)
- Modify: `app/src/data/clientTeamStore.ts` (full rewrite)
- Modify: `app/src/screens/FicheClient.tsx` (4 call sites + 1 import line)

**Interfaces:**
- Consumes: `isDemoSession, onLogout` from `./authStore`; `getStudioId` from `./studioStore`; `supabase` from `./supabaseClient`; `loadPersisted, savePersisted` from `./persist`; `getClientContacts, DEFAULT_PORTAL_PERMISSIONS, type ClientContact` from `./clientContactsStore`.
- Produces: `clientTeamStore.ts` exports unchanged: `getClientTeam(clientId: string): ClientContact[]`, `setClientTeam(clientId: string, team: ClientContact[]): void`, `addClientTeamMember(clientId: string, member: ClientContact): void`, `removeClientTeamMember(clientId: string, memberId: string): void`, `getClientExternalTeam(clientId: string): ClientContact[]`. `ClientContact.portalPermissions` is now required (not optional).

- [ ] **Step 1: Update `ClientContact` interface and remove the portal-permissions functions in `app/src/data/clientContactsStore.ts`**

Find:
```ts
export function loadPortalPermissions(contactId: string): PortalPermissions {
  try {
    const raw = localStorage.getItem(`sf_portal_perms_${contactId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { ...DEFAULT_PORTAL_PERMISSIONS };
}

export function savePortalPermissions(contactId: string, perms: PortalPermissions) {
  try { localStorage.setItem(`sf_portal_perms_${contactId}`, JSON.stringify(perms)); } catch { /* noop */ }
}

export interface ClientContact {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'active' | 'invited' | 'pending';
  initials: string;
  color: string;
  internal?: boolean;
  userId?: string; // links to USERS key if internal studio member
  portalPermissions?: PortalPermissions;
}
```

Replace with:
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
}
```

(The `loadPortalPermissions`/`savePortalPermissions` functions are deleted entirely — permissions now live directly on each `ClientContact`. `userId` stays for demo-session hardcoded links; real sessions use the new `studio_member_id` field added in Task 3 Step 2 below.)

- [ ] **Step 2: Replace the full contents of `app/src/data/clientTeamStore.ts` with:**

```ts
// Session store for the active team of each client.
// Demo sessions: initialized from CLIENT_CONTACTS on first access, stored in localStorage.
// Real sessions: backed by the `client_contacts` Supabase table.
// Both FicheClient (Équipe tab) and ProjectMembres (add-member modal) use this
// so that only people actually in the client team can be added to projects.

import { getClientContacts, DEFAULT_PORTAL_PERMISSIONS, type ClientContact } from './clientContactsStore';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'sf_client_teams';

// ── Demo-session working set ─────────────────────────────────────────────────
const demoStore: Record<string, ClientContact[]> = loadPersisted(STORAGE_KEY, {});
function persistDemo() { savePersisted(STORAGE_KEY, demoStore); }

function seedFromContacts(clientId: string): ClientContact[] {
  return getClientContacts(clientId).map(c => ({ ...c, portalPermissions: c.portalPermissions ?? { ...DEFAULT_PORTAL_PERMISSIONS } }));
}

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseContacts: Record<string, ClientContact[]> = {};
let _supabaseFetchStarted: Record<string, boolean> = {};

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }

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
}

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
  };
}

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
  };
}

async function fetchSupabaseContacts(clientId: string): Promise<void> {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId);

  if (error) { console.error('fetchSupabaseContacts failed', error); return; }

  _supabaseContacts[clientId] = (data as ClientContactRow[]).map(toContact);
  notify();
}

function ensureFetchStarted(clientId: string): void {
  if (_supabaseFetchStarted[clientId]) return;
  _supabaseFetchStarted[clientId] = true;
  void fetchSupabaseContacts(clientId);
}

export function resetClientTeamCache(): void {
  _supabaseContacts = {};
  _supabaseFetchStarted = {};
}

onLogout(resetClientTeamCache);

async function upsertSupabaseContact(clientId: string, contact: ClientContact): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('client_contacts').upsert(toRow(contact, clientId, studioId));
  if (error) { console.error('upsertSupabaseContact failed', error); return; }
  await fetchSupabaseContacts(clientId);
}

async function removeSupabaseContact(clientId: string, contactId: string): Promise<void> {
  const { error } = await supabase.from('client_contacts').delete().eq('id', contactId);
  if (error) { console.error('removeSupabaseContact failed', error); return; }
  await fetchSupabaseContacts(clientId);
}

async function replaceSupabaseTeam(clientId: string, team: ClientContact[]): Promise<void> {
  const studioId = await getStudioId();
  const existingIds = (_supabaseContacts[clientId] ?? []).map(c => c.id);
  const nextIds = team.map(c => c.id);
  const removedIds = existingIds.filter(id => !nextIds.includes(id));

  if (removedIds.length > 0) {
    const { error: delError } = await supabase.from('client_contacts').delete().in('id', removedIds);
    if (delError) { console.error('replaceSupabaseTeam delete failed', delError); return; }
  }

  const { error: upsertError } = await supabase.from('client_contacts').upsert(team.map(c => toRow(c, clientId, studioId)));
  if (upsertError) { console.error('replaceSupabaseTeam upsert failed', upsertError); return; }

  await fetchSupabaseContacts(clientId);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getClientTeam(clientId: string): ClientContact[] {
  if (isDemoSession()) {
    if (!demoStore[clientId]) {
      demoStore[clientId] = seedFromContacts(clientId);
      persistDemo();
    }
    return demoStore[clientId];
  }
  ensureFetchStarted(clientId);
  return _supabaseContacts[clientId] ?? [];
}

export function setClientTeam(clientId: string, team: ClientContact[]): void {
  if (isDemoSession()) {
    demoStore[clientId] = team;
    persistDemo();
    return;
  }
  _supabaseContacts[clientId] = team;
  notify();
  void replaceSupabaseTeam(clientId, team);
}

export function addClientTeamMember(clientId: string, member: ClientContact): void {
  const team = getClientTeam(clientId);
  if (team.find(m => m.id === member.id)) return;

  if (isDemoSession()) {
    demoStore[clientId] = [...team, member];
    persistDemo();
    return;
  }
  _supabaseContacts[clientId] = [...team, member];
  notify();
  void upsertSupabaseContact(clientId, member);
}

export function removeClientTeamMember(clientId: string, memberId: string): void {
  if (isDemoSession()) {
    demoStore[clientId] = getClientTeam(clientId).filter(m => m.id !== memberId);
    persistDemo();
    return;
  }
  _supabaseContacts[clientId] = getClientTeam(clientId).filter(m => m.id !== memberId);
  notify();
  void removeSupabaseContact(clientId, memberId);
}

// Only external contacts (not internal studio members) — these are the people
// eligible to be added as "Contacts client" in a project team.
export function getClientExternalTeam(clientId: string): ClientContact[] {
  return getClientTeam(clientId).filter(c => !c.internal);
}
```

- [ ] **Step 3: Update `FicheClient.tsx`'s import line**

Find:
```ts
import { getClientContacts, type ClientContact as ClientMember, PORTAL_PRESETS, matchPortalPreset, loadPortalPermissions, savePortalPermissions, DEFAULT_PORTAL_PERMISSIONS, type PortalPermissions } from '../data/clientContactsStore';
```

Replace with:
```ts
import { getClientContacts, type ClientContact as ClientMember, PORTAL_PRESETS, matchPortalPreset, DEFAULT_PORTAL_PERMISSIONS, type PortalPermissions } from '../data/clientContactsStore';
```

- [ ] **Step 4: Update the `InviteModal`'s `submit` function (drop the now-redundant `savePortalPermissions` call)**

Find:
```ts
    const generatedLink = onInvite({ id, name: name.trim(), role: role.trim() || t('client.defaultClientContactRole'), email: email.trim(), status: 'invited', initials, color: '#3b4f8f', portalPermissions: portalPerms });
    savePortalPermissions(id, portalPerms);
    setLink(generatedLink);
```

Replace with:
```ts
    const generatedLink = onInvite({ id, name: name.trim(), role: role.trim() || t('client.defaultClientContactRole'), email: email.trim(), status: 'invited', initials, color: '#3b4f8f', portalPermissions: portalPerms });
    setLink(generatedLink);
```

(`onInvite` already calls `addClientTeamMember(clientId, m)` with the full contact object — including `portalPermissions` — so the separate `savePortalPermissions` call was writing to a location nothing reads from anymore.)

- [ ] **Step 5: Update `MemberEditPanel`'s portal-permissions state initializer**

Find:
```ts
    // Portal permissions (external contacts only)
    const [portalPerms, setPortalPerms] = useState<PortalPermissions>(() => loadPortalPermissions(m.id));
```

Replace with:
```ts
    // Portal permissions (external contacts only)
    const [portalPerms, setPortalPerms] = useState<PortalPermissions>(() => m.portalPermissions);
```

- [ ] **Step 6: Update `handleViewAsPortal`'s `enterViewAs` call**

Find:
```ts
        enterViewAs({
          type: 'external',
          id: m.id,
          name: m.name,
          initials: m.initials,
          avatarColor: m.color,
          role: m.role,
          portalPermissions: loadPortalPermissions(m.id),
          clientId,
        });
        onClose();
        navigate(`/portail/${clientProjects[0].id}`);
```

Replace with:
```ts
        enterViewAs({
          type: 'external',
          id: m.id,
          name: m.name,
          initials: m.initials,
          avatarColor: m.color,
          role: m.role,
          portalPermissions: m.portalPermissions,
          clientId,
        });
        onClose();
        navigate(`/portail/${clientProjects[0].id}`);
```

- [ ] **Step 7: Update `MemberEditPanel`'s `save` function**

Find:
```ts
    const save = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ name, email, role }));
        if (m.internal) localStorage.setItem(permKey, JSON.stringify(perms));
        else savePortalPermissions(m.id, portalPerms);
      } catch { /* noop */ }
      setClientTeam(clientId, getClientTeam(clientId).map(x => x.id === m.id ? { ...x, name, email, role } : x));
      setMembers(getClientTeam(clientId));
      onClose();
    };
```

Replace with:
```ts
    const save = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ name, email, role }));
        if (m.internal) localStorage.setItem(permKey, JSON.stringify(perms));
      } catch { /* noop */ }
      setClientTeam(clientId, getClientTeam(clientId).map(x => x.id === m.id ? { ...x, name, email, role, portalPermissions: m.internal ? x.portalPermissions : portalPerms } : x));
      setMembers(getClientTeam(clientId));
      onClose();
    };
```

- [ ] **Step 8: Update the project-picker modal's `enterViewAs` call**

Find:
```ts
                        enterViewAs({
                          type: 'external',
                          id: m.id,
                          name: m.name,
                          initials: m.initials,
                          avatarColor: m.color,
                          role: m.role,
                          portalPermissions: loadPortalPermissions(m.id),
                          clientId,
                        });
                        setShowProjectPicker(false);
                        onClose();
                        navigate(`/portail/${p.id}`);
```

Replace with:
```ts
                        enterViewAs({
                          type: 'external',
                          id: m.id,
                          name: m.name,
                          initials: m.initials,
                          avatarColor: m.color,
                          role: m.role,
                          portalPermissions: m.portalPermissions,
                          clientId,
                        });
                        setShowProjectPicker(false);
                        onClose();
                        navigate(`/portail/${p.id}`);
```

- [ ] **Step 9: Run typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "^src/"`
Expected: 185 (baseline — `ProjectMembres.tsx`, `InvitationAccept.tsx`, and `viewAsStore.ts` only read `getClientContacts`/`getExternalContacts`/`getClientTeam`-family functions with unchanged signatures, so they need no edits; confirm by grep if the count differs from 185)

- [ ] **Step 10: Commit**

```bash
git add app/src/data/clientContactsStore.ts app/src/data/clientTeamStore.ts app/src/screens/FicheClient.tsx
git commit -m "feat: client_contacts real Supabase persistence, fold duplicated portal permissions into one field"
```

---

### Task 4: `notifPrefsStore.ts` full rewrite

**Files:**
- Modify: `app/src/data/notifPrefsStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `isDemoSession` from `./authStore`; `supabase` from `./supabaseClient`.
- Produces: same 2 exports as today, unchanged signatures: `loadNotifPrefs(): NotifPrefs`, `saveNotifPrefs(prefs: NotifPrefs): void`. `ChannelPrefs`, `NotifPrefs`, `NOTIF_EVENTS` stay unchanged.

- [ ] **Step 1: Replace the full contents of `app/src/data/notifPrefsStore.ts` with:**

```ts
// Préférences de notification (par type d'événement × canal).
//
// Demo sessions: unchanged localStorage behavior, exactly as before this migration.
// Real sessions: backed by the `notif_prefs` table, scoped by the authenticated
// user's own id (auth.uid()) — the first table in this project scoped per-user
// rather than per-studio, since notification preferences are inherently personal.

import { isDemoSession } from './authStore';
import { supabase } from './supabaseClient';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_notif_prefs';

export interface ChannelPrefs { inapp: boolean; email: boolean }
export type NotifPrefs = Record<string, ChannelPrefs>;

export const NOTIF_EVENTS: { key: string; label: string; desc: string; icon: string }[] = [
  { key: 'comment',  label: 'Commentaires',            desc: "Quand quelqu'un commente une ressource ou une tâche", icon: 'message-square' },
  { key: 'mention',  label: 'Mentions',                desc: 'Quand on vous mentionne directement',                 icon: 'at-sign' },
  { key: 'approval', label: "Demandes d'approbation",  desc: "Quand une approbation vous est demandée",              icon: 'shield-check' },
  { key: 'version',  label: 'Nouvelles versions',      desc: "Quand une nouvelle version d'une ressource est ajoutée", icon: 'git-branch' },
  { key: 'status',   label: 'Changements de statut',   desc: "Quand le statut d'une tâche ou ressource change",      icon: 'refresh-cw' },
  { key: 'deadline', label: 'Échéances',               desc: 'Rappels avant les dates de livraison',                 icon: 'calendar-clock' },
];

// Défauts : tout en in-app ; email seulement pour mentions + approbations.
const DEFAULTS: NotifPrefs = Object.fromEntries(
  NOTIF_EVENTS.map(e => [e.key, { inapp: true, email: e.key === 'mention' || e.key === 'approval' }])
);

// ── Real-session in-memory cache ────────────────────────────────────────────
let _prefs: NotifPrefs | null = null;
let _fetchStarted = false;

async function fetchSupabasePrefs(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('notif_prefs')
    .select('prefs')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('fetchSupabasePrefs failed', error); return; }

  _prefs = { ...DEFAULTS, ...((data?.prefs as NotifPrefs) ?? {}) };
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabasePrefs();
}

async function saveSupabasePrefs(prefs: NotifPrefs): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('notif_prefs').upsert({ user_id: user.id, prefs, updated_at: new Date().toISOString() });
  if (error) console.error('saveSupabasePrefs failed', error);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function loadNotifPrefs(): NotifPrefs {
  if (isDemoSession()) {
    const saved = loadPersisted<NotifPrefs | null>(STORAGE_KEY, null);
    return { ...DEFAULTS, ...(saved ?? {}) };
  }
  ensureFetchStarted();
  return _prefs ?? DEFAULTS;
}

export function saveNotifPrefs(prefs: NotifPrefs): void {
  if (isDemoSession()) {
    savePersisted(STORAGE_KEY, prefs);
    return;
  }
  _prefs = { ...DEFAULTS, ...prefs };
  void saveSupabasePrefs(prefs);
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "^src/"`
Expected: 185 (baseline — `Parametres.tsx` needs no changes since signatures are unchanged)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/notifPrefsStore.ts
git commit -m "feat: notifPrefsStore.ts real per-user Supabase persistence"
```

---

### Task 5: End-to-end manual verification

**Files:** None — manual browser verification, no code changes expected unless a bug is found.

**Interfaces:**
- Consumes: everything built in Tasks 1-4.

- [ ] **Step 1: Demo-session regression check**

Log in as a demo account. Confirm: uploading/viewing a studio logo in Paramètres still works and shows in the Sidebar; the client contacts list in FicheClient (add/remove/edit a contact, change portal permissions via the presets) behaves exactly as before; notification preference toggles in Paramètres save and reload correctly. No console errors anywhere.

- [ ] **Step 2: Real-session round-trip — studio logo**

Log in as (or sign up) a real account. Upload a studio logo (full + square) in Paramètres. Reload the page — confirm both logos still display (Sidebar + Paramètres). In the Supabase Table Editor, confirm the `studios` row for this studio has `logo_full`/`logo_square` populated.

- [ ] **Step 3: Studio logo scoping fix confirmed**

Sign up a SECOND real account (a different studio). Confirm it does NOT show the first studio's logo (proves the scoping bug is fixed — before this migration, both would have shared the same global localStorage key).

- [ ] **Step 4: Real-session round-trip — client contacts**

In a real account, open a client's Équipe tab, invite a new external contact with specific portal permissions (e.g. the "Approbateur" preset), reload, confirm the contact and its exact permissions persist. Edit the contact's permissions via the "Modifier" panel, save, reload, confirm the change persists. Remove the contact, confirm it's gone after reload.

- [ ] **Step 5: Internal contact → team member link survives reload and member removal**

Assign an internal studio team member as a client contact (via "Assigner un membre interne" or equivalent flow in FicheClient). Reload — confirm the link is intact (the contact still shows as internal and tied to that team member). Then remove that person from the studio's team (via Paramètres → Équipe or MonEquipe). Reload the client's Équipe tab — confirm the client-contact record still exists (not cascade-deleted), just with its `studio_member_id` link cleared (`on delete set null`).

- [ ] **Step 6: Real-session round-trip — notification preferences**

In a real account, toggle several notification preferences in Paramètres, reload, confirm they persist. Log in as the SECOND real account created in Step 3 — confirm it has its own independent default preferences, not the first account's.

- [ ] **Step 7: Cross-studio and cross-user RLS isolation**

Using the browser console on an authenticated real session: attempt `await supabase.from('client_contacts').select('*')` with no filter — confirm it returns only this studio's own contacts, never another studio's. Attempt `await supabase.from('notif_prefs').select('*')` with no filter — confirm it returns only this user's own row, never another user's.

- [ ] **Step 8: Final typecheck/lint diff against baseline**

Run:
```bash
cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "^src/"
npm run lint 2>&1 | tail -3
```
Expected: typecheck error count is 185 and lint reports 339 problems (309 errors, 30 warnings) or fewer.

- [ ] **Step 9: Record final verification results in the progress ledger**
