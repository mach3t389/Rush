# Projet indépendant du client + onglets modulaires — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Project.clientId` optional (personal projects), and add three per-project module toggles (`calendarEnabled`, `filesEnabled`, `financeEnabled`) that hide the corresponding tab and filter the project out of every global view (Calendrier global, Fichiers global, Finances) when off.

**Architecture:** One new Supabase migration (column changes only, all backward-compatible defaults). `Project` type gains 3 required booleans + optional client fields. `projectStore.ts`'s row-mapping functions and `updateProject` gain the new fields plus the "clearing clientId forces financeEnabled=false" rule. The creation wizard and the shared edit panel both get UI for the new fields. Every global-view screen that lists/filters projects gets one extra predicate per relevant module flag.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres), no automated test suite in this repo — verification is manual: `npm run build` (typecheck) after every task, then a live check in the dev server preview (per this repo's established convention — see CLAUDE.md, "Il n'y a pas de tests automatisés").

**Design doc:** `docs/superpowers/specs/2026-08-03-project-client-optional-modular-tabs-design.md` — read this first for the "why".

## Global Constraints

- `financeEnabled` can only be `true` when `clientId` is set — enforced in `updateProject()` (clearing `clientId` forces `financeEnabled: false` in the same call) and in every UI checkbox for Finance (disabled/unchecked when no client is selected).
- All 3 new Supabase columns are `not null default true` — existing projects must show **zero visible change** after the migration runs.
- `calendarEnabled`/`filesEnabled`/`financeEnabled` are typed as required `boolean` on `Project` (not optional) — every code path that constructs a `Project` object must supply all three.
- Filtering a project out of a global view (Calendrier global, Fichiers global, Finances) must never delete or touch its underlying data (events, files, invoices) — it's a display filter only, re-enabling the module must make everything reappear unchanged.
- Every new user-facing string goes through `t('projects.<key>')` in both `app/src/locales/fr.json` and `en.json`, added at the same relative position in both files — never hard-coded text (CLAUDE.md rule).
- Run `npm run build` after every task and confirm 0 errors before moving to the next task.

---

### Task 1: Migration SQL + `Project` type

**Files:**
- Create: `docs/superpowers/specs/2026-08-03-project-client-optional-modular-tabs-migration.sql`
- Modify: `app/src/types/index.ts:43-73` (the `Project` interface)

**Interfaces:**
- Produces: `Project.clientId?: string | null`, `Project.clientName?: string`, `Project.clientColor?: string`, `Project.calendarEnabled: boolean`, `Project.filesEnabled: boolean`, `Project.financeEnabled: boolean` — every later task in this plan constructs or reads these exact field names.

- [ ] **Step 1: Write the migration SQL file**

```sql
-- À exécuter manuellement dans Supabase → SQL Editor.
alter table projects
  alter column client_id drop not null,
  add column if not exists calendar_enabled boolean not null default true,
  add column if not exists files_enabled boolean not null default true,
  add column if not exists finance_enabled boolean not null default true;
```

- [ ] **Step 2: Update the `Project` interface**

In `app/src/types/index.ts`, replace:

```ts
  clientId: string;
  clientName: string;
  clientColor: string;
```

with:

```ts
  clientId?: string | null;
  clientName?: string;
  clientColor?: string;
  calendarEnabled: boolean;
  filesEnabled: boolean;
  financeEnabled: boolean;
```

(Leave every other field in the interface untouched — insert the 3 new booleans right after `clientColor`, before `phase`.)

- [ ] **Step 3: Verify build**

Run: `npm run build` (from `app/`)
Expected: TypeScript errors at every place that constructs a `Project` literal without the 3 new required fields, and at every place reading `.clientId`/`.clientName`/`.clientColor` as non-optional — this is expected and intentional; each subsequent task fixes its own set of these errors. Do not attempt to fix all errors in this task — just confirm the error list matches "missing calendarEnabled/filesEnabled/financeEnabled" and "clientId possibly undefined/null", not something unrelated.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-03-project-client-optional-modular-tabs-migration.sql app/src/types/index.ts
git commit -m "feat(projects): add optional client + modular-tab fields to Project type"
```

---

### Task 2: `projectStore.ts` — row mapping + `updateProject` enforcement

**Files:**
- Modify: `app/src/data/projectStore.ts` (`ProjectRow` interface, `toProject`, `toRow`, `toRowPatch`, `updateProject`, `addSupabaseProject`'s `syncNewProjectAcrossClientContacts` call)

**Interfaces:**
- Consumes: `Project.calendarEnabled/filesEnabled/financeEnabled` (Task 1).
- Produces: `addProject()`/`updateProject()` now correctly round-trip the 3 new fields to/from Supabase, and `updateProject(id, { clientId: null })` always also sets `financeEnabled: false` in the same write.

- [ ] **Step 1: Add the 3 columns to `ProjectRow`**

In `app/src/data/projectStore.ts`, in the `ProjectRow` interface, change:

```ts
  client_id: string;
  client_name: string;
  client_color: string;
```

to:

```ts
  client_id: string | null;
  client_name: string | null;
  client_color: string | null;
  calendar_enabled: boolean;
  files_enabled: boolean;
  finance_enabled: boolean;
```

(insert the 3 new lines right after `client_color`, before `phase`.)

- [ ] **Step 2: Update `toProject` (row → Project)**

Change:

```ts
    clientId: row.client_id,
    clientName: row.client_name,
    clientColor: row.client_color,
```

to:

```ts
    clientId: row.client_id ?? undefined,
    clientName: row.client_name ?? undefined,
    clientColor: row.client_color ?? undefined,
    calendarEnabled: row.calendar_enabled,
    filesEnabled: row.files_enabled,
    financeEnabled: row.finance_enabled,
```

- [ ] **Step 3: Update `toRow` (Project → row, insert)**

Change:

```ts
    client_id: p.clientId,
    client_name: p.clientName,
    client_color: p.clientColor,
```

to:

```ts
    client_id: p.clientId ?? null,
    client_name: p.clientName ?? null,
    client_color: p.clientColor ?? null,
    calendar_enabled: p.calendarEnabled,
    files_enabled: p.filesEnabled,
    finance_enabled: p.financeEnabled,
```

- [ ] **Step 4: Update `toRowPatch` (partial updates)**

Right after the existing `if (updates.clientColor !== undefined) patch.client_color = updates.clientColor;` line, add:

```ts
    if (updates.calendarEnabled !== undefined) patch.calendar_enabled = updates.calendarEnabled;
    if (updates.filesEnabled !== undefined) patch.files_enabled = updates.filesEnabled;
    if (updates.financeEnabled !== undefined) patch.finance_enabled = updates.financeEnabled;
```

Also change the existing `client_id`/`client_name`/`client_color` patch lines to allow clearing them to `null`:

```ts
    if (updates.clientId !== undefined) patch.client_id = updates.clientId ?? null;
    if (updates.clientName !== undefined) patch.client_name = updates.clientName ?? null;
    if (updates.clientColor !== undefined) patch.client_color = updates.clientColor ?? null;
```

- [ ] **Step 5: Enforce "clearing clientId forces financeEnabled=false" in `updateProject`**

Change the top of `updateProject`:

```ts
export function updateProject(id: string, updates: Partial<Project>): void {
  const stamped = { ...updates, modifiedAt: new Date().toISOString() };
```

to:

```ts
export function updateProject(id: string, updates: Partial<Project>): void {
  // Finance requires a client to bill — never let a write leave the two
  // fields in an inconsistent state (see design doc's Finance ↔ Client rule).
  // Triggers whenever this call explicitly clears clientId (null/empty
  // string), not when clientId is simply absent from the patch.
  const stamped: Partial<Project> = { ...updates, modifiedAt: new Date().toISOString() };
  if ('clientId' in updates && !updates.clientId) {
    stamped.financeEnabled = false;
  }
```

- [ ] **Step 6: Guard the client-contacts sync call for a null client**

Find `addSupabaseProject` and its call to `syncNewProjectAcrossClientContacts(p.id, p.clientId)`. Change it to skip the call entirely when there's no client:

```ts
  if (p.clientId) {
    await syncNewProjectAcrossClientContacts(p.id, p.clientId);
  }
```

(Check the exact surrounding code first — this call may already be inside an `await` chain; keep it `await`ed the same way it is today, just wrap it in the `if`.)

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: The `projectStore.ts`-related errors from Task 1 are gone. Remaining errors should now be confined to call sites that construct a `Project` literal (the wizard) or read `.clientName`/`.clientColor` assuming they're always defined (UI display code) — those are fixed in later tasks.

- [ ] **Step 8: Commit**

```bash
git add app/src/data/projectStore.ts
git commit -m "feat(projects): thread optional client + modular-tab fields through Supabase row mapping"
```

---

### Task 3: "Nouveau projet" wizard — personal project + module checkboxes

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx` (`NewProjectModal`: state, `canNext`, the 'info' step JSX, `create()`)
- Modify: `app/src/locales/fr.json` and `app/src/locales/en.json` (new keys under `"projects"`)

**Interfaces:**
- Consumes: `Project` type from Task 1, `updateProject`/`addProject` from Task 2.
- Produces: a project created via this wizard always has `calendarEnabled`/`filesEnabled`/`financeEnabled` set, and `clientId` is `undefined` when "Projet personnel" was chosen.

- [ ] **Step 1: Add locale keys**

In `app/src/locales/fr.json`, inside the `"projects"` object, right after the existing `"firstClientHint"` key, add:

```json
    "personalProjectOption": "Créer un projet personnel, sans client",
    "personalProjectHint": "Vous pourrez rattacher un client plus tard depuis les réglages du projet.",
    "featuresLabel": "Fonctionnalités de ce projet",
    "moduleCalendar": "Calendrier",
    "moduleFiles": "Fichiers",
    "moduleFinance": "Finance",
    "moduleFinanceRequiresClient": "Nécessite un client",
```

In `app/src/locales/en.json`, at the same relative position:

```json
    "personalProjectOption": "Create a personal project, no client",
    "personalProjectHint": "You can attach a client later from the project's settings.",
    "featuresLabel": "This project's features",
    "moduleCalendar": "Calendar",
    "moduleFiles": "Files",
    "moduleFinance": "Finance",
    "moduleFinanceRequiresClient": "Requires a client",
```

- [ ] **Step 2: Add wizard state**

In `NewProjectModal`, right after the existing `const [newClientName, setNewClientName] = useState('');` line, add:

```ts
  const [isPersonalProject, setIsPersonalProject] = useState(false);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [filesEnabled, setFilesEnabled]       = useState(true);
  const [financeEnabled, setFinanceEnabled]   = useState(false);
```

(`financeEnabled` starts `false` — it only flips to the "default true when a client is chosen" behavior via Step 4 below, which reacts to client selection.)

- [ ] **Step 3: Update `canNext` for the 'info' step**

Change:

```ts
    : step === 'info' ? name.trim().length > 0 && (clients.length > 0 || newClientName.trim().length > 0)
```

to:

```ts
    : step === 'info' ? name.trim().length > 0 && (isPersonalProject || clients.length > 0 || newClientName.trim().length > 0)
```

- [ ] **Step 4: Add the "Projet personnel" toggle and auto-manage `financeEnabled`**

In the client-picker block (right after the `<label>` for `t('projects.client')`, before the `{clients.length === 0 ? (...) : (...)}` ternary), add:

```tsx
                <button
                  type="button"
                  onClick={() => {
                    const next = !isPersonalProject;
                    setIsPersonalProject(next);
                    if (next) { setClientId(''); setNewClientName(''); setFinanceEnabled(false); }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 10,
                    padding: '9px 12px', borderRadius: 9, border: `1.5px solid ${isPersonalProject ? 'var(--accent)' : 'var(--border)'}`,
                    background: isPersonalProject ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)', color: 'var(--text)',
                    fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <SFIcon name={isPersonalProject ? 'check-square' : 'square'} size={14} color={isPersonalProject ? 'var(--accent)' : 'var(--text-3)'} />
                  {t('projects.personalProjectOption')}
                </button>
                {isPersonalProject && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>{t('projects.personalProjectHint')}</p>
                )}
```

Then wrap the existing `{clients.length === 0 ? (...) : (...)}` block in `{!isPersonalProject && (...)}` so the client picker disappears entirely once "Projet personnel" is toggled on.

Also add a small effect so choosing a real client after having none defaults Finance on, and losing the client turns it back off — right after the state declarations from Step 2, add:

```ts
  useEffect(() => {
    if (isPersonalProject) { setFinanceEnabled(false); return; }
    const hasClient = clientId || newClientName.trim().length > 0;
    setFinanceEnabled(!!hasClient);
  }, [isPersonalProject, clientId, newClientName]);
```

(`useEffect` and `SFIcon` are already imported in this file — verify before assuming, but both are used extensively elsewhere in `ProjectsListView.tsx`.)

- [ ] **Step 5: Add the module checkboxes**

Right before the closing `</div>` that ends the description textarea's parent (end of the `'info'` step block), add a new block:

```tsx
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.featuresLabel')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { key: 'calendar', label: t('projects.moduleCalendar'), checked: calendarEnabled, onToggle: () => setCalendarEnabled(v => !v), disabled: false },
                    { key: 'files',    label: t('projects.moduleFiles'),    checked: filesEnabled,    onToggle: () => setFilesEnabled(v => !v),    disabled: false },
                    { key: 'finance',  label: t('projects.moduleFinance'),  checked: financeEnabled,  onToggle: () => setFinanceEnabled(v => !v),  disabled: isPersonalProject || (!clientId && !newClientName.trim()) },
                  ].map(m => (
                    <button
                      key={m.key}
                      type="button"
                      disabled={m.disabled}
                      onClick={m.onToggle}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9,
                        border: '1px solid var(--border)', background: 'var(--surface-2)',
                        color: m.disabled ? 'var(--text-3)' : 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)',
                        cursor: m.disabled ? 'not-allowed' : 'pointer', opacity: m.disabled ? 0.6 : 1, textAlign: 'left',
                      }}
                    >
                      <SFIcon name={m.checked ? 'check-square' : 'square'} size={14} color={m.checked && !m.disabled ? 'var(--accent)' : 'var(--text-3)'} />
                      {m.label}
                      {m.key === 'finance' && m.disabled && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{t('projects.moduleFinanceRequiresClient')}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
```

- [ ] **Step 6: Wire the new fields into `create()`**

In `create()`, change the `if (!client)` branch's guard so it only runs when NOT a personal project:

```ts
    const allClients = getClients().filter(c => !c.archived);
    let client: Client | undefined = isPersonalProject ? undefined : (allClients.find(c => c.id === clientId) ?? allClients[0]);
    if (!isPersonalProject && !client) {
      // ... existing auto-create-client block, unchanged ...
    }
```

Then in the `newProject` object literal, change:

```ts
      clientId: client.id,
      clientName: client.name,
```

to:

```ts
      clientId: client?.id,
      clientName: client?.name,
```

and add, right after `description: description.trim() || undefined,`:

```ts
      calendarEnabled,
      filesEnabled,
      financeEnabled: financeEnabled && !!client,
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: `ProjectsListView.tsx` errors from Tasks 1-2 are gone.

- [ ] **Step 8: Manual verification in the browser**

Start the dev server, open "Nouveau projet", confirm: (a) toggling "Projet personnel" hides the client picker and greys out the Finance checkbox; (b) picking a real client auto-checks Finance; (c) creating a personal project succeeds with no client and no crash (this directly builds on the zero-client crash fix from earlier this session — re-verify it still holds); (d) creating a project with a client still works as before.

- [ ] **Step 9: Commit**

```bash
git add app/src/components/ProjectsListView.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(projects): personal-project option + modular feature checkboxes in the creation wizard"
```

---

### Task 4: Project tab bar — hide disabled modules

**Files:**
- Modify: `app/src/components/ProjectHeaderBar.tsx` (the `allTabs`/`tabs` filter)

**Interfaces:**
- Consumes: `Project.calendarEnabled/filesEnabled/financeEnabled` (Task 1/2).

- [ ] **Step 1: Extend the existing tab filter**

Change:

```ts
  const tabs = project.isTemplateDraft
    ? allTabs.filter(tb => TEMPLATE_DRAFT_TAB_KEYS.includes(tb.key))
    : allTabs;
```

to:

```ts
  const tabs = project.isTemplateDraft
    ? allTabs.filter(tb => TEMPLATE_DRAFT_TAB_KEYS.includes(tb.key))
    : allTabs.filter(tb => {
        if (tb.key === 'calendar') return project.calendarEnabled;
        if (tb.key === 'files')    return project.filesEnabled;
        if (tb.key === 'finance')  return project.financeEnabled && !!project.clientId;
        return true;
      });
```

- [ ] **Step 2: Fix the client-name display for a personal project**

Find the line rendering `project.clientName` (or similar) as the project's subtitle. Wrap it so a personal project shows something sensible instead of `undefined`:

```tsx
<p ...>{project.clientId ? project.clientName : t('projects.personalProjectBadge')}</p>
```

Add the `personalProjectBadge` key (`"Projet personnel"` / `"Personal project"`) to both locale files under `"projects"`, next to the keys added in Task 3.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Manual verification**

Open a personal project (created in Task 3's manual check) and confirm the Calendrier/Fichiers/Finance tabs are hidden appropriately per whatever was toggled, and the header shows "Projet personnel" instead of a blank/undefined client name.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ProjectHeaderBar.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(projects): hide disabled module tabs, show personal-project badge in header"
```

---

### Task 5: Project edit panel — module toggles + optional client

**Files:**
- Modify: `app/src/components/ProjectCard.tsx` (`EditUpdates` interface, `ProjectEditPanel` state/JSX/`save()`, and the `handleSave` at line ~312 that calls `updateProject`)
- Modify: `app/src/components/ProjectHeaderBar.tsx` (its own `ProjectEditPanel` usage + save handler)
- Modify: `app/src/components/ProjectsListView.tsx` (its `ProjectEditPanel` usage + `handleSave` at line ~653)

**Interfaces:**
- Consumes: `EditUpdates` (extended here), `updateProject` (Task 2).
- Produces: `EditUpdates` gains `calendarEnabled: boolean; filesEnabled: boolean; financeEnabled: boolean;` — every one of the 3 call sites must pass these through to `updateProject` or the toggle silently does nothing at 2 of the 3 sites.

- [ ] **Step 1: Extend `EditUpdates`**

In `ProjectCard.tsx`, change:

```ts
export interface EditUpdates {
  name: string; color: string;
  status: Status; statusLabel: string;
  phase: Phase; phaseLabel: string;
  deliveryDate: string;
  budget?: number;
  description?: string;
}
```

to:

```ts
export interface EditUpdates {
  name: string; color: string;
  status: Status; statusLabel: string;
  phase: Phase; phaseLabel: string;
  deliveryDate: string;
  budget?: number;
  description?: string;
  calendarEnabled: boolean;
  filesEnabled: boolean;
  financeEnabled: boolean;
}
```

- [ ] **Step 2: Add state + JSX in `ProjectEditPanel`**

Right after `const [lDescription, setLDescription] = useState(p.description ?? '');`, add:

```ts
  const [lCalendarEnabled, setLCalendarEnabled] = useState(p.calendarEnabled);
  const [lFilesEnabled, setLFilesEnabled]       = useState(p.filesEnabled);
  const [lFinanceEnabled, setLFinanceEnabled]   = useState(p.financeEnabled);
```

Right after the Budget field block (the one ending `</div>` before Description), add a block reusing the same checkbox pattern from Task 3 Step 5 (same `[{key,label,checked,onToggle,disabled}].map(...)` structure), with `disabled` for finance being `!p.clientId` (a project's client can't be changed from this panel per this task's scope — client attach/detach is a separate, later UI addition if ever needed; for now Finance stays locked to whatever `p.clientId` already is).

- [ ] **Step 3: Update `save()`**

Add to the object passed to `onSave`:

```ts
      calendarEnabled: lCalendarEnabled,
      filesEnabled: lFilesEnabled,
      financeEnabled: lFinanceEnabled && !!p.clientId,
```

- [ ] **Step 4: Update all 3 `handleSave` call sites**

In `ProjectCard.tsx` (~line 312), `ProjectHeaderBar.tsx`, and `ProjectsListView.tsx` (~line 653), each `updateProject(p.id, { ... })` call built from `EditUpdates` must add:

```ts
      calendarEnabled: u.calendarEnabled,
      filesEnabled: u.filesEnabled,
      financeEnabled: u.financeEnabled,
```

(match each file's existing variable name for the `EditUpdates` parameter — likely `u` per the `ProjectCard.tsx` snippet already gathered, verify per-file before editing.)

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: 0 errors — this should be the last task clearing type errors introduced back in Task 1.

- [ ] **Step 6: Manual verification**

Open a project's edit panel (any of the 3 entry points), toggle a module off, save, confirm the corresponding tab disappears from the header immediately (Task 4's filter re-renders from the same `project` object).

- [ ] **Step 7: Commit**

```bash
git add app/src/components/ProjectCard.tsx app/src/components/ProjectHeaderBar.tsx app/src/components/ProjectsListView.tsx
git commit -m "feat(projects): module toggles in the project edit panel, wired through all 3 call sites"
```

---

### Task 6: Calendrier global — filter by `calendarEnabled`

**Files:**
- Modify: `app/src/screens/CalendrierGlobal.tsx` (lines ~204, ~810, and the event-list consumer of `selectedProjects`)

- [ ] **Step 1: Filter the `ProjectSelect` dropdown**

Change:

```ts
    ...getProjects().filter(p => !p.archived).map(p => ({ id: p.id, label: `${p.name} — ${p.clientName}`, color: p.clientColor as string | null, italic: false })),
```

to:

```ts
    ...getProjects().filter(p => !p.archived && p.calendarEnabled).map(p => ({ id: p.id, label: p.clientName ? `${p.name} — ${p.clientName}` : p.name, color: p.clientColor ?? 'var(--text-3)', italic: false })),
```

(the `label`/`color` change handles a personal project having no `clientName`/`clientColor` — not strictly part of this task's filtering goal, but required for the type change from Task 1 to compile here.)

- [ ] **Step 2: Filter the sidebar project-filter checklist**

Change:

```ts
          const allProjects = [{ id: '', name: t('calendar.withoutProject'), color: 'var(--text-3)' }, ...getProjects().filter(p=>p.status!=='neutral' && !p.archived).map(p=>({ id: p.id, name: p.name, color: p.clientColor }))];
```

to:

```ts
          const allProjects = [{ id: '', name: t('calendar.withoutProject'), color: 'var(--text-3)' }, ...getProjects().filter(p=>p.status!=='neutral' && !p.archived && p.calendarEnabled).map(p=>({ id: p.id, name: p.name, color: p.clientColor ?? 'var(--text-3)' }))];
```

- [ ] **Step 3: Drop events belonging to a calendar-disabled project from the rendered list**

Find where `resolveEvents(...)`'s output is actually rendered/filtered against the selected-projects state (search for where `selectedProjects` — the Set/array driven by the sidebar checklist from Step 2 — is used to filter the events array before passing to `MonthView`/`TimeGridView`). Add a project-flag check there: for each event, resolve its project via `getProjects().find(...)` (or reuse whatever `resolveEvents` already attached) and exclude it if that project exists and `calendarEnabled === false`. Events with no `projectId` at all are unaffected.

Since the exact variable name of the final filtered list wasn't captured verbatim in the research pass for this file, locate it by searching for `selectedProjects` usage in `CalendrierGlobal.tsx` before writing this step's diff, and confirm the change compiles and behaves correctly via the manual check below rather than assuming a specific line number.

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Manual verification**

Disable Calendrier on a project that has existing events, reload Calendrier global, confirm: the project no longer appears in the filter dropdown/checklist, and its events no longer render on the grid. Re-enable Calendrier on that project, confirm the events reappear unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/CalendrierGlobal.tsx
git commit -m "feat(calendar): hide calendar-disabled projects and their events from Calendrier global"
```

---

### Task 7: Fichiers global — filter by `filesEnabled`

**Files:**
- Modify: `app/src/screens/FichiersGlobal.tsx` (pinned-projects filter ~line 853, client-projects listing ~lines 3572/3582, client card project counts ~lines 3546/3559)

- [ ] **Step 1: Extend the pinned-projects filter (already touched earlier this session for the archived-projects fix)**

Change:

```ts
          const pinnedProjects = pinnedIds.map(id => projects.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p && !p.archived);
```

to:

```ts
          const pinnedProjects = pinnedIds.map(id => projects.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p && !p.archived && p.filesEnabled);
```

- [ ] **Step 2: Filter the client-projects listing (both grid and list view branches)**

At both occurrences of:

```ts
                  {projects.filter(p => p.clientId === location.scopeId).map(p => (
```

and

```ts
                  {projects.filter(p => p.clientId === location.scopeId).map(p => {
```

change the predicate to:

```ts
                  {projects.filter(p => p.clientId === location.scopeId && p.filesEnabled).map(p => (
```

(same change, second occurrence — keep the rest of each block, including the `{` vs `(` styles, exactly as-is.)

- [ ] **Step 3: Filter the client-card project counts**

At both:

```ts
count={projects.filter(p => p.clientId === c.id).length}
```

change to:

```ts
count={projects.filter(p => p.clientId === c.id && p.filesEnabled).length}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Manual verification**

Disable Fichiers on a project, reload Fichiers global, confirm: it disappears from "Projets épinglés" (if pinned) and from that client's project list/count in the Fichiers browser. Re-enable, confirm it reappears with its files intact.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/FichiersGlobal.tsx
git commit -m "feat(fichiers): hide files-disabled projects from Fichiers global listings and counts"
```

---

### Task 8: Finances — filter by `financeEnabled`

**Files:**
- Modify: `app/src/screens/Finances.tsx` (invoice-creation project picker ~line 683, main filter dropdown ~line 1174, move-invoice search ~line 1066)

- [ ] **Step 1: Filter the invoice-creation project picker**

Change:

```ts
  const clientProjects = allProjects.filter(p => p.clientId === clientId);
```

to:

```ts
  const clientProjects = allProjects.filter(p => p.clientId === clientId && p.financeEnabled);
```

- [ ] **Step 2: Filter the main Finances project-filter dropdown**

Change:

```ts
  const clientFilterProjects = clientFilter ? allProjects.filter(p => p.clientId === clientFilter) : [];
```

to:

```ts
  const clientFilterProjects = clientFilter ? allProjects.filter(p => p.clientId === clientFilter && p.financeEnabled) : [];
```

- [ ] **Step 3: Filter the move-invoice-to-project search**

Change:

```ts
  const filtered = projects.filter(p => !p.archived && p.name.toLowerCase().includes(search.toLowerCase()));
```

to:

```ts
  const filtered = projects.filter(p => !p.archived && p.financeEnabled && !!p.clientId && p.name.toLowerCase().includes(search.toLowerCase()));
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Manual verification**

Disable Finance on a project that has existing invoices, reload Finances, confirm the project no longer appears in any project picker/filter/search there, but its existing invoices are untouched in the database (spot-check via Supabase if needed — they should simply not be reachable through project-scoped UI, not deleted). Re-enable, confirm it reappears.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Finances.tsx
git commit -m "feat(finances): hide finance-disabled projects from Finances project pickers/filters"
```

---

### Task 9: Final migration execution + end-to-end verification

**Files:** none (manual Supabase step + full regression pass)

- [ ] **Step 1: Run the migration**

Ask the user to execute `docs/superpowers/specs/2026-08-03-project-client-optional-modular-tabs-migration.sql` in Supabase → SQL Editor (per this repo's established manual-migration convention — nothing runs it automatically).

- [ ] **Step 2: Confirm existing projects are unaffected**

In a real (non-demo) session, open several pre-existing projects created before this migration and confirm all tabs (Calendrier/Fichiers/Finance) are still visible exactly as before — this is the migration's core promise (`default true` on all 3 new columns).

- [ ] **Step 3: End-to-end new-project flow**

Create one personal project (no client) and one client-attached project with all 3 modules on, confirm both behave correctly across Travail, Calendrier global, Fichiers global, and Finances.

- [ ] **Step 4: Whole-branch review**

Use superpowers:requesting-code-review's code-reviewer on the full branch diff before merging, per this plan's global constraints (Finance/client consistency rule, no data loss, locale key parity).
