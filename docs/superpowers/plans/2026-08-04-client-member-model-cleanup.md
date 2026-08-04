# Client/Membre/Projet Model Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore "Clients" and "Équipe" as their own top-level nav destinations (reusing the pre-existing, working `Clients.tsx`/`FicheClient.tsx`/`MonEquipe.tsx` screens instead of today's `Membres.tsx` hub), flip all "Groupe"/"Group" display text back to "Client", fix the project-tab "Équipe" naming collision, and close the client/project/member behavior gaps found during today's audit (silent approval fan-out, archive/delete inconsistency, wizard's single-purpose client picker).

**Architecture:** No data-model change — `Project.clientId` (optional, single) and `Project.members` (flat array) were already correct; every change here is UI/routing/copy plus three behavior fixes. `Membres.tsx` (today's hub) is deleted; its two genuinely new/valuable pieces (the permission-filter UI logic and the real-time project-count subscription fix) are ported into the restored screens before deletion, not lost.

**Tech Stack:** React 19 + TypeScript, react-router-dom v7 data router, i18next — same stack as the rest of the app, no new dependencies.

## Global Constraints

- Vocabulary, locked (from `docs/superpowers/specs/2026-08-04-client-member-model-design.md`): **Client** = the billed company (never "Groupe"); **Contact** = a client-side portal person (never "Membre client"); **Membre** = an internal studio person; **Équipe** = the internal organization as a whole (top-level nav only — never a per-project subset).
- Never toun `groupByPriority`/`ungroupByPriority` i18n keys (`fr.json`/`en.json`) — unrelated "group" sense (task-list sort verb), not the client entity.
- Never touch the `clientPreview`/`clientHome`/`clientProject`/`clientInvitation` i18n namespaces' *use* of the word "client" for the portal-facing concept — that sense is correct and stays.
- `Project.clientId`/`clientName`/`clientColor` field names in code are unchanged (only display text and behavior change) — do not rename these fields.
- Every task must leave `npx tsc --noEmit -p tsconfig.app.json` (run from `app/`) clean before being marked complete.
- This repo has no automated test suite — verification is `tsc` + manual walkthrough in the browser preview (per `CLAUDE.md`), not `pytest`-style unit tests.

---

### Task 1: Restore navigation — Clients + Équipe as top-level items, remove the Membres hub

**Files:**
- Modify: `app/src/components/layout/Sidebar.tsx:468-472` (nav items)
- Modify: `app/src/main.tsx:34-35, 145-153` (routes/imports)
- Delete: `app/src/screens/Membres.tsx`
- Delete: `app/src/screens/FicheIndividu.tsx` (its content was a full-page person view that didn't exist before today's hub; internal member details are handled by `ProfileEditPanel`/`MonEquipe.tsx`'s own panel, external contact details by `FicheClient.tsx`'s Contacts tab — both already exist and are reused, not rebuilt)

**Interfaces:**
- Consumes: `MonEquipe` export from `app/src/screens/MonEquipe.tsx:321` (already exists, already subscribes to `subscribeTeam`/`subscribeProjects` — confirmed live/functional, not stale).
- Produces: routes `/clients`, `/clients/:clientId` (already existed, untouched), new route `/equipe` for `MonEquipe`.

- [ ] **Step 1: Add the `/equipe` route in `main.tsx`**

Remove the `Membres`/`FicheIndividu` imports and route entries, add `MonEquipe`:

```diff
- import { Clients } from './screens/Clients';
- import { Membres } from './screens/Membres';
+ import { Clients } from './screens/Clients';
+ import { MonEquipe } from './screens/MonEquipe';
```

```diff
       { path: 'clients', element: <ViewAsPermissionGate><Clients /></ViewAsPermissionGate> },
       { path: 'clients/:clientId', element: <ViewAsPermissionGate><FicheClient /></ViewAsPermissionGate> },
-      { path: 'membres', element: <ViewAsPermissionGate><Membres /></ViewAsPermissionGate> },
-      { path: 'membres/individus/:id', element: <ViewAsPermissionGate><FicheIndividu /></ViewAsPermissionGate> },
+      { path: 'equipe', element: <ViewAsPermissionGate><MonEquipe /></ViewAsPermissionGate> },
```

(`MonEquipe` doesn't need the `manage_clients` gate `Clients`/`FicheClient` use — internal team visibility isn't client-scoped. `ViewAsPermissionGate` is still worth keeping here since `getRequiredPermissionForPath` returns `null` for `/equipe` by default — it'll just no-op, harmless, and keeps the wrapping pattern consistent with every other route.)

Also check `app/src/main.tsx:83` — it currently redirects to `/membres?tab=groupes` for non-external view-as. Change to `/clients`:

```diff
-  if (viewAs?.type !== 'external') return redirect('/membres?tab=groupes');
+  if (viewAs?.type !== 'external') return redirect('/clients');
```

- [ ] **Step 2: Update `Sidebar.tsx`'s nav items**

Replace the single "Membres" item with two items, matching the existing `NavItem` pattern exactly:

```diff
           <NavItem to="/projets" icon="folder" label={t('nav.projects')} exact={true} collapsed={collapsed} />
-          {canSeeMembres && (
-            <NavItem to="/membres" icon="users" label={t('nav.membres')} exact={false} collapsed={collapsed} />
-          )}
+          {canSeeClients && (
+            <NavItem to="/clients" icon="building-2" label={t('nav.clients')} exact={false} collapsed={collapsed} />
+          )}
+          <NavItem to="/equipe" icon="users" label={t('nav.equipe')} exact={false} collapsed={collapsed} />
```

Rename the derived permission variable at `Sidebar.tsx:296-298` from `canSeeMembres` to `canSeeClients` (same logic, `getRequiredPermissionForPath('/clients')`, just renamed for clarity — it already reads `/clients` internally, only the JSX variable name changes):

```diff
-  const canSeeMembres = !effectivePerms || requiredForClients.some(p => effectivePerms.includes(p));
+  const canSeeClients = !effectivePerms || requiredForClients.some(p => effectivePerms.includes(p));
```

`/equipe` is intentionally **not** gated by any permission — every internal member should be able to see their own team roster, matching how `/projets` is ungated today (only `/clients` and `/finances` are permission-gated in this app).

- [ ] **Step 3: Add the two new i18n keys, remove the orphaned one**

In both `app/src/locales/fr.json` and `en.json`, find `"membres": "Membres",` inside the `nav` namespace (fr.json line 18 per earlier grep) and add a sibling key. fr.json:

```diff
     "membres": "Membres",
+    "clients": "Clients",
+    "equipe": "Équipe",
```

en.json equivalent:

```diff
     "membres": "Members",
+    "clients": "Clients",
+    "equipe": "Team",
```

(Leave `nav.membres` itself in place for now — Task 7 sweeps orphaned i18n keys once every screen change in this plan is done, to avoid deleting a key another in-progress task still reads.)

- [ ] **Step 4: Delete `Membres.tsx` and `FicheIndividu.tsx`, verify no remaining imports**

```bash
rm app/src/screens/Membres.tsx app/src/screens/FicheIndividu.tsx
```

Then search for any remaining reference (should be none after Step 1's `main.tsx` edit):

```bash
grep -rn "from '.*screens/Membres'\|from '.*screens/FicheIndividu'" app/src
```

Expected: no output.

- [ ] **Step 5: Verify — compile + manual walkthrough**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```

Expected: no errors.

In the browser preview: confirm the sidebar shows "Clients" and "Équipe" as separate items (no "Membres"), clicking "Clients" reaches the client list, clicking "Équipe" reaches the internal team roster, and there is no dead link anywhere pointing at `/membres`.

- [ ] **Step 6: Commit**

```bash
git add app/src/main.tsx app/src/components/layout/Sidebar.tsx app/src/locales/fr.json app/src/locales/en.json
git rm app/src/screens/Membres.tsx app/src/screens/FicheIndividu.tsx
git commit -m "feat(nav): restore Clients + Équipe as top-level items, remove Membres hub"
```

---

### Task 2: Port the two real fixes from `Membres.tsx` into `Clients.tsx`/`MonEquipe.tsx` before it's gone

**Files:**
- Modify: `app/src/screens/Clients.tsx` (live-stats subscription — confirm it's already present, see below)
- Modify: `app/src/screens/MonEquipe.tsx` (permission-preset filter — new addition)

**Interfaces:**
- Consumes: `matchPreset`, `PERMISSION_PRESETS`, `loadPermissions` from `app/src/components/profile/ProfileEditPanel.tsx` (already exported, used by `Membres.tsx` before its deletion in Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm `Clients.tsx` already has the live project-count subscription (it does — no change needed)**

`Clients.tsx:631-632` already has:
```ts
useEffect(() => subscribeProjects(() => forceLiveStatsRefresh(n => n + 1)), []);
useEffect(() => subscribeTasks(() => forceLiveStatsRefresh(n => n + 1)), []);
```
This is exactly the fix that was missing from `Membres.tsx` (fixed in Task "fix(membres): Groupes tab froze its live project counts", commit `ab71ce9`) — `Clients.tsx` was the *source* of that correct pattern, never had the bug. Nothing to do here; this step is a verification checkpoint, not a code change. Run:
```bash
grep -n "subscribeProjects\|subscribeTasks" app/src/screens/Clients.tsx
```
Expected: both lines present at 631-632.

- [ ] **Step 2: Add the permission-preset filter to `MonEquipe.tsx`**

`Membres.tsx` (deleted in Task 1) had a filter row + per-row badge showing each person's permission preset (Administrateur/Gestionnaire/Collaborateur/Observateur), driven by `matchPreset(loadPermissions(...))`. `MonEquipe.tsx` is now the only screen listing internal team members, and should keep this filter — it was a real, useful fix (permissions are now actually enforced, per today's earlier work), not hub-specific decoration.

Add to `MonEquipe.tsx`'s imports:
```ts
import { PERMISSION_PRESETS, matchPreset, loadPermissions } from '../components/profile/ProfileEditPanel';
```

In the `MonEquipe()` function body (after the existing `team`/`search` state, before the return), compute each member's preset key the same way `Membres.tsx` did:
```ts
const [permFilter, setPermFilter] = useState<string>('all');

const teamWithPreset = team.map(m => {
  const presetKey = m.accessLevel !== 'member' ? 'admin' : matchPreset(loadPermissions(m.id, m.role));
  const preset = PERMISSION_PRESETS.find(p => p.key === presetKey);
  return { ...m, permKey: presetKey ?? 'custom', permLabelKey: preset?.labelKey ?? 'membres.permCustom' };
});

const permFilterOptions = Array.from(new Map(teamWithPreset.map(m => [m.permKey, m.permLabelKey])).entries());

const filteredTeam = teamWithPreset.filter(m => permFilter === 'all' || m.permKey === permFilter);
```

Replace the existing `team.filter(...)` search-only filtering with `filteredTeam` as the base list, keeping the existing name/role search on top of it (read the current filter expression in `MonEquipe.tsx` around where `search` is applied and chain `.filter(m => matchesSearch(m))` after `filteredTeam`, don't replace the search logic — just add the preset filter as an additional `.filter()` before it).

Add the filter pill row (copy the exact JSX block from Task 1's git history — `git show ab71ce9^:app/src/screens/Membres.tsx | grep -n "permFilterOptions.length > 1" -A 20` to retrieve the exact pattern already written and reviewed today) above the member list, and the permission badge (`<span>{t(m.permLabelKey)}</span>`, same style as `Membres.tsx` used) on each row.

- [ ] **Step 3: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```

In the browser: navigate to `/equipe`, confirm the filter pills appear and filtering works (same manual check as done for `Membres.tsx` earlier today — click "Gestionnaire", confirm only matching members show).

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/MonEquipe.tsx
git commit -m "feat(equipe): carry the permission-preset filter over from the deleted Membres hub"
```

---

### Task 3: Flip "Groupe"/"Group" display text back to "Client" everywhere it means the billing entity

**Files:**
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks (pure copy change).

- [ ] **Step 1: Revert the entity-sense keys identified by today's audit**

This is a **display-string-only** change — i18n **key names** stay exactly as they are (many are already named `client*`, e.g. `clientName`, `clientLabel` — only their French/English *values* drift back). Do **not** touch:
- `tasks.groupByPriority` / `ungroupByPriority` (unrelated "group" sense)
- Anything in the `clientPreview`/`clientHome`/`clientProject`/`clientInvitation` namespaces (portal-facing "client" sense, already correct)

For every other key in the `membres`, `clients`, `client`, and `profile` namespaces whose **displayed value** currently contains "Groupe"/"groupe" (fr) or "Group"/"group" (en) and refers to the client/company entity, replace it with "Client"/"client" in the equivalent grammatical form. Concretely, in `fr.json` (line numbers from today's audit — re-verify with `grep -n` before editing, since earlier tasks in this plan renumber the file):

- `nav.pinnedClients` → "Clients épinglés"
- `membres.typeClient` → "Client" (this key survives — `MonEquipe.tsx`'s bulk-add-by-client shortcut, ported in Task 2, uses it as a type discriminator label)
- `clients.newClient` → "Nouveau client", `title`/`count`/`searchPlaceholder` → "Client(s)" wording, `createClient`/`editClient`/`clientMenu`/`clientName` → "client" wording, `colClient` → "Client", `clientsLabel`/`allClients` → "Client(s)", `sortClient` → "Client", `statusWaitingClient` → "En attente client", `client`/`searchClientPlaceholder`/`firstClientHint`/`personalProjectOption`/`personalProjectHint` → "client" wording, `moduleFinanceRequiresClient` → "...nécessite un client", `moveToClient` → "Changer de client", `groupTagHint` → "client" wording
- `profile.permManageClients`/`Desc` → "Gérer les clients" / matching description
- `client.*` namespace: `removeInternalConfirm` → "Retirer de l'équipe du client ?" (fixes the mixed-sense string flagged by the audit — "équipe" now correctly means "your internal team", "client" now correctly means the company), `removeContactConfirm`/`removeFromClient` → "client" wording, `clientContactsPortalDesc` → "client" wording, `internalTeamClientDesc` → "Membres de votre organisation travaillant sur ce client", `statusWaitingClient`, `noProjectsForClient`, `notesApercuPlaceholder`, `editClient`/`archiveClient`/`unarchiveClient`, `deleteClientConfirm`, `clientName`, `breadcrumbClients` → "Clients", `clientSince`, `clientContactsDesc`/`noClientContacts`, `groups`/`emptyGroupWarning` → "client" wording, `client`/`clients`/`clientsList`/`clientProjects`, `noClient`, `clientLabel`/`selectClient`, `colClient`, `noInvoicesClient`/`clientFinances`/`allClients`

Apply the same set of changes to `en.json` (Groupe→Client mirrors 1:1 to Group→Client).

**Practical approach**: since this is a large mechanical find-and-replace within specific namespaces (not a blind global replace — must skip `groupByPriority` and the portal namespaces), do it namespace-by-namespace: open `membres`, `clients`, `client`, `profile` in `fr.json`, replace every occurrence of "Groupe"→"Client", "groupe"→"client", "GROUPE"→"CLIENT" (check for an uppercase variant in a badge/label), grep afterward to confirm no stray "roupe" substring remains in those namespaces:

```bash
grep -n "roupe" app/src/locales/fr.json | grep -v "groupByPriority\|ungroupByPriority"
```

Expected after the edit: no output (every remaining "roupe" hit should only be the two grouping-verb keys, if any survive at all — most likely zero hits total).

- [ ] **Step 2: Fix the client-invitation "équipe" wording flagged by the audit**

`clientInvitation.pendingTitle`/`pendingDesc` (fr.json, ~line 2560-2561) and `acceptedTitle`/`acceptedDesc` (~2568-2569) currently say "rejoindre l'équipe" / "l'équipe de {{client}}" — this reads as joining the *studio's* internal team. Change to avoid "équipe" entirely for this client-portal-access context:

```diff
-    "pendingTitle": "Invitation à rejoindre l'équipe",
-    "pendingDesc": "... invité(e) à rejoindre l'équipe de {{client}}",
+    "pendingTitle": "Invitation à accéder au portail",
+    "pendingDesc": "... invité(e) à accéder à l'espace de {{client}}",
```
```diff
-    "acceptedTitle": "Bienvenue dans l'équipe !",
-    "acceptedDesc": "Vous faites maintenant partie de l'équipe de {{client}}",
+    "acceptedTitle": "Bienvenue !",
+    "acceptedDesc": "Vous avez maintenant accès à l'espace de {{client}}",
```

Same edits in `en.json` ("join the team" → "access the portal" wording).

- [ ] **Step 3: Unify "utilisateur"/"membre" on the pricing page**

`profile.planUsers`/`planUsersPlural` (fr.json ~1919-1920) and `selfHostLicenseFeat2` (~2671) say "utilisateur(s)" where the rest of the same pricing copy (`planFeat5Members`, `planFeatUpTo10Members`) says "membre(s)" for the identical concept (seat count). Change `planUsers`/`planUsersPlural`/`selfHostLicenseFeat2` to use "membre(s)" instead of "utilisateur(s)". Same in `en.json` ("user(s)" → "member(s)").

- [ ] **Step 4: Verify**

```bash
node -e "JSON.parse(require('fs').readFileSync('app/src/locales/fr.json')); JSON.parse(require('fs').readFileSync('app/src/locales/en.json')); console.log('valid')"
cd app && npx tsc --noEmit -p tsconfig.app.json
```

Both expected clean. In the browser: visit `/clients`, the Membres tab of a project, and the pricing/plan screen — confirm no remaining "Groupe" text in any of them.

- [ ] **Step 5: Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "copy: flip Groupe/Group back to Client, fix client-invitation team wording, unify utilisateur→membre"
```

---

### Task 4: Rename the project-level "Équipe" tab to "Membres" (fixes the collision with the new top-level "Équipe")

**Files:**
- Modify: `app/src/locales/fr.json` (`project.tabTeam`, lines 537 and 993 — two occurrences)
- Modify: `app/src/locales/en.json` (same keys)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Change the two `tabTeam` values**

```bash
grep -n '"tabTeam"' app/src/locales/fr.json app/src/locales/en.json
```

For each of the 4 matches (2 keys × 2 files), change the value from "Équipe"/"Team" to "Membres"/"Members". Do **not** rename the i18n key itself (`tabTeam` stays — only its displayed string changes), and do not touch `nav.equipe`/`nav.membres` (different keys, different scope, added/kept in Tasks 1 and 3).

- [ ] **Step 2: Verify**

```bash
node -e "JSON.parse(require('fs').readFileSync('app/src/locales/fr.json')); JSON.parse(require('fs').readFileSync('app/src/locales/en.json')); console.log('valid')"
```

In the browser: open any project, confirm its tab bar shows "Membres" instead of "Équipe" for the team/access tab, while the sidebar's top-level "Équipe" is unaffected.

- [ ] **Step 3: Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "copy: rename project's Équipe tab to Membres, fixes collision with top-level Équipe nav"
```

---

### Task 5: New-project wizard — separate Client picker from a real Membres search, with a bulk-add-by-client shortcut

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx` (the `NewProjectModal` component, step 2 "Infos" client section around line 388-467, and wherever step 3 "Équipe"/members selection currently lives)

**Interfaces:**
- Consumes: the existing internal-team search pattern already built in `app/src/screens/ProjectMembres.tsx`'s `AddMemberModal` (lines 46-349) — same three pools (internal search, project's-client contacts, other-clients bulk-add chips), reused here rather than rebuilt from scratch.
- Produces: `NewProjectModal`'s `create()` call now passes a `members: User[]` array assembled from the new picker instead of only from `getTeam()`.

- [ ] **Step 1: Read `ProjectMembres.tsx`'s `AddMemberModal` in full before starting**

```bash
sed -n '46,349p' app/src/screens/ProjectMembres.tsx
```

This is the picker to port into the wizard's step 3 — same search-and-add UX, same "add all of client X's contacts" bulk button. Do not invent a new UI pattern; copy this one's structure (internal pool + selected-client's-contacts pool + other-clients-as-bulk-chips) into the wizard step.

- [ ] **Step 2: Rename the wizard's step 2 client section from "Groupe" wording to "Client" wording**

This overlaps with Task 3's locale sweep — confirm `projects.*` keys used in this step (search placeholder, hints, "personal project" checkbox label) were included in Task 3's replacement list. If any were missed, fix them here too.

- [ ] **Step 3: Replace step 3's member selection with the ported picker**

Current step 3 only offers `getTeam()` (internal members). Replace with:
- A search box covering internal team + the selected client's contacts (if a client was picked in step 2) + other clients as bulk-add chips (matching `AddMemberModal`'s three-pool pattern).
- If a client is selected in step 2, show a single button: "Ajouter tous les contacts de {{clientName}}" that bulk-adds that client's full contact list in one click (still individually removable afterward — this is a shortcut, not a locked group membership).
- If no client is selected (personal/internal project), the picker still works — it just has no client-contacts pool or bulk button, only internal search + other-client bulk chips (someone can still add an external contact to an otherwise client-less project, e.g. a freelance collaborator).

Keep the existing `memberIds`/`members` state shape (`User[]`) the `create()` function at `ProjectsListView.tsx:160-207` already expects — this task changes the *picker UI*, not the data shape passed to project creation.

- [ ] **Step 4: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```

In the browser: open "Nouveau projet", step to "Infos", pick a client, step to "Membres" (renamed per Task 4's pattern — use the same tab label here for consistency), confirm the bulk-add button appears and adds the client's contacts, confirm you can still add/remove individuals afterward, and confirm creating a project with **no** client still lets you add internal members normally.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ProjectsListView.tsx
git commit -m "feat(wizard): replace internal-only member picker with the full search+bulk-add-by-client picker"
```

---

### Task 6: Fix approval fan-out, the "Sans client" project filter, archive/delete alignment, and the client-transfer member prompt

**Files:**
- Modify: `app/src/components/RequestApprovalButton.tsx` (lines ~104, ~143)
- Modify: `app/src/components/ProjectsListView.tsx` (client filter, ~line 1036)
- Modify: `app/src/data/clientStore.ts` (`archiveClient`, lines 231-238)
- Modify: `app/src/components/ProjectHeaderBar.tsx` and `app/src/components/ProjectCard.tsx` ("Changer de client" handlers, ~line 347-352 and ~558-568) and `app/src/components/ProjectsListView.tsx` (~861-866, same picker duplicated a third time)

**Interfaces:**
- Consumes: `project.members` (existing field), `getClientExternalTeam(clientId)` (existing function, still used elsewhere, not removed).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Fix approval notifications to use `project.members`, not the whole client's contact list**

At `RequestApprovalButton.tsx:104` and `:143`, replace:
```ts
const contacts = getClientExternalTeam(project?.clientId ?? '');
```
with a filter over the project's actual members that are external contacts:
```ts
const contacts = (project?.members ?? []).filter((m): m is User & { email?: string } => 'email' in m);
```
Check the actual shape distinguishing an internal `User` from an external contact in `project.members` at this point in the file (grep for how `ProjectMembres.tsx` itself tells them apart, likely a `getClientExternalTeam` intersection check) — reuse that exact same discriminator rather than inventing a new one, since `project.members` mixes both populations with no explicit type tag (per today's audit finding #1). If no clean discriminator exists in `project.members` items themselves, cross-reference against `getClientExternalTeam(project.clientId)` **only to identify which of `project.members` are external**, not to fan out to the client's full roster — i.e.:
```ts
const externalIds = new Set(getClientExternalTeam(project?.clientId ?? '').map(c => c.id));
const contacts = (project?.members ?? []).filter(m => externalIds.has(m.id));
```
This fixes both audit-flagged bugs: adding 1 contact no longer notifies all 5, and a client-less project (`project?.clientId` undefined → `getClientExternalTeam('')` → empty set) now just correctly notifies zero external contacts (there are none) without the earlier silent-empty-string-argument smell.

- [ ] **Step 2: Add "Sans client" to the project list's client filter**

At `ProjectsListView.tsx:1036`, the filter list is built as:
```ts
const clientsWithProjects = getClients().filter(c => allProjects.some(p => p.clientId === c.id));
```
Add a synthetic "no client" entry to whatever UI renders this list (find the `.map(c => ...)` immediately following and add a leading option, e.g. a pill/row with `label: t('projects.noClientFilter')` whose click sets the filter state to a sentinel value, then update the filtering logic wherever `clientFilter` is applied to also handle that sentinel by matching `p.clientId == null`). Add the new key `projects.noClientFilter` ("Sans client" / "No client") to both locale files.

- [ ] **Step 3: Align `archiveClient` with `removeClient`'s non-destructive behavior**

At `clientStore.ts:231-238`, remove the cascade:
```diff
 export function archiveClient(id: string): void {
   updateClient(id, { archived: true });
-  // Mirrors removeClient's own cascade (which deletes every project of the
-  // client, not just its direct files) — without this, a project could stay
-  // listed as active while its own files were archived out from under it via
-  // archiveAllFilesForClient below, since folders/files created under a
-  // project don't reliably also carry clientId (see mock.ts seed data).
-  getProjects().filter(p => p.clientId === id && !p.archived).forEach(p => archiveProject(p.id));
   archiveAllFilesForClient(id);
 }
```
The comment's stated reason (files could be archived out from under an active project) is no longer a concern once this project no longer force-archives — a project's own files stay reachable through the project itself regardless of its client's archived state, matching how `removeClient` already leaves detached projects fully intact. Read `archiveAllFilesForClient`'s implementation first to confirm it only touches files filed directly under the *client* (not under a project) — if it turns out to also reach into project-owned files, narrow it in this same step so it doesn't archive a project's files as a side effect of archiving the client.

- [ ] **Step 4: Add the client-transfer member confirmation**

Three call sites change a project's client and currently do nothing else: `ProjectHeaderBar.tsx:347-352`, `ProjectCard.tsx:558-568`, `ProjectsListView.tsx:861-866`. Since all three are literally duplicated code (per today's audit finding #3), extract a single shared handler — e.g. a new function `changeProjectClient(project: Project, newClientId: string | null)` in `app/src/data/projectStore.ts` — that:
1. Computes the old client's contact list (`getClientExternalTeam(project.clientId)` if `project.clientId` was set).
2. Checks how many of `project.members` are in that old contact list.
3. If that count is > 0, shows a confirm dialog (reuse `confirmDialog` from `app/src/data/confirmStore.ts`, the same pattern used elsewhere in this codebase — e.g. `Membres.tsx`'s `handleRemove` before its deletion) asking whether to remove those members' access, with two explicit choices (not a plain OK/Cancel — check `confirmDialog`'s signature for whether it supports custom button labels; if not, use a small inline modal instead, matching whatever pattern `ProjectMembres.tsx` already uses for its own confirmations).
4. On "remove their access": call `updateProject(project.id, { clientId: newClientId, members: project.members.filter(m => !oldClientMemberIds.has(m.id)), ... })`.
5. On "keep them" or if the count was 0: `updateProject(project.id, { clientId: newClientId, clientName, clientColor })` unchanged from today's behavior.

Replace all three call sites (`ProjectHeaderBar.tsx`, `ProjectCard.tsx`, `ProjectsListView.tsx`) to call this one shared function instead of their own inline `updateProject(...)` call — this also resolves the "three duplicated pickers" finding from today's audit for the *behavior* (not the picker UI itself, which is out of scope for this task).

- [ ] **Step 5: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```

In the browser: (a) request approval on a project with 1 of a client's 5 contacts added — confirm only that 1 contact would be notified (check via `read_network_requests` or a temporary `console.log` if the email send is stubbed in demo mode); (b) confirm the projects list filter now offers "Sans client" and it correctly isolates client-less projects; (c) archive a client with an active project, confirm the project stays active/unarchived; (d) change a project's client from A (with 2 of its contacts as members) to B, confirm the removal prompt appears and both choices behave as described.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/RequestApprovalButton.tsx app/src/components/ProjectsListView.tsx app/src/data/clientStore.ts app/src/components/ProjectHeaderBar.tsx app/src/components/ProjectCard.tsx app/src/data/projectStore.ts app/src/locales/fr.json app/src/locales/en.json
git commit -m "fix(projects): notify only actual project members on approval, add Sans-client filter, align archive with delete, confirm before dropping old client's members on transfer"
```

---

### Task 7: Client's own activity feed (real data instead of empty state) + dead-code sweep

**Files:**
- Modify: `app/src/screens/FicheClient.tsx` (`getClientActivities`/`ApercuTab`, lines ~755-773)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (orphaned key removal)
- Delete: any now-truly-dead exports (re-check after Tasks 1-6, since restoring `Clients.tsx`/`MonEquipe.tsx` as routed pages means most of what today's audit called "dead" is alive again — this step is a final re-check, not a re-application of the original dead-code list)

**Interfaces:**
- Consumes: `getNotifHistoryForProject(projectId)` and `notifToFeedActivity` from `app/src/data/notificationStore.ts` / `app/src/data/activityAdapter.ts` (existing, used identically by `app/src/screens/ProjectActivite.tsx:12`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Wire real activity for real (non-demo) sessions**

`getClientActivities` at `FicheClient.tsx:755-756` already returns `[]` for real sessions (`if (!isDemoSession()) return [];`) — so real users see an empty state today, not fake data; only the demo showcase uses the hardcoded array. Replace the real-session branch to aggregate notifications across the client's own projects, mirroring `ProjectActivite.tsx`'s pattern:

```ts
function getClientActivities(projects: typeof PROJECTS, clientId: string): ClientActivity[] {
  if (!isDemoSession()) {
    const clientProjectIds = new Set(getProjects().filter(p => p.clientId === clientId).map(p => p.id));
    return Array.from(clientProjectIds)
      .flatMap(id => getNotifHistoryForProject(id))
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(n => notifToFeedActivity(n, i18n.t.bind(i18n)));
  }
  return [ /* existing hardcoded demo array, unchanged */ ];
}
```

Update the call site (`FicheClient.tsx:772`, `getClientActivities(projects)`) to pass `client.id` as the second argument. Add the necessary imports (`getNotifHistoryForProject` from `notificationStore.ts`, `notifToFeedActivity` from `activityAdapter.ts`, `i18n` from `react-i18next` or wherever `ProjectActivite.tsx` sources it — check that file's imports directly).

- [ ] **Step 2: Re-run the dead-code check from today's audit, now that Tasks 1-6 are done**

```bash
grep -rn "MonEquipe()\|ClientListView\|ClientActions\|getClientLiveStats" app/src/screens/Clients.tsx app/src/screens/MonEquipe.tsx
```

Since `Clients.tsx` and `MonEquipe.tsx` are routed again (Task 1), everything the original audit called dead in these two files should now show real callers via their route — confirm this is the case (nothing should need deleting here). If anything genuinely still has zero callers after this whole plan, remove it; do not remove anything the audit merely flagged before this plan restored its usage.

- [ ] **Step 3: Remove the i18n keys confirmed orphaned by the `Membres.tsx` deletion (Task 1) — not the `team.*` keys, which `MonEquipe.tsx` still uses**

The earlier audit's "dead `team.*` keys" list was based on `MonEquipe()` being unreferenced at the time — it's referenced again after Task 1, so those keys are live again; do not remove them. Only remove `nav.membres` (superseded by `nav.clients`/`nav.equipe` from Task 1) and any `membres.*` key that was exclusively used by the now-deleted `Membres.tsx`/`FicheIndividu.tsx` (re-grep to confirm each one has zero remaining callers before deleting — do not delete from the earlier audit's list blindly, some `membres.*` keys were ported into `MonEquipe.tsx` in Task 2):

```bash
grep -rn "t('membres\." app/src --include=*.tsx | sed "s/.*t('\(membres\.[a-zA-Z]*\)').*/\1/" | sort -u
```

Cross-reference this list against every `membres.*` key in `fr.json`/`en.json`; remove any key not in the list. Keep `nav.membres` removal separate — confirm no remaining `t('nav.membres')` call first.

- [ ] **Step 4: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
node -e "JSON.parse(require('fs').readFileSync('app/src/locales/fr.json')); JSON.parse(require('fs').readFileSync('app/src/locales/en.json')); console.log('valid')"
```

In the browser: open a real (non-demo) client's Activité tab, confirm it shows real notification-derived events for that client's projects (or a clean empty state if there genuinely are none) instead of always being empty.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/FicheClient.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(client): wire real activity feed for real sessions, sweep orphaned i18n keys"
```

---

### Task 8: Update `docs/tests-manuels.md` with the manual checks this chantier needs

**Files:**
- Modify: `docs/tests-manuels.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (terminal task).

- [ ] **Step 1: Append a new section**

```markdown
## Modèle Client/Membre/Projet (chantier 2026-08-04)

- [ ] **Parcours complet réel** : avec un compte réel, créer un client, l'ouvrir, cliquer "Nouveau projet" (bouton déjà existant, vérifié fonctionnel), confirmer le client est pré-rempli. Ajouter des membres via la nouvelle recherche à l'étape "Membres" du même assistant, confirmer le bouton "Ajouter tous les contacts de [client]" fonctionne.
- [ ] **Transfert de client** : sur un projet réel ayant des membres qui sont aussi des contacts du client actuel, changer son client — confirmer que la question de confirmation apparaît et que les deux choix (retirer/garder l'accès) fonctionnent comme attendu.
- [ ] **Notification d'approbation réelle** : avec un compte réel, demander une approbation sur un projet où un seul des contacts du client a été ajouté comme membre — confirmer qu'un seul courriel part (pas tout le carnet du client).
- [ ] **Activité client réelle** : confirmer que l'onglet Activité d'une fiche client réelle montre maintenant de vrais événements (ou un état vide propre), pas un flux inventé.
```

- [ ] **Step 2: Commit**

```bash
git add docs/tests-manuels.md
git commit -m "docs: add manual test checklist for the Client/Membre/Projet cleanup chantier"
```
