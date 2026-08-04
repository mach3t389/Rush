# Étape C — Tableau de bord client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/mon-espace` (raw project-id list) with a real, read-only client dashboard: a "Mes projets" list, a 4-tab project detail (Aperçu/Fichiers/Calendrier/Factures), automatic project-access grants when a client's team or project list changes, and direct landing in a project right after invitation acceptance.

**Architecture:** Reuses the Step B security model (`project_client_access` + RLS) without modifying any existing policy — purely additive. Reuses existing shared components (`FileBrowser`, `ProjetCalendrier`) in new read-only modes rather than duplicating them, except where retrofitting read-only behavior into write-heavy internals (`EventDetail`) would be riskier than a small new read-only component. New client-facing screens live under `app/src/screens/client/` to keep them visually and structurally separate from the studio-side screens they're inspired by.

**Tech Stack:** React 19 + TypeScript, react-router-dom v7 (flat top-level routes, same convention as the studio side), Supabase (Postgres + RLS), i18next.

## Global Constraints

- Never hard-code user-facing text — every new string goes through `t('namespace.key')`, added first to `app/src/locales/fr.json` and `app/src/locales/en.json`.
- Never use `<input type="date">` — not needed in this plan (no client-side date editing), but if any date display needs formatting, use existing `formatDisplay` from `../components/ui`.
- All styling is inline `style={}` using the CSS tokens from `app/src/index.css` (`--bg`, `--surface`, `--text`, `--accent`, `--ff-text`, `--ff-mono`, etc.) — no Tailwind classes.
- No write actions anywhere in this plan's new client-facing UI (no create/edit/delete/approve/pay). Every new screen is read-only.
- This repo works directly on `master`, no feature branches. Commit frequently with descriptive messages.
- Supabase migrations are never auto-applied — the SQL in Task 1 must be pasted into Supabase → SQL Editor by the user; note this explicitly when that task completes.

---

## File structure

| File | Responsibility |
|---|---|
| `docs/superpowers/specs/2026-07-25-client-dashboard-events-rls-migration.sql` | New — grants clients read access to `events` for projects they can see |
| `app/src/data/projectClientAccessStore.ts` | Modify — two new sync functions: by-client (new contact) and by-client (new project) |
| `app/src/screens/FicheClient.tsx` | Modify — invite flow calls the new by-client sync |
| `app/src/data/projectStore.ts` | Modify — `addSupabaseProject` calls the new by-client sync after insert succeeds |
| `app/src/data/clientSessionStore.ts` | Modify — add `getMyClientProjects()`, `getMyClientDeliverables(projectId)`, `getMyClientEvents(projectIds)` |
| `app/src/screens/ClientHome.tsx` | Modify — real project cards instead of raw id list |
| `app/src/components/client/ClientProjectHeader.tsx` | New — lightweight 4-tab nav bar for a client's project detail (no edit/menu/color, unlike `ProjectHeaderBar`) |
| `app/src/screens/client/ClientProjectApercu.tsx` | New — Aperçu tab: phase stepper + shared deliverables |
| `app/src/screens/client/ClientProjectFichiers.tsx` | New — Fichiers tab wrapper around `FileBrowser` in read-only mode |
| `app/src/screens/client/ClientProjectCalendrier.tsx` | New — Calendrier tab wrapper around `ProjetCalendrier` in read-only mode |
| `app/src/screens/client/ClientProjectFinances.tsx` | New — Factures tab: read-only invoice list |
| `app/src/screens/FichiersGlobal.tsx` | Modify — add `readOnly` prop to `FileBrowser`, gating every write entry point |
| `app/src/screens/ProjetCalendrier.tsx` | Modify — add `readOnly` prop, suppress create/edit entry points, render a new lightweight read-only event popover instead of `EventDetail` |
| `app/src/components/calendar/ClientEventDetail.tsx` | New — minimal read-only event popover (title, time, type, description) |
| `app/src/screens/ClientInvitationAccept.tsx` | Modify — redirect to `/mon-espace/projets/:id` instead of `/mon-espace` on acceptance |
| `app/src/main.tsx` | Modify — add 4 new flat routes under `clientLoader` |
| `app/src/locales/fr.json`, `app/src/locales/en.json` | Modify — new `clientProject.*` namespace |

---

### Task 1: Supabase migration — client read access to `events`

**Files:**
- Create: `docs/superpowers/specs/2026-07-25-client-dashboard-events-rls-migration.sql`

**Interfaces:**
- Consumes: `is_client_contact_for_project(p_project_id text)` — already exists in Supabase (created by the Step B migration, `docs/superpowers/specs/2026-07-15-client-access-migration.sql`), returns boolean, `security definer`, already `grant execute ... to authenticated`.
- Produces: an additive `SELECT` RLS policy on `events`, following the exact same shape as Step B's `sections_select_client_access`/`tasks_select_client_access` policies.

- [ ] **Step 1: Write the migration file**

```sql
-- 2026-07-25 — Étape C of the role/permissions overhaul: real client
-- dashboard. This is the only new RLS policy this step needs — Step B
-- (docs/superpowers/specs/2026-07-15-client-access-migration.sql) never
-- granted clients read access to `events`, because at the time no
-- client-facing calendar existed yet. Additive only: does not touch any
-- existing policy.
--
-- MANUAL STEP REQUIRED: paste this into Supabase → SQL Editor and run it.
-- Nothing in this project applies migrations automatically — see
-- CLAUDE.md's "Migrations Supabase" section.
--
-- Assumes events.project_id is `text`, matching projects.id text primary
-- key (same assumption Step B made for sections/tasks/invoices/file_*).

drop policy if exists "events_select_client_access" on events;
create policy "events_select_client_access" on events
  for select
  using (project_id is not null and is_client_contact_for_project(project_id));

grant select on public.events to authenticated;
```

- [ ] **Step 2: Ask the user to run it**

Tell the user: "J'ai écrit la migration `docs/superpowers/specs/2026-07-25-client-dashboard-events-rls-migration.sql` — merci de la coller dans Supabase → SQL Editor et de l'exécuter avant qu'on teste le calendrier client."

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-25-client-dashboard-events-rls-migration.sql
git commit -m "docs: add events RLS migration for client dashboard calendar tab"
```

---

### Task 2: `projectClientAccessStore.ts` — two new by-client sync functions

**Files:**
- Modify: `app/src/data/projectClientAccessStore.ts`

**Interfaces:**
- Consumes: `getClientExternalTeam(clientId): ClientContact[]` (existing, `clientTeamStore.ts`), `getStudioId(): Promise<string>` (existing, `studioStore.ts`), `supabase` client (existing, `supabaseClient.ts`), `isDemoSession()` (existing, `authStore.ts`).
- Produces:
  - `export function syncClientContactAcrossProjects(clientId: string, contactId: string): void` — call when a contact is newly added to a client's team; grants that one contact access to every existing project of `clientId`.
  - `export function syncNewProjectAcrossClientContacts(projectId: string, clientId: string): void` — call after a new project is created for `clientId`; grants every existing external contact of `clientId` access to that one project.

- [ ] **Step 1: Add the two exported functions**

Append to `app/src/data/projectClientAccessStore.ts` (after the existing `doSync` function):

```ts
import { getProjectsByClient } from './projectStore';

export function syncClientContactAcrossProjects(clientId: string, contactId: string): void {
  if (isDemoSession()) return;
  void doSyncContactAcrossProjects(clientId, contactId);
}

async function doSyncContactAcrossProjects(clientId: string, contactId: string): Promise<void> {
  const projectIds = getProjectsByClient(clientId).map(p => p.id);
  if (projectIds.length === 0) return;
  const studioId = await getStudioId();
  const { data: existing, error: fetchError } = await supabase
    .from('project_client_access')
    .select('project_id')
    .eq('client_contact_id', contactId)
    .in('project_id', projectIds);
  if (fetchError) { console.error('syncClientContactAcrossProjects fetch failed', fetchError); return; }
  const existingProjectIds = new Set((existing ?? []).map(row => row.project_id as string));
  const toAdd = projectIds.filter(id => !existingProjectIds.has(id));
  if (toAdd.length === 0) return;
  const { error } = await supabase.from('project_client_access').insert(
    toAdd.map(projectId => ({ project_id: projectId, client_contact_id: contactId, studio_id: studioId }))
  );
  if (error) console.error('syncClientContactAcrossProjects insert failed', error);
  toAdd.forEach(projectId => void syncGoogleCalendarProjectAccess(projectId));
}

export function syncNewProjectAcrossClientContacts(projectId: string, clientId: string): void {
  if (isDemoSession()) return;
  void doSyncNewProjectAcrossContacts(projectId, clientId);
}

async function doSyncNewProjectAcrossContacts(projectId: string, clientId: string): Promise<void> {
  const contactIds = getClientExternalTeam(clientId).map(c => c.id);
  if (contactIds.length === 0) return;
  const studioId = await getStudioId();
  const { error } = await supabase.from('project_client_access').insert(
    contactIds.map(clientContactId => ({ project_id: projectId, client_contact_id: clientContactId, studio_id: studioId }))
  );
  if (error) console.error('syncNewProjectAcrossClientContacts insert failed', error);
  void syncGoogleCalendarProjectAccess(projectId);
}
```

**Note for the implementer:** `getProjectsByClient` must exist on `projectStore.ts` — check first with `grep -n "getProjectsByClient\|export function getProjects" app/src/data/projectStore.ts`. If it doesn't exist under that exact name, add it as a one-line export (`export function getProjectsByClient(clientId: string): Project[] { return getProjects().filter(p => p.clientId === clientId); }`) next to the other `getProjects*` helpers, using whatever the existing all-projects getter is actually called.

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors from `projectClientAccessStore.ts` (an unused-import error on `getProjectsByClient` means Step 1's grep check above needs to be applied).

- [ ] **Step 3: Commit**

```bash
git add app/src/data/projectClientAccessStore.ts app/src/data/projectStore.ts
git commit -m "feat(client-access): add by-client auto-grant sync for new contacts and new projects"
```

---

### Task 3: Wire `syncClientContactAcrossProjects` into the invite flow

**Files:**
- Modify: `app/src/screens/FicheClient.tsx` (the `InviteModal`'s `onInvite` callback — the flow that calls `addClientTeamMember` + `createInvitation`, confirmed at ~lines 749-760 in prior exploration; re-locate with `grep -n "createInvitation(clientId" app/src/screens/FicheClient.tsx` since line numbers may have shifted)

**Interfaces:**
- Consumes: `syncClientContactAcrossProjects(clientId, contactId)` from Task 2.

- [ ] **Step 1: Locate the invite handler**

Run: `grep -n "addClientTeamMember(clientId\|createInvitation(clientId" app/src/screens/FicheClient.tsx`

This shows the exact `onInvite` callback body (it calls `addClientTeamMember(clientId, m)`, then `setMembers(getClientTeam(clientId))`, then `createInvitation(clientId, m.id)`).

- [ ] **Step 2: Add the sync call right after `addClientTeamMember`**

Add, immediately after the `addClientTeamMember(clientId, m)` line inside that same callback:

```ts
syncClientContactAcrossProjects(clientId, m.id);
```

Add the import at the top of the file:

```ts
import { syncClientContactAcrossProjects } from '../data/projectClientAccessStore';
```

**Do not** add this call to the separate `AssignInternalModal`'s `onAssign` handler in the same file — that flow adds *internal* (studio) members to a client-facing role, unrelated to `project_client_access`/external client RLS access.

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/FicheClient.tsx
git commit -m "feat(client-access): grant a newly invited contact access to all of the client's existing projects"
```

---

### Task 4: Wire `syncNewProjectAcrossClientContacts` into project creation

**Files:**
- Modify: `app/src/data/projectStore.ts` (the `addSupabaseProject` function, confirmed at ~lines 151-160 in prior exploration — re-locate with `grep -n "async function addSupabaseProject" app/src/data/projectStore.ts`)

**Interfaces:**
- Consumes: `syncNewProjectAcrossClientContacts(projectId, clientId)` from Task 2.

- [ ] **Step 1: Locate `addSupabaseProject`**

Run: `grep -n "async function addSupabaseProject" -A 15 app/src/data/projectStore.ts`

Confirm it awaits `getStudioId()`, inserts via `supabase.from('projects').insert(...)`, and on success calls `fetchSupabaseProjects()`.

- [ ] **Step 2: Add the sync call after the insert succeeds**

Immediately after the insert's success branch (right where `fetchSupabaseProjects()` is called, same `if (!error)`/`try` block), add:

```ts
syncNewProjectAcrossClientContacts(p.id, p.clientId);
```

(`p` is the `Project` parameter already in scope — reuse whatever the existing parameter is actually named if not `p`.)

Add the import at the top of the file:

```ts
import { syncNewProjectAcrossClientContacts } from './projectClientAccessStore';
```

**Why here and not in the UI layer:** `addProject` is fire-and-forget from `NewProjectModal` (`app/src/components/ProjectsListView.tsx`) — the project row may not exist in Supabase yet when the UI call returns. Calling the sync from inside `addSupabaseProject`, after the insert's own success confirmation, avoids a foreign-key violation on `project_client_access.project_id`.

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/projectStore.ts
git commit -m "feat(client-access): grant all of a client's contacts access to a newly created project"
```

---

### Task 5: `clientSessionStore.ts` — real data fetchers

**Files:**
- Modify: `app/src/data/clientSessionStore.ts`

**Interfaces:**
- Consumes: `supabase` client, the existing `getMyClientProjectIds` pattern (same file).
- Produces:
  - `export interface ClientProject { id: string; name: string; clientColor: string; progress: number; status: string; statusLabel: string; phase: string; phaseLabel: string; deliveryDate: string; }`
  - `export async function getMyClientProjects(): Promise<ClientProject[]>`
  - `export interface ClientDeliverable { id: string; title: string; deliverable: boolean; sharedWithClient?: boolean; dueDate?: string; status?: string; }`
  - `export async function getMyClientDeliverables(projectId: string): Promise<ClientDeliverable[]>`
  - `export interface ClientCalEvent { id: string; title: string; startDate: string; endDate: string; allDay: boolean; eventTypeColor: string; projectId: string; }`
  - `export async function getMyClientEvents(projectIds: string[]): Promise<ClientCalEvent[]>`

- [ ] **Step 1: Add `getMyClientProjects`**

Append to `app/src/data/clientSessionStore.ts`:

```ts
export interface ClientProject {
  id: string;
  name: string;
  clientColor: string;
  progress: number;
  status: string;
  statusLabel: string;
  phase: string;
  phaseLabel: string;
  deliveryDate: string;
}

export async function getMyClientProjects(): Promise<ClientProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, client_color, progress, status, status_label, phase, phase_label, delivery_date');
  if (error) { console.error('getMyClientProjects failed', error); return []; }
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    clientColor: row.client_color,
    progress: row.progress,
    status: row.status,
    statusLabel: row.status_label,
    phase: row.phase,
    phaseLabel: row.phase_label,
    deliveryDate: row.delivery_date,
  }));
}
```

**Column-name check required before this step is considered done:** run `grep -n "client_color\|status_label\|phase_label\|delivery_date" app/src/data/projectStore.ts` to confirm the real Supabase column names used by the studio-side `toProject`/`toRow` mappers for `projects`, and adjust the `.select(...)` string and the mapping object above to match exactly — do not guess.

- [ ] **Step 2: Add `getMyClientDeliverables`**

```ts
export interface ClientDeliverable {
  id: string;
  title: string;
  deliverable: boolean;
  sharedWithClient?: boolean;
  dueDate?: string;
  status?: string;
}

export async function getMyClientDeliverables(projectId: string): Promise<ClientDeliverable[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('data')
    .eq('project_id', projectId);
  if (error) { console.error('getMyClientDeliverables failed', error); return []; }
  return (data ?? [])
    .map(row => row.data as ClientDeliverable)
    .filter(t => t.deliverable && t.sharedWithClient !== false);
}
```

This relies on the `events_select_client_access`-style policy already granted for `tasks` in Step B (`tasks_select_client_access`) — no new RLS needed. The `data` column stores the full serialized `Task` object (confirmed in `taskStore.ts`'s `TaskRow` interface), so no join against `sections` is needed for a flat deliverables list.

- [ ] **Step 3: Add `getMyClientEvents`**

```ts
export interface ClientCalEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  eventTypeColor: string;
  projectId: string;
}

export async function getMyClientEvents(projectIds: string[]): Promise<ClientCalEvent[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from('events')
    .select('id, title, start_date, end_date, all_day, event_type_color, project_id')
    .in('project_id', projectIds);
  if (error) { console.error('getMyClientEvents failed', error); return []; }
  return (data ?? []).map(row => ({
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    allDay: row.all_day,
    eventTypeColor: row.event_type_color,
    projectId: row.project_id,
  }));
}
```

**Column-name check required:** run `grep -n "start_date\|end_date\|all_day\|event_type_color" app/src/data/eventStore.ts` to confirm exact column names before finalizing this step, same caveat as Step 1.

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/clientSessionStore.ts
git commit -m "feat(client-dashboard): add client-scoped project, deliverable and event fetchers"
```

---

### Task 6: `ClientHome.tsx` — real project cards

**Files:**
- Modify: `app/src/screens/ClientHome.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getMyClientProjects()` and `ClientProject` from Task 5.

- [ ] **Step 1: Add i18n keys**

In `app/src/locales/fr.json`, inside the existing `"clientHome": { ... }` block, add:

```json
"cardProgress": "Progression",
"cardDelivery": "Livraison prévue",
```

In `app/src/locales/en.json`, inside the matching `"clientHome": { ... }` block, add:

```json
"cardProgress": "Progress",
"cardDelivery": "Expected delivery",
```

- [ ] **Step 2: Replace the placeholder list with real cards**

Replace the full content of `app/src/screens/ClientHome.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getMyClientProjects, type ClientProject } from '../data/clientSessionStore';
import { logout } from '../data/authStore';

export function ClientHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ClientProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getMyClientProjects();
      if (!cancelled) setProjects(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '48px 32px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
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

        {projects === null && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>…</p>
        )}

        {projects !== null && projects.length === 0 && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('clientHome.empty')}</p>
        )}

        {projects !== null && projects.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/mon-espace/projets/${p.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.clientColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{p.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{p.phaseLabel}</span>
                    <div style={{ flex: 1, maxWidth: 140, height: 5, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${p.progress}%`, background: 'var(--accent)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{p.progress}%</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    {t('clientHome.cardDelivery')}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.deliveryDate}</p>
                </div>
                <SFIcon name="chevron-right" size={16} color="var(--text-3)" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/ClientHome.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(client-dashboard): replace placeholder project-id list with real project cards"
```

---

### Task 7: `ClientProjectHeader.tsx` — shared 4-tab nav for client project detail

**Files:**
- Create: `app/src/components/client/ClientProjectHeader.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getMyClientProjects()` from Task 5 (fetches once, finds by id — acceptable duplicate fetch for this small header; no shared cache needed at this scale).
- Produces: `export function ClientProjectHeader({ projectId }: { projectId: string })` — renders project name + back link + 4 `NavLink` tabs (Aperçu/Fichiers/Calendrier/Factures). Every Task 8-11 screen renders this at its top, mirroring how `ProjectHeaderBar` is independently rendered by each studio-side project screen.

- [ ] **Step 1: Add i18n keys**

In `app/src/locales/fr.json`, add a new top-level namespace:

```json
"clientProject": {
  "back": "Retour à mes projets",
  "tabOverview": "Aperçu",
  "tabFiles": "Fichiers",
  "tabCalendar": "Calendrier",
  "tabFinance": "Factures"
}
```

In `app/src/locales/en.json`:

```json
"clientProject": {
  "back": "Back to my projects",
  "tabOverview": "Overview",
  "tabFiles": "Files",
  "tabCalendar": "Calendar",
  "tabFinance": "Invoices"
}
```

- [ ] **Step 2: Create the component**

```tsx
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../ui';
import { getMyClientProjects, type ClientProject } from '../../data/clientSessionStore';

export function ClientProjectHeader({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [project, setProject] = useState<ClientProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getMyClientProjects();
      if (!cancelled) setProject(list.find(p => p.id === projectId) ?? null);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const tabs = [
    { label: t('clientProject.tabOverview'), path: `/mon-espace/projets/${projectId}`,             end: true },
    { label: t('clientProject.tabFiles'),    path: `/mon-espace/projets/${projectId}/fichiers`,     end: false },
    { label: t('clientProject.tabCalendar'), path: `/mon-espace/projets/${projectId}/calendrier`,   end: false },
    { label: t('clientProject.tabFinance'),  path: `/mon-espace/projets/${projectId}/finances`,     end: false },
  ];

  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <button
        onClick={() => navigate('/mon-espace')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10, fontFamily: 'var(--ff-text)' }}
      >
        <SFIcon name="chevron-left" size={13} color="var(--text-3)" />
        {t('clientProject.back')}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {project && <div style={{ width: 10, height: 10, borderRadius: '50%', background: project.clientColor, flexShrink: 0 }} />}
        <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--ff-display)', color: 'var(--text)' }}>
          {project?.name ?? '…'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
        {tabs.map(tab => (
          <NavLink key={tab.path} to={tab.path} end={tab.end} style={({ isActive }) => ({
            fontSize: 13, fontWeight: 500,
            color: isActive ? 'var(--text)' : 'var(--text-2)',
            textDecoration: 'none', paddingBottom: 6,
            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
          })}>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/client/ClientProjectHeader.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(client-dashboard): add shared 4-tab header for client project detail screens"
```

---

### Task 8: `ClientProjectApercu.tsx` — Aperçu tab

**Files:**
- Create: `app/src/screens/client/ClientProjectApercu.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `ClientProjectHeader` from Task 7, `getMyClientProjects()`/`getMyClientDeliverables(projectId)` and their types from Task 5.

- [ ] **Step 1: Add i18n keys**

`fr.json`, inside `"clientProject"`:

```json
"apercuPhaseLabel": "Phase actuelle",
"apercuProgressLabel": "Progression",
"apercuDeliverables": "Livrables partagés",
"apercuNoDeliverables": "Aucun livrable partagé pour le moment."
```

`en.json`, inside `"clientProject"`:

```json
"apercuPhaseLabel": "Current phase",
"apercuProgressLabel": "Progress",
"apercuDeliverables": "Shared deliverables",
"apercuNoDeliverables": "No shared deliverables yet."
```

- [ ] **Step 2: Create the screen**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { SFIcon } from '../../components/ui';
import {
  getMyClientProjects, getMyClientDeliverables,
  type ClientProject, type ClientDeliverable,
} from '../../data/clientSessionStore';

const PHASE_ORDER = ['preproduction', 'production', 'postproduction', 'livraison'];

export function ClientProjectApercu() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const [project, setProject] = useState<ClientProject | null>(null);
  const [deliverables, setDeliverables] = useState<ClientDeliverable[] | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const [projects, dels] = await Promise.all([
        getMyClientProjects(),
        getMyClientDeliverables(projectId),
      ]);
      if (cancelled) return;
      setProject(projects.find(p => p.id === projectId) ?? null);
      setDeliverables(dels);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!projectId) return null;
  const currentPhaseIdx = project ? PHASE_ORDER.indexOf(project.phase) : -1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {project && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 20 }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              {t('clientProject.apercuPhaseLabel')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {PHASE_ORDER.map((phase, i) => (
                <div key={phase} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i <= currentPhaseIdx ? 'var(--accent)' : 'var(--surface-3)',
                    color: i <= currentPhaseIdx ? 'var(--on-accent)' : 'var(--text-3)',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>
                    {i < currentPhaseIdx ? <SFIcon name="check" size={11} /> : i + 1}
                  </div>
                  {i < PHASE_ORDER.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: i < currentPhaseIdx ? 'var(--accent)' : 'var(--surface-3)' }} />
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>{project.phaseLabel}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${project.progress}%`, background: 'var(--accent)', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{project.progress}%</span>
            </div>
          </div>
        )}

        <div>
          <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            {t('clientProject.apercuDeliverables')}
          </p>
          {deliverables === null && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>…</p>}
          {deliverables !== null && deliverables.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientProject.apercuNoDeliverables')}</p>
          )}
          {deliverables !== null && deliverables.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deliverables.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <SFIcon name="package" size={14} color="var(--text-3)" />
                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{d.title}</span>
                  {d.status && <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{d.status}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/client/ClientProjectApercu.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(client-dashboard): add read-only Aperçu tab (phase progress + shared deliverables)"
```

---

### Task 9: `FileBrowser` — add `readOnly` prop, wire Fichiers tab

**Files:**
- Modify: `app/src/screens/FichiersGlobal.tsx`
- Create: `app/src/screens/client/ClientProjectFichiers.tsx`

**Interfaces:**
- Consumes: existing `FileBrowser({ initialNav, locked })` signature (confirmed at `app/src/screens/FichiersGlobal.tsx:1774`).
- Produces: `FileBrowser({ initialNav, locked, readOnly }: { initialNav?: NavLocation; locked?: boolean; readOnly?: boolean })` — when `readOnly` is true, every write entry point is hidden/disabled; navigation, preview, and double-click-to-open remain fully functional.

- [ ] **Step 1: Extend the component signature**

Locate the current signature — re-run `grep -n "export function FileBrowser" app/src/screens/FichiersGlobal.tsx` to confirm the exact line (was `:1774` at last check). Change:

```ts
export function FileBrowser({ initialNav, locked = false }: { initialNav?: NavLocation; embedded?: boolean; locked?: boolean }) {
```

to:

```ts
export function FileBrowser({ initialNav, locked = false, readOnly = false }: { initialNav?: NavLocation; embedded?: boolean; locked?: boolean; readOnly?: boolean }) {
```

- [ ] **Step 2: Gate the `canAdd`/`canAddFileAt` computations**

Re-run `grep -n "const canAdd = \|const canAddFileAt = " app/src/screens/FichiersGlobal.tsx` to confirm current line numbers (were `3138` and `2208` at last check). Change:

```ts
const canAdd = !isAtVirtualRoot && !isSpecialView;
```

to:

```ts
const canAdd = !isAtVirtualRoot && !isSpecialView && !readOnly;
```

And change:

```ts
const canAddFileAt = (loc: NavLocation) => canAddAt(loc) && (loc.scope !== 'root' || !!lockedScope);
```

to:

```ts
const canAddFileAt = (loc: NavLocation) => !readOnly && canAddAt(loc) && (loc.scope !== 'root' || !!lockedScope);
```

- [ ] **Step 3: Disable context menus (the sole path to rename/move/delete/trash actions)**

Re-run `grep -n "onContextMenu={e => handleFolderCtx\|onContextMenu={e => handleFileCtx" app/src/screens/FichiersGlobal.tsx` to find every call site (there were 4-5 at last check, one per grid/list/column render). For each one, wrap the call:

```tsx
onContextMenu={e => { if (!readOnly) handleFolderCtx(e, folder); }}
```

```tsx
onContextMenu={e => { if (!readOnly) handleFileCtx(e, file); }}
```

(Use the exact local variable name each call site already uses — `folder`/`f` or `file`/`f` — do not rename.)

- [ ] **Step 4: Disable drag-and-drop upload and folder drag/drop**

Re-run `grep -n "onDragOver={e => { if (e.dataTransfer" app/src/screens/FichiersGlobal.tsx` (the OS-file-drop overlay zone) and `grep -n "onDragOver={e => handleFolderDragOver\|onDrop={e => handleFolderDrop" app/src/screens/FichiersGlobal.tsx` (folder-to-folder drag targets). Wrap each:

```tsx
onDragOver={e => { if (!readOnly && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDraggingOver(true); } }}
onDrop={e => { e.preventDefault(); if (readOnly) return; setIsDraggingOver(false); if (e.dataTransfer.types.includes('Files')) processUploadedFiles(Array.from(e.dataTransfer.files)); }}
```

```tsx
onDragOver={e => { if (!readOnly) handleFolderDragOver(e, folder.id); }}
onDrop={e => { if (!readOnly) handleFolderDrop(e, folder.id); }}
```

- [ ] **Step 5: Hide the "Nouveau" toolbar button, "Vider la corbeille", and the empty-folder "Nouveau dossier" CTA**

Re-run `grep -n "Vider la corbeille\|Nouveau dossier" app/src/screens/FichiersGlobal.tsx` to find:
- the toolbar's "Nouveau" dropdown trigger (already effectively gated because it renders `newMenuItems()` items, but the trigger button itself should also be hidden — wrap its containing block with `{!readOnly && canAdd && ( ... )}` using whatever the existing gating condition already is, just adding `!readOnly &&` in front)
- the "Vider la corbeille" button (~line 3334-3345) — wrap with `{!readOnly && ( ... )}`
- the empty-folder CTA (~line 3646) — change `{!isSpecialView && <SFButton ...>}` to `{!isSpecialView && !readOnly && <SFButton ...>}`

- [ ] **Step 6: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 7: Create the client wrapper screen**

```tsx
import { useParams } from 'react-router-dom';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { FileBrowser } from '../FichiersGlobal';

export function ClientProjectFichiers() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FileBrowser
          initialNav={{ scope: 'project', scopeId: projectId, folderId: null }}
          locked
          readOnly
          key={projectId}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck again**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add app/src/screens/FichiersGlobal.tsx app/src/screens/client/ClientProjectFichiers.tsx
git commit -m "feat(client-dashboard): add read-only mode to FileBrowser, wire client Fichiers tab"
```

---

### Task 10: `ProjetCalendrier` — add `readOnly` prop, wire Calendrier tab

**Files:**
- Create: `app/src/components/calendar/ClientEventDetail.tsx`
- Modify: `app/src/screens/ProjetCalendrier.tsx`
- Create: `app/src/screens/client/ClientProjectCalendrier.tsx`

**Interfaces:**
- Consumes: existing `ProjetCalendrier({ embedded, projectIds })` signature (`app/src/screens/ProjetCalendrier.tsx:579`), existing `CalEvent` type (`app/src/components/calendar/calendarUtils.ts:64`).
- Produces: `ProjetCalendrier({ embedded, projectIds, readOnly }: { embedded?: boolean; projectIds?: string[]; readOnly?: boolean })`; new `ClientEventDetail({ event, onClose }: { event: CalEvent; onClose: () => void })`.

- [ ] **Step 1: Create `ClientEventDetail`**

```tsx
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../ui';
import { fmtTime } from './calendarUtils';
import type { CalEvent } from './calendarUtils';

export function ClientEventDetail({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 190, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 200,
        width: 360, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14,
        padding: 20, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: event.eventTypeColor, flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{event.title}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <SFIcon name="x" size={16} color="var(--text-3)" />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SFIcon name="calendar" size={13} color="var(--text-3)" />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {event.startDate.toLocaleDateString()}
            {!event.allDay && ` · ${fmtTime(event.startDate)} – ${fmtTime(event.endDate)}`}
          </span>
        </div>
        {event.description && (
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 10, whiteSpace: 'pre-wrap' }}>{event.description}</p>
        )}
      </div>
    </>
  );
}
```

**Note for implementer:** confirm `CalEvent`'s exact field names (`eventTypeColor`, `startDate`, `endDate`, `allDay`, `description`) with `grep -n "interface CalEvent" -A 15 app/src/components/calendar/calendarUtils.ts` before finalizing — adjust field names above if they differ, and drop the `description` block if that field doesn't exist on `CalEvent`.

- [ ] **Step 2: Add the `readOnly` prop to `ProjetCalendrier`**

Re-run `grep -n "export function ProjetCalendrier" app/src/screens/ProjetCalendrier.tsx` (was line 579). Change:

```ts
export function ProjetCalendrier({ embedded, projectIds: overrideIds }: { embedded?: boolean; projectIds?: string[] } = {}) {
```

to:

```ts
export function ProjetCalendrier({ embedded, projectIds: overrideIds, readOnly = false }: { embedded?: boolean; projectIds?: string[]; readOnly?: boolean } = {}) {
```

- [ ] **Step 3: Suppress create-event entry points**

Re-run `grep -n "SFButton variant=\"primary\" icon=\"plus\"" app/src/screens/ProjetCalendrier.tsx` (there were 2 "Nouvel événement" buttons, ~lines 705 and 713). Wrap each button's containing block with `{!readOnly && ( ... )}`.

Re-run `grep -n "setShowCreate(true)" app/src/screens/ProjetCalendrier.tsx` to find the day-cell-click handlers (there were 3, ~lines 676/683/688, passed as `onCreateNew`-style callbacks into `MonthView`/`TimeGridView`). At the top of each of those handler functions, add:

```ts
if (readOnly) return;
```

- [ ] **Step 4: Swap `EventDetail` for `ClientEventDetail` when read-only**

Re-run `grep -n "<EventDetail" -A 5 app/src/screens/ProjetCalendrier.tsx` to find the render call (was ~line 872). Change the surrounding conditional render from:

```tsx
{selectedEvent && (
  <EventDetail
    ...
    onClose={()=>setSelectedEvent(null)}
    onDelete={()=>handleDeleteEvent(selectedEvent.id)}
    ...
  />
)}
```

to:

```tsx
{selectedEvent && readOnly && (
  <ClientEventDetail event={selectedEvent} onClose={()=>setSelectedEvent(null)} />
)}
{selectedEvent && !readOnly && (
  <EventDetail
    ...
    onClose={()=>setSelectedEvent(null)}
    onDelete={()=>handleDeleteEvent(selectedEvent.id)}
    ...
  />
)}
```

(Keep every existing prop on `<EventDetail>` exactly as-is — only the wrapping condition changes.)

Add the import at the top of the file:

```ts
import { ClientEventDetail } from '../components/calendar/ClientEventDetail';
```

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 6: Create the client wrapper screen**

```tsx
import { useParams } from 'react-router-dom';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { ProjetCalendrier } from '../ProjetCalendrier';

export function ClientProjectCalendrier() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ProjetCalendrier embedded projectIds={[projectId]} readOnly />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck again**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add app/src/components/calendar/ClientEventDetail.tsx app/src/screens/ProjetCalendrier.tsx app/src/screens/client/ClientProjectCalendrier.tsx
git commit -m "feat(client-dashboard): add read-only mode to ProjetCalendrier, wire client Calendrier tab"
```

---

### Task 11: `ClientProjectFinances.tsx` — Factures tab

**Files:**
- Create: `app/src/screens/client/ClientProjectFinances.tsx`
- Modify: `app/src/data/financeStore.ts` (only if `getInvoicesByProject` isn't already usable client-side — see Step 1)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getInvoicesByProject(projectId): Invoice[]` — **but this reads from `financeStore.ts`'s studio-scoped in-memory cache**, which a client session never populates (it never calls `getStudioId()`). This task adds a client-scoped direct-fetch alternative instead of reusing the studio store.
- Produces: `export async function getMyClientInvoices(projectId: string): Promise<Invoice[]>` on `app/src/data/clientSessionStore.ts` (not `financeStore.ts` — keeps every client-scoped fetcher in one file, consistent with Task 5).

- [ ] **Step 1: Add `getMyClientInvoices` to `clientSessionStore.ts`**

Append to `app/src/data/clientSessionStore.ts`:

```ts
export interface ClientInvoice {
  id: string;
  number: string;
  title: string;
  amount: number;
  total: number;
  currency: string;
  status: string;
  issuedDate: string;
  dueDate: string;
}

export async function getMyClientInvoices(projectId: string): Promise<ClientInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, number, title, amount, total, currency, status, issued_date, due_date')
    .eq('project_id', projectId);
  if (error) { console.error('getMyClientInvoices failed', error); return []; }
  return (data ?? []).map(row => ({
    id: row.id,
    number: row.number,
    title: row.title,
    amount: row.amount,
    total: row.total,
    currency: row.currency,
    status: row.status,
    issuedDate: row.issued_date,
    dueDate: row.due_date,
  }));
}
```

This relies on the existing `invoices_select_client_access` policy from Step B — no new RLS needed.

- [ ] **Step 2: Add i18n keys**

`fr.json`, inside `"clientProject"`:

```json
"financesEmpty": "Aucune facture pour ce projet pour le moment.",
"financesAmount": "Montant",
"financesStatus": "Statut",
"financesDue": "Échéance"
```

`en.json`, inside `"clientProject"`:

```json
"financesEmpty": "No invoices for this project yet.",
"financesAmount": "Amount",
"financesStatus": "Status",
"financesDue": "Due date"
```

- [ ] **Step 3: Create the screen**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { getMyClientInvoices, type ClientInvoice } from '../../data/clientSessionStore';

export function ClientProjectFinances() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<ClientInvoice[] | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const list = await getMyClientInvoices(projectId);
      if (!cancelled) setInvoices(list);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!projectId) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {invoices === null && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>…</p>}
        {invoices !== null && invoices.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientProject.financesEmpty')}</p>
        )}
        {invoices !== null && invoices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invoices.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{inv.title}</p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginTop: 2 }}>{inv.number}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('clientProject.financesAmount')}</p>
                  <p style={{ fontSize: 13, color: 'var(--text)' }}>{inv.total.toFixed(2)} {inv.currency}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('clientProject.financesStatus')}</p>
                  <p style={{ fontSize: 13, color: 'var(--text)' }}>{inv.status}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('clientProject.financesDue')}</p>
                  <p style={{ fontSize: 13, color: 'var(--text)' }}>{inv.dueDate}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/clientSessionStore.ts app/src/screens/client/ClientProjectFinances.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(client-dashboard): add read-only Factures tab"
```

---

### Task 12: Routing — wire the 4 new routes + direct-landing redirect

**Files:**
- Modify: `app/src/main.tsx`
- Modify: `app/src/screens/ClientInvitationAccept.tsx`

**Interfaces:**
- Consumes: `ClientProjectApercu` (Task 8), `ClientProjectFichiers` (Task 9), `ClientProjectCalendrier` (Task 10), `ClientProjectFinances` (Task 11), existing `clientLoader` (`app/src/main.tsx`), existing `InvitationDetails`/`acceptClientAccount` return shape on `ClientInvitationAccept.tsx` (must confirm it carries a `projectId`, see Step 2 below).

- [ ] **Step 1: Add the 4 routes to `main.tsx`**

Add these imports near the existing `ClientHome` import:

```ts
import { ClientProjectApercu } from './screens/client/ClientProjectApercu';
import { ClientProjectFichiers } from './screens/client/ClientProjectFichiers';
import { ClientProjectCalendrier } from './screens/client/ClientProjectCalendrier';
import { ClientProjectFinances } from './screens/client/ClientProjectFinances';
```

Replace the single client route:

```ts
{ path: '/mon-espace', element: <ClientHome />, loader: clientLoader, errorElement: <RouteErrorPage /> },
```

with 5 flat routes, all sharing `clientLoader`:

```ts
{ path: '/mon-espace', element: <ClientHome />, loader: clientLoader, errorElement: <RouteErrorPage /> },
{ path: '/mon-espace/projets/:projectId', element: <ClientProjectApercu />, loader: clientLoader, errorElement: <RouteErrorPage /> },
{ path: '/mon-espace/projets/:projectId/fichiers', element: <ClientProjectFichiers />, loader: clientLoader, errorElement: <RouteErrorPage /> },
{ path: '/mon-espace/projets/:projectId/calendrier', element: <ClientProjectCalendrier />, loader: clientLoader, errorElement: <RouteErrorPage /> },
{ path: '/mon-espace/projets/:projectId/finances', element: <ClientProjectFinances />, loader: clientLoader, errorElement: <RouteErrorPage /> },
```

- [ ] **Step 2: Confirm the invitation carries a project id**

Run: `grep -n "interface InvitationDetails" -A 15 app/src/data/invitationStore.ts` and `grep -n "acceptClientAccount" -A 20 app/src/data/invitationStore.ts`.

A client invitation (`client_invitations` table) is created per-contact for a *client*, not tied to one specific project at invite time (per the Step B design, a contact gets access to all the client's current projects). "The project associated with the invitation" therefore means: after acceptance, pick any one project the newly-linked contact now has access to — the first one returned by `getMyClientProjectIds()` is a reasonable, simple choice (if the client has zero projects yet, fall back to `/mon-espace`).

- [ ] **Step 3: Update the redirect in `ClientInvitationAccept.tsx`**

Run: `grep -n "navigate('/mon-espace')\|acceptClientAccount(" app/src/screens/ClientInvitationAccept.tsx` to find the current post-acceptance redirect.

Change the success handler so that, after `acceptClientAccount(token)` resolves and `resetClientSessionCache()` is called (both already present per Step B), it does:

```ts
const { getMyClientProjectIds } = await import('../data/clientSessionStore');
const projectIds = await getMyClientProjectIds();
navigate(projectIds.length > 0 ? `/mon-espace/projets/${projectIds[0]}` : '/mon-espace', { replace: true });
```

(Use a top-level `import { getMyClientProjectIds } from '../data/clientSessionStore';` instead of the dynamic import above if `clientSessionStore` isn't already imported elsewhere in this file in a way that would create a cycle — check first with `grep -n "^import" app/src/screens/ClientInvitationAccept.tsx`.)

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/main.tsx app/src/screens/ClientInvitationAccept.tsx
git commit -m "feat(client-dashboard): wire 4-tab project detail routes, land in project after invite acceptance"
```

---

### Task 13: Manual verification walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Demo-mode walkthrough (Claude can do this directly)**

Since client accounts don't exist in demo mode, `isClientSession()` always returns `false` there — the new screens can only be reached by a real client session. Instead, verify in demo mode:
- The studio side still works unchanged: open a project's Fichiers/Calendrier tabs as a studio user, confirm upload/create/delete/drag-drop still all work exactly as before (regression check on the new `readOnly`/`locked` props, which must default to their old behavior when omitted).
- `npm run build` succeeds (full typecheck + production build) — run `cd app && npm run build`.

- [ ] **Step 2: Add a real-account test to the manual checklist**

Add a new entry to `docs/tests-manuels.md` under a new `## Étape C — Tableau de bord client` section:

```markdown
## Étape C — Tableau de bord client

- [ ] **Parcours client complet** : connecte-toi avec un compte client réel (voir Étape B) → confirme que « Mes projets » affiche de vraies cartes (nom, progression, date) au lieu d'ID bruts → ouvre un projet → parcours les 4 onglets (Aperçu, Fichiers, Calendrier, Factures) → confirme qu'aucune action d'écriture n'est possible (pas de bouton créer/supprimer/modifier visible nulle part) → invite un nouveau contact pour ce client → confirme qu'il voit immédiatement tous les projets existants du client sans intervention manuelle → crée un nouveau projet pour ce client → confirme que les contacts existants y ont accès automatiquement.
  - Pourquoi : nécessite un vrai compte client (mot de passe réel) — Claude ne peut jamais créer de compte ni entrer de mot de passe, même pour tester.
  - Rappel : exécute d'abord la migration `docs/superpowers/specs/2026-07-25-client-dashboard-events-rls-migration.sql` dans Supabase → SQL Editor, sinon l'onglet Calendrier restera vide même avec des événements existants.
```

- [ ] **Step 3: Commit**

```bash
git add docs/tests-manuels.md
git commit -m "docs: add Étape C manual test checklist entry"
```

---

### Task 14: Final whole-branch review

- [ ] **Step 1: Run the full build one more time**

Run: `cd app && npm run build`
Expected: TypeScript check + production build both succeed with no errors.

- [ ] **Step 2: Request a final review**

Use superpowers:requesting-code-review against the full diff since Task 1's first commit, covering: security (no new write path reachable from a client session; RLS additive only), spec compliance against `docs/superpowers/specs/2026-07-25-client-dashboard-design.md`, and code quality (no placeholder code, consistent naming with existing `Client*` conventions).

- [ ] **Step 3: Address any findings, then hand off**

Use superpowers:finishing-a-development-branch to decide how to wrap up (this repo commits directly to `master` — confirm with the user before any `git push`).
