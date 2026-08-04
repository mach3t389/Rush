# Hub "Membres" + unification Groupe/Client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified `/membres` hub (Individus + Groupes tabs), an individual-detail screen, group-assignment in the project team modal, and remove the two automatic client-contact-to-project propagation functions — without touching the underlying `clients`/`client_contacts` data model at all (a "Groupe" is the existing `clients` table, just a new label and entry point).

**Architecture:** No new Supabase tables. One new store function (`getAllClientContacts`, studio-wide). One new screen (`Membres.tsx`) and one new screen (`FicheIndividu.tsx`), both following the existing `FicheClient.tsx` tab-via-`?tab=`-search-param pattern. `ProjectMembres.tsx`'s existing `AddMemberModal` gets a third pool ("Groupes") that expands to individual users on confirm, reusing the exact same `onAdd`/`persistMembers`/`syncProjectClientAccess` pipeline already in place — no new persistence logic. `syncClientContactAcrossProjects` and `syncNewProjectAcrossClientContacts` are deleted along with their call sites.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres), no automated test suite — verification is `npm run build` (typecheck) + manual browser checks, per this repo's established convention.

**Design doc:** `docs/superpowers/specs/2026-08-04-membres-hub-groups-unification-design.md` — read this first.

## Global Constraints

- No new Supabase tables or columns in this chantier — `clients`/`client_contacts`/`studio_members`/`project_client_access` are all read from as-is.
- Group assignment to a project is a one-time explicit expansion, never a live link — assigning a group's current members, then later editing the group, must never retroactively change who has access to a project already assigned.
- `syncProjectClientAccess` (the manual, explicit sync) is the ONLY function allowed to write `project_client_access` — this was already true before this chantier and must remain true after removing the two automatic ones.
- Every new user-facing string goes through `t('<namespace>.<key>')` in both `app/src/locales/fr.json` and `en.json`, added at the same relative position in both files.
- `/clients` and `/clients/:clientId` routes and their screens (`Clients.tsx`, `FicheClient.tsx`) are NOT deleted or restructured — only the sidebar nav entry pointing at `/clients` is removed, since Membres → Groupes becomes the new primary entry point to the same screen.
- Run `npm run build` after every task and confirm 0 errors before moving to the next task.

---

### Task 1: `clientTeamStore.ts` — studio-wide contact list

**Files:**
- Modify: `app/src/data/clientTeamStore.ts`

**Interfaces:**
- Produces: `getAllClientContacts(): (ClientContact & { clientId: string; clientName: string })[]` and `subscribeAllClientContacts(fn: () => void): () => void` — Task 3 (Membres.tsx) consumes both.

- [ ] **Step 1: Add the studio-wide cache and fetch, mirroring the existing per-client cache's structure**

In `app/src/data/clientTeamStore.ts`, after the existing `_supabaseContacts`/`_supabaseFetchStarted` declarations, add:

```ts
// ── Studio-wide contact list (all clients combined) — for the Membres hub's
// Individus tab, which needs every contact in the studio at once rather than
// one client at a time like the rest of this file's API. ─────────────────────
let _allContacts: (ClientContact & { clientId: string; clientName: string })[] = [];
let _allContactsFetchStarted = false;

interface ClientContactWithNameRow extends ClientContactRow {
  clients: { name: string } | null;
}

async function fetchAllClientContacts(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*, clients(name)')
    .eq('studio_id', studioId);
  if (error) { console.error('fetchAllClientContacts failed', error); return; }
  _allContacts = ((data ?? []) as ClientContactWithNameRow[]).map(row => ({
    ...toContact(row),
    clientId: row.client_id,
    clientName: row.clients?.name ?? '',
  }));
  notify();
}

function ensureAllContactsFetchStarted(): void {
  if (isDemoSession() || _allContactsFetchStarted) return;
  _allContactsFetchStarted = true;
  void fetchAllClientContacts();
}

export function getAllClientContacts(): (ClientContact & { clientId: string; clientName: string })[] {
  if (isDemoSession()) {
    return Object.entries(demoStore).flatMap(([clientId, contacts]) =>
      contacts.map(c => ({ ...c, clientId, clientName: '' }))
    );
  }
  ensureAllContactsFetchStarted();
  return _allContacts;
}

export function subscribeAllClientContacts(fn: () => void): () => void {
  _listeners.add(fn);
  ensureAllContactsFetchStarted();
  return () => _listeners.delete(fn);
}
```

Note: the demo-session branch returns `clientName: ''` since `demoStore` doesn't carry client names — Task 3's UI must resolve the client's display name itself in demo mode via `findClient(clientId)?.name` (already available from `clientStore.ts`) rather than relying on this field when `isDemoSession()`.

- [ ] **Step 2: Reset the new cache on logout**

Find the existing `onLogout(...)` call in this file (resets `_supabaseContacts`/`_supabaseFetchStarted`) and add the two new module-level variables to the same reset function body:

```ts
  _allContacts = [];
  _allContactsFetchStarted = false;
```

- [ ] **Step 3: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors — this task only adds new exports, doesn't change any existing signature.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/clientTeamStore.ts
git commit -m "feat(membres): add studio-wide client-contact list for the Membres hub"
```

---

### Task 2: Sidebar — replace "Clients" with "Membres"

**Files:**
- Modify: `app/src/components/layout/Sidebar.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

- [ ] **Step 1: Add locale keys**

In `fr.json`'s `"nav"` object, add: `"membres": "Membres",`
In `en.json`'s `"nav"` object, add: `"membres": "Members",`
(match the existing `"clients"` key's position in both files, right next to it.)

- [ ] **Step 2: Replace the nav item**

Read the actual current code around the `canSeeClients`/`<NavItem to="/clients" ...>` block first (verify against `origin/master` — line numbers may have shifted). Rename `canSeeClients` to `canSeeMembres` throughout its scope (the `getRequiredPermissionForPath('/clients')` call itself can stay as-is if that's how the permission gate is keyed — check `viewAsRoutePermissions.ts` for whether it's keyed by string path; if so, keep the lookup key `'/clients'` since that's the underlying permission gate's identity, only the nav item's visible destination changes), then change the rendered `<NavItem>`:

```tsx
          {canSeeMembres && (
            <NavItem to="/membres" icon="users" label={t('nav.membres')} exact={false} collapsed={collapsed} />
          )}
```

(`exact={false}` because `/membres` and `/membres/individus/:id` should both highlight the same nav item, unlike `/clients` which was `exact={true}` since `FicheClient` never shared this nav item's active state before.)

Leave the "Clients épinglés" (pinned clients) section elsewhere in this file untouched — pinned clients still link to `/clients/:id` directly, which still works per this plan's Global Constraints.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: 0 errors from this file. A new error may appear for `/membres` not existing as a route yet — that's expected until Task 3 lands; if you see that specific error, it's fine to note and move on rather than fix here (route wiring is Task 3's job, not this one's).

- [ ] **Step 4: Commit**

```bash
git add app/src/components/layout/Sidebar.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(membres): replace Clients nav item with Membres"
```

---

### Task 3: `Membres.tsx` — new page, Individus + Groupes tabs, routing

**Files:**
- Create: `app/src/screens/Membres.tsx`
- Modify: `app/src/main.tsx` (add the `/membres` route)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getAllClientContacts`/`subscribeAllClientContacts` (Task 1), `getTeamMembers`/`subscribeTeam` (existing `teamStore.ts`), `getClients`/`subscribeClients` (existing `clientStore.ts`), `createInvitation`/`sendTeamInvitationEmail` (`teamStore.ts`), `createInvitation`/`getInvitationLink`/`sendClientInvitationEmail` (`invitationStore.ts` — note this is a DIFFERENT `createInvitation` than teamStore's, for client contacts; import both under distinct local names, e.g. `createTeamInvitation`/`createClientInvitation`).
- Produces: route `/membres` — Task 5 (FicheIndividu.tsx) and Task 7 (Parametres redirect) both link here.

- [ ] **Step 1: Add locale keys**

In both `fr.json` and `en.json`, add a new top-level `"membres"` namespace object (not nested under `"nav"` — this is page-content copy, `"nav.membres"` from Task 2 is separate and stays):

fr.json:
```json
  "membres": {
    "title": "Membres",
    "tabIndividus": "Individus",
    "tabGroupes": "Groupes",
    "filterAll": "Tous",
    "filterInternal": "Interne",
    "filterExternal": "Externe",
    "columnType": "Type",
    "columnGroup": "Groupe",
    "typeInternal": "Interne",
    "typeExternal": "Contact externe",
    "inviteMember": "Inviter",
    "newGroup": "Nouveau groupe",
    "noGroupLabel": "—"
  },
```

en.json:
```json
  "membres": {
    "title": "Members",
    "tabIndividus": "Individuals",
    "tabGroupes": "Groups",
    "filterAll": "All",
    "filterInternal": "Internal",
    "filterExternal": "External",
    "columnType": "Type",
    "columnGroup": "Group",
    "typeInternal": "Internal",
    "typeExternal": "External contact",
    "inviteMember": "Invite",
    "newGroup": "New group",
    "noGroupLabel": "—"
  },
```

(Insert both as a new top-level key in the respective JSON files — check the file's overall structure first to place it alphabetically or near related keys like `"clients"`/`"projects"`, matching this repo's existing loose convention.)

- [ ] **Step 2: Write `Membres.tsx`**

```tsx
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFAvatar, SFButton } from '../components/ui';
import { getTeamMembers, subscribeTeam, createInvitation as createTeamInvitation, sendTeamInvitationEmail, type TeamMemberInfo } from '../data/teamStore';
import { getAllClientContacts, subscribeAllClientContacts } from '../data/clientTeamStore';
import { getClients, subscribeClients } from '../data/clientStore';
import { isDemoSession } from '../data/authStore';
import { useSyncedViewState } from '../hooks/useSyncedViewState';
import type { ClientContact } from '../data/clientContactsStore';

type MembresTab = 'individus' | 'groupes';
type TypeFilter = 'all' | 'internal' | 'external';

interface UnifiedPerson {
  id: string;
  name: string;
  email: string;
  initials: string;
  color: string;
  isInternal: boolean;
  groupId?: string;
  groupName?: string;
}

export function Membres() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as MembresTab) ?? 'individus';
  const setTab = (next: MembresTab) => setSearchParams({ tab: next }, { replace: true });

  const [team, setTeam] = useSyncedViewState(getTeamMembers, subscribeTeam);
  const [contacts, setContacts] = useSyncedViewState(getAllClientContacts, subscribeAllClientContacts);
  const [clients, setClients] = useSyncedViewState(getClients, subscribeClients);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const internalPeople: UnifiedPerson[] = team.map(m => ({
    id: m.id, name: m.name, email: m.email, initials: m.initials, color: m.avatarColor, isInternal: true,
  }));
  const externalPeople: UnifiedPerson[] = contacts.filter(c => !c.internal).map(c => ({
    id: c.id, name: c.name, email: c.email, initials: c.initials, color: c.color, isInternal: false,
    groupId: c.clientId, groupName: c.clientName,
  }));
  const allPeople = [...internalPeople, ...externalPeople];
  const visiblePeople = typeFilter === 'all' ? allPeople : typeFilter === 'internal' ? internalPeople : externalPeople;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 800 }}>{t('membres.title')}</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {(['individus', 'groupes'] as const).map(key => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--ff-text)', fontSize: 13, fontWeight: 600,
            color: tab === key ? 'var(--text)' : 'var(--text-3)',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            {t(key === 'individus' ? 'membres.tabIndividus' : 'membres.tabGroupes')}
          </button>
        ))}
      </div>

      {tab === 'individus' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'internal', 'external'] as const).map(f => (
              <button key={f} onClick={() => setTypeFilter(f)} style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--ff-text)', fontSize: 12,
                border: `1px solid ${typeFilter === f ? 'var(--accent)' : 'var(--border)'}`,
                background: typeFilter === f ? 'rgba(249,255,0,0.08)' : 'transparent',
                color: typeFilter === f ? 'var(--text)' : 'var(--text-2)',
              }}>
                {t(f === 'all' ? 'membres.filterAll' : f === 'internal' ? 'membres.filterInternal' : 'membres.filterExternal')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visiblePeople.map(p => (
              <div key={p.id} onClick={() => navigate(`/membres/individus/${p.id}`)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface)',
              }}>
                <SFAvatar name={p.name} color={p.color} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.email}</p>
                </div>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                  {p.isInternal ? t('membres.typeInternal') : t('membres.typeExternal')}
                </span>
                {!p.isInternal && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.groupName || t('membres.noGroupLabel')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'groupes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {clients.filter(c => !c.archived).map(c => (
            <div key={c.id} onClick={() => navigate(`/clients/${c.id}`)} style={{
              padding: 16, borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface)',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                {c.initials}
              </div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

This is a functional first pass — invite/edit/remove actions (Global Constraint requires full management, not just a read-only list) are deliberately left as a visible gap for Step 3 below to fill in, since the exact modal/form pattern needs to mirror `MonEquipe.tsx`'s and `FicheClient.tsx`'s existing invite flows closely enough that copying their real JSX (not reinventing it) is more reliable — read both files' invite-button/modal code before writing Step 3's diff.

- [ ] **Step 3: Add invite/manage actions to the Individus tab**

Read `app/src/screens/MonEquipe.tsx`'s invite-member button/modal (internal) and `FicheClient.tsx`'s `EquipeTab` invite-contact button/modal (external) in full. Add an "Inviter" button (`t('membres.inviteMember')`) to the Individus tab's header that opens a small mode-choice (Interne / Externe), then reuses each source screen's existing modal component/logic verbatim (import and render it, do not copy-paste its internals into `Membres.tsx`) — if either modal is a private (non-exported) component in its source file, export it from that file first (add `export` to its function declaration) rather than duplicating its code.

For removing a person from the unified list, reuse `removeMember` (`teamStore.ts`, internal) or `removeClientTeamMember` (`clientTeamStore.ts`, external) directly, gated behind a confirm dialog matching this codebase's existing `confirmDialog` pattern (see `ProjectHeaderBar.tsx` for an example call site).

- [ ] **Step 4: Add the route**

In `app/src/main.tsx`, add a sibling route next to the existing `{ path: 'clients', ... }` entry:

```ts
      { path: 'membres', element: <ViewAsPermissionGate><Membres /></ViewAsPermissionGate> },
```

Add the import at the top of the file alongside the other screen imports: `import { Membres } from './screens/Membres';`

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: 0 errors.

- [ ] **Step 6: Manual verification in the browser**

Start the dev server, navigate to `/membres`, confirm: the Individus tab shows both internal team members and external client contacts with correct type labels; switching to Groupes shows the same cards as today's `/clients` list; clicking a group card navigates to the existing `/clients/:id` fiche unchanged; the filter buttons correctly narrow the Individus list.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/Membres.tsx app/src/main.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(membres): add the Membres hub page (Individus + Groupes tabs)"
```

---

### Task 4: `ProjectMembres.tsx` — add a "Groupes" pool to `AddMemberModal`

**Files:**
- Modify: `app/src/screens/ProjectMembres.tsx`

**Interfaces:**
- Consumes: `getClients` (`clientStore.ts`), `getClientExternalTeam` (`clientTeamStore.ts`), `getTeamMembers` (`teamStore.ts`).
- Produces: picking a group in `AddMemberModal` and confirming calls the existing `onAdd(users: User[])` prop with every resolved member of that group — no new persistence function, `persistMembers`/`syncProjectClientAccess` (already wired at the parent, line ~399 per the plan's research) handle the rest exactly as they do for individually-picked users today.

- [ ] **Step 1: Add a third pool and picker section**

Read the actual current `AddMemberModal` component in full first (it's ~211 lines, `currentIds`/`clientId`/`onAdd`/`onClose` props per the plan's research) before editing — the JSX structure for `internalPool`/`externalPool` sections is your pattern to mirror for the new "Groupes" section.

Add, near the top of the component body (alongside the existing `internalPool`/`externalPool` computations):

```ts
  const groupPool = getClients().filter(c => !c.archived && (!clientId || c.id !== clientId));
```

(excludes the project's own client, if it has one, since that client's contacts are already offered individually via `externalPool` — picking the project's own client as a "group" would be redundant with the existing external-contacts picker.)

Add a `pickedGroupIds: Set<string>` state alongside the existing `picked` state, and a toggle function mirroring the existing `toggle(id)` pattern. Render a third section (below the internal/external pools, same visual pattern — a labeled list of clickable rows) listing `groupPool`, each row toggled into `pickedGroupIds`.

- [ ] **Step 2: Expand picked groups into users on confirm**

Find `handleConfirm` (or equivalent confirm handler) in this component. Before it resolves `picked` into `User[]` and calls `onAdd(users)`, add a step that expands every group in `pickedGroupIds` into its member users:

```ts
    const groupUsers: User[] = Array.from(pickedGroupIds).flatMap(groupId => {
      const contacts = getClientExternalTeam(groupId);
      return contacts.map(c => ({ id: c.id, name: c.name, initials: c.initials, avatarColor: c.color, role: c.role }));
    });
```

Merge `groupUsers` into the final array passed to `onAdd(...)`, de-duplicated against `users` (individually-picked) and against `currentIds` (already on the project) by `id` — a person already on the project or already picked individually should not appear twice just because they're also in a picked group.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: 0 errors.

- [ ] **Step 4: Manual verification**

Open a project's Équipe tab, click "Ajouter un membre", confirm a "Groupes" section appears listing other clients, pick one, confirm it adds all of that client's external contacts to the project (check they appear in the member list afterward, and that `project_client_access` reflects them — spot-check via the project's client-access UI or Supabase if needed).

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/ProjectMembres.tsx
git commit -m "feat(membres): add group assignment to the project team modal"
```

---

### Task 5: `FicheIndividu.tsx` — individual detail screen

**Files:**
- Create: `app/src/screens/FicheIndividu.tsx`
- Modify: `app/src/main.tsx` (add the route)

**Interfaces:**
- Consumes: `findTeamMember`/`getTeamMembers` (internal) or the studio-wide contacts list from Task 1 (external) to resolve which person this is; `getProjects` (`projectStore.ts`) filtered to this person's assignments.

- [ ] **Step 1: Write `FicheIndividu.tsx`**

Read `app/src/screens/FicheClient.tsx`'s top-level structure (component signature, `?tab=` search-param pattern, loading guard) as your scaffold reference — this new screen follows the identical shape, scoped to one person instead of one client:

```tsx
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFAvatar, SFIcon } from '../components/ui';
import { findTeamMember, getTeamMembers } from '../data/teamStore';
import { getAllClientContacts } from '../data/clientTeamStore';
import { getProjects } from '../data/projectStore';
import { ActivityFeed } from '../components/ActivityFeed';

type IndividuTab = 'apercu' | 'projets' | 'calendrier' | 'fichiers' | 'finances' | 'activite';

export function FicheIndividu() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as IndividuTab) ?? 'apercu';
  const setTab = (next: IndividuTab) => setSearchParams({ tab: next }, { replace: true });

  const internal = id ? findTeamMember(id) : undefined;
  const external = !internal && id ? getAllClientContacts().find(c => c.id === id) : undefined;
  const person = internal ?? external;

  if (!person) return <div style={{ padding: 24 }}>{t('common.loading')}</div>;

  const assignedProjects = getProjects().filter(p =>
    internal ? p.members.some(m => m.id === id) : true // external-contact project scoping refined in Step 2 below
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => navigate('/membres')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-mono)' }}>
        <SFIcon name="arrow-left" size={12} /> {t('membres.title')}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SFAvatar name={person.name} color={'avatarColor' in person ? person.avatarColor : person.color} size={44} />
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: 20, fontWeight: 800 }}>{person.name}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{person.email}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {(['apercu', 'projets', 'calendrier', 'fichiers', 'finances', 'activite'] as const).map(key => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--ff-text)', fontSize: 13, fontWeight: 600,
            color: tab === key ? 'var(--text)' : 'var(--text-3)',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            {t(`client.tab${key.charAt(0).toUpperCase()}${key.slice(1)}` as any)}
          </button>
        ))}
      </div>

      {tab === 'projets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assignedProjects.map(p => (
            <div key={p.id} onClick={() => navigate(`/projets/${p.id}`)} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer' }}>
              {p.name}
            </div>
          ))}
        </div>
      )}
      {tab === 'activite' && <ActivityFeed projectIds={assignedProjects.map(p => p.id)} />}
      {/* apercu/calendrier/fichiers/finances left as a follow-up polish pass — projets + activite are this task's minimum bar per the design's "projets assignés, activité" requirement; the remaining tabs can reuse ProjetCalendrier/FileBrowser/Finances filtered to assignedProjects the same way FicheClient.tsx already does per-client, following that file's exact pattern for each. */}
    </div>
  );
}
```

Reuses `client.tab*` locale keys (already exist per `FicheClient.tsx`'s tab labels) rather than adding new duplicate ones — verify each of `client.tabApercu`/`tabProjets`/`tabCalendrier`/`tabFiles`(not `tabFichiers` — check the exact existing key name)/`tabFinances`(check exact key, may be `nav.finances` per the research)/`tabActivite` actually exists with those exact names before relying on the dynamic `t(...)` lookup above; if any don't match, use the correct existing key name directly rather than the templated guess shown, and if `ActivityFeed`'s actual prop isn't called `projectIds`, check its real signature and adjust.

- [ ] **Step 2: Resolve external-contact project scoping precisely**

For an external contact (`external` branch), their assigned projects are those where they have a row in `project_client_access`, not `p.members`. Check whether a client-side function already exists to look this up per-contact (search `projectClientAccessStore.ts` and any hooks around it) — if not, query `project_client_access` directly filtered by `client_contact_id = id`, resolve to project ids, then filter `getProjects()` by those ids. Replace the placeholder `assignedProjects` ternary from Step 1 with this real logic.

- [ ] **Step 3: Add the route**

In `app/src/main.tsx`:

```ts
      { path: 'membres/individus/:id', element: <ViewAsPermissionGate><FicheIndividu /></ViewAsPermissionGate> },
```

Import: `import { FicheIndividu } from './screens/FicheIndividu';`

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Manual verification**

From `/membres`, click an internal team member and an external contact, confirm each opens their own fiche showing the correct set of assigned projects.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/FicheIndividu.tsx app/src/main.tsx
git commit -m "feat(membres): add individual detail screen"
```

---

### Task 6: Remove automatic client-contact-to-project propagation

**Files:**
- Modify: `app/src/data/projectClientAccessStore.ts` (delete 2 exported functions + their private helpers)
- Modify: `app/src/data/projectStore.ts` (remove the call + import)
- Modify: `app/src/screens/FicheClient.tsx` (remove the call + import)

**Interfaces:**
- `syncProjectClientAccess` (the manual/explicit one) is untouched and remains the only writer of `project_client_access`.

- [ ] **Step 1: Delete the two functions from `projectClientAccessStore.ts`**

Remove `syncClientContactAcrossProjects` and its private `doSyncContactAcrossProjects` helper, and `syncNewProjectAcrossClientContacts` and its private `doSyncNewProjectAcrossContacts` helper — read the file first to confirm their exact current boundaries before deleting, since this repo's convention keeps explanatory comments directly above each function that should be removed along with it.

- [ ] **Step 2: Remove the call site in `projectStore.ts`**

Read the file around line ~200 (per this plan's research) to confirm the exact current call — remove the `syncNewProjectAcrossClientContacts(p.id, p.clientId)` line and its import from `projectClientAccessStore.ts` at the top of the file. If that import line also imports `syncProjectClientAccess` (still needed elsewhere), only remove the specific named import being deleted, not the whole import statement.

- [ ] **Step 3: Remove the call site in `FicheClient.tsx`**

Read the file around line ~705 (per this plan's research) to confirm the exact current call site — remove the `syncClientContactAcrossProjects(clientId, m.id);` line and its import. This call was inside whatever handler adds a new contact to a client's team — after removing it, confirm that handler still correctly adds the contact to `client_contacts` via `addClientTeamMember` (unaffected, that's a separate call) and only the cross-project propagation is gone.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: 0 errors — no other file should reference the two removed functions (confirm via a repo-wide search for both function names before considering this step done).

- [ ] **Step 5: Manual verification**

Create a new project for an existing client with existing contacts — confirm the new project's team does NOT automatically include those contacts (only whoever you explicitly add). Add a brand-new contact to an existing client — confirm that contact does NOT automatically appear on the client's other existing projects.

- [ ] **Step 6: Commit**

```bash
git add app/src/data/projectClientAccessStore.ts app/src/data/projectStore.ts app/src/screens/FicheClient.tsx
git commit -m "feat(membres): remove automatic client-contact-to-project propagation"
```

---

### Task 7: Redirect Paramètres' Équipe section to `/membres`

**Files:**
- Modify: `app/src/screens/Parametres.tsx`

- [ ] **Step 1: Replace the `'team'` section's render with a redirect**

Read the actual current `activeSection === 'team'` render branch and the `SECTIONS` array first. Keep the `'team'` entry in `SECTIONS` (per this plan's research, to preserve its slot in the `!['infos', 'team', ...].includes(activeSection)` fallback-avoidance list) but change what happens when it's selected: replace

```tsx
        {activeSection === 'team' && (
          <MonEquipe />
        )}
```

with an effect-driven redirect — add near the top of the `Parametres` component body:

```ts
  const navigate = useNavigate(); // add this import from 'react-router-dom' if not already present in this file
  useEffect(() => {
    if (activeSection === 'team') navigate('/membres', { replace: true });
  }, [activeSection, navigate]);
```

and remove the `<MonEquipe />` render block entirely (the effect above navigates away before it would ever render). Check whether `useNavigate`/`useEffect` are already imported in this file before adding new imports — this file is large and likely already imports both for other purposes.

- [ ] **Step 2: Remove the now-unused `MonEquipe` import if nothing else in this file uses it**

Search the file for other usages of `MonEquipe` before removing its import line — if this was the only usage, delete the import; the `MonEquipe.tsx` file itself is NOT deleted (unused-but-present is acceptable per this plan's scope; deleting the whole file is out of scope unless nothing else in the app references it — a quick repo-wide check for `MonEquipe` imports elsewhere is worth doing here, but don't delete the file itself in this task regardless).

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Manual verification**

In Paramètres, click the "Équipe" section — confirm it redirects to `/membres` instead of showing the old team screen.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Parametres.tsx
git commit -m "feat(membres): redirect Paramètres Équipe section to the Membres hub"
```

---

### Task 8: Final end-to-end verification

**Files:** none (manual regression pass)

- [ ] **Step 1: Full flow check**

In a real (non-demo) session if possible, or demo mode otherwise: browse `/membres` (both tabs), open an individual's fiche, open a group's fiche (confirm it's identical to the pre-chantier `/clients/:id` experience), add a group to a project's team, confirm no automatic propagation occurs on new-project-for-client or new-contact-for-client, confirm Paramètres → Équipe redirects correctly, confirm the sidebar no longer shows a separate "Clients" item.

- [ ] **Step 2: Whole-branch review**

Use superpowers:requesting-code-review's code-reviewer on the full branch diff before merging, per this plan's Global Constraints (no new tables, `syncProjectClientAccess` remains the sole writer of `project_client_access`, group assignment is a one-time expansion not a live link).
