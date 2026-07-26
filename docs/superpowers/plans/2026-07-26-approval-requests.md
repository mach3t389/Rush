# Unify Approval Requests Around the Livrable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Demander l'approbation" on a resource screen (video/document/image/web) actually reach the client, by routing it through the livrable (deliverable Task) mechanism that the client Portail already reads — instead of silently setting `Resource.status`, which no client-facing screen ever displays.

**Architecture:** No new data model. `RequestApprovalButton` is rewritten to find-or-create a `Task` with `deliverable: true`, `linkedResources: [resource.id]`, `sharedWithClient: true` via the existing `addDeliverable`/`getDeliverables` functions in `taskStore.ts`. The button becomes two render states: a plain button when no livrable is linked yet, and a clickable `SFPill` mirroring the livrable's live status once one exists (subscribed via `subscribeStore`). Relocated from each resource screen's icon toolbar to sit next to the resource title, so the action and its result are visually connected.

**Tech Stack:** React 19 + TypeScript, existing `taskStore.ts`/`resourceStore.ts`/`notificationStore.ts`/`toastStore.ts` singleton stores, react-i18next.

## Global Constraints

- No automated test suite in this project (see `CLAUDE.md` → "Commandes essentielles": *"Il n'y a pas de tests automatisés. La vérification se fait via le serveur de preview."*). Every task's "test" step below is: (1) `npx tsc --noEmit -p tsconfig.app.json` from `app/` must pass with zero errors, and (2) a live check in the Claude_Browser preview (dev server already running at `http://localhost:5253`).
- No hardcoded user-facing text — every new string goes through `t('namespace.key')`, added to **both** `app/src/locales/fr.json` and `app/src/locales/en.json` before use (per `CLAUDE.md`'s i18n rule).
- Styling is inline `style={}` objects using the CSS custom properties already defined in `app/src/index.css` (`var(--accent)`, `var(--text-3)`, etc.) — do not introduce Tailwind classes or new CSS files.
- Commit after each task with `git add <exact files touched>` (never `git add -A` — this repo has a concurrently-active second session using the same checkout).
- Demo session only needs manual verification (real Supabase session paths are unaffected — `taskStore.ts`'s `addDeliverable`/`getDeliverables` already handle both paths transparently, no store changes needed).

---

### Task 1: `findLinkedDeliverable` helper in `taskStore.ts`

**Files:**
- Modify: `app/src/data/taskStore.ts:242-244` (right after the existing `getDeliverables` function)

**Interfaces:**
- Consumes: `getDeliverables(projectId: string): Task[]` (already defined at `taskStore.ts:242`), `Task.linkedResources?: string[]` (already defined in `app/src/types/index.ts:100`)
- Produces: `findLinkedDeliverable(projectId: string, resourceId: string): Task | null` — used by Task 3.

- [ ] **Step 1: Add the helper**

In `app/src/data/taskStore.ts`, immediately after the `getDeliverables` function (currently ending at line 244), add:

```ts
export function findLinkedDeliverable(projectId: string, resourceId: string): Task | null {
  return getDeliverables(projectId).find(t => (t.linkedResources ?? []).includes(resourceId)) ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run from `app/`:
```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors (this is a pure addition, nothing else references the new export yet).

- [ ] **Step 3: Commit**

```bash
git add app/src/data/taskStore.ts
git commit -m "feat(taskstore): add findLinkedDeliverable helper"
```

---

### Task 2: i18n keys for the approval badge and confirmation toast

**Files:**
- Modify: `app/src/locales/fr.json` (inside the existing `"approval"` object, currently at lines 311-314)
- Modify: `app/src/locales/en.json` (find the matching `"approval"` object — same key structure as fr.json)

**Interfaces:**
- Produces: 5 new i18n keys under the `approval.*` namespace, consumed by Task 3's rewrite of `RequestApprovalButton.tsx`.

- [ ] **Step 1: Add French keys**

In `app/src/locales/fr.json`, the `"approval"` object currently reads:
```json
  "approval": {
    "requestApproval": "Demander approbation",
    "requestSent": "Demande envoyée"
  },
```
Replace it with:
```json
  "approval": {
    "requestApproval": "Demander approbation",
    "requestSent": "Demande envoyée",
    "livrableCreatedToast": "Livrable créé et partagé avec le client pour approbation",
    "viewLivrable": "Voir le livrable dans Aperçu",
    "statusPending": "En attente d'approbation",
    "statusApproved": "Approuvé",
    "statusCorrections": "Corrections demandées"
  },
```

- [ ] **Step 2: Add matching English keys**

Find the `"approval"` object in `app/src/locales/en.json` (same key names, English values already present for `requestApproval`/`requestSent` — check their exact current English wording before editing, and match that tone). Add the 5 new keys with these English values:
```json
    "livrableCreatedToast": "Deliverable created and shared with the client for approval",
    "viewLivrable": "View the deliverable in Overview",
    "statusPending": "Awaiting approval",
    "statusApproved": "Approved",
    "statusCorrections": "Corrections requested"
```

- [ ] **Step 3: Verify JSON validity**

Run from `app/`:
```bash
node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); console.log('OK')"
```
Expected output: `OK` (catches trailing-comma/syntax mistakes before they hit the dev server).

- [ ] **Step 4: Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "i18n: add approval badge and toast strings"
```

---

### Task 3: Rewrite `RequestApprovalButton.tsx` — find-or-create livrable + live status badge

**Files:**
- Modify: `app/src/components/RequestApprovalButton.tsx` (full rewrite, currently 54 lines)

**Interfaces:**
- Consumes: `findLinkedDeliverable` (Task 1), `addDeliverable(projectId: string, task: Task): void` (existing, `taskStore.ts:208`), `subscribeStore(fn: () => void): () => void` (existing, `taskStore.ts:474`), `getProjects(): Project[]` (existing, `app/src/data/projectStore.ts:206`), `updateResource(id: string, patch: Partial<Resource>): void` (existing, `resourceStore.ts:147`), `showToast(payload: ToastPayload): void` (existing, `toastStore.ts:25`), `addNotif` (existing, `notificationStore.ts:303`), `SFPill` component (existing, `components/ui/SFPill.tsx`).
- Produces: same public props as before (`resource`, `projectId`, `onStatusChange`, `size`) — no call-site signature changes, so Tasks 4-7 only move the JSX mount point, they don't change props.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/src/components/RequestApprovalButton.tsx` with:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFButton, SFPill } from './ui';
import { addNotif } from '../data/notificationStore';
import { updateResource } from '../data/resourceStore';
import { addDeliverable, findLinkedDeliverable, subscribeStore } from '../data/taskStore';
import { getProjects } from '../data/projectStore';
import { USERS } from '../data/mock';
import { showToast } from '../data/toastStore';
import type { Resource, Status, DeliverableType, Task } from '../types';

function inferDeliverableType(resource: Resource): DeliverableType {
  if (resource.type === 'video_review') {
    if (resource.mediaSubtype === 'photo') return 'photo';
    if (resource.mediaSubtype === 'file') return 'document';
    if (resource.mediaSubtype === 'audio') return 'audio';
    return 'video';
  }
  if (resource.type === 'web_review') return 'web';
  if (resource.type === 'moodboard') return 'graphique';
  if (resource.type === 'document') return 'document';
  return 'autre';
}

// Demande d'approbation générique pour n'importe quelle ressource.
// → trouve ou crée le livrable (Task deliverable:true) lié à cette
//   ressource — c'est CE livrable que le client voit et approuve dans
//   le Portail (Portail.tsx ne lit jamais Resource.status directement).
// → une fois un livrable lié trouvé, le bouton devient un badge de
//   statut vivant plutôt qu'une action répétable — pas de état
//   "double-clic" à gérer, la deuxième visite affiche juste le badge.
export function RequestApprovalButton({
  resource,
  projectId,
  onStatusChange,
  size = 'sm',
}: {
  resource: Resource;
  projectId?: string;
  onStatusChange?: (status: Status, label: string) => void;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [linked, setLinked] = useState<Task | null>(
    () => (projectId ? findLinkedDeliverable(projectId, resource.id) : null)
  );

  useEffect(() => {
    if (!projectId) return;
    setLinked(findLinkedDeliverable(projectId, resource.id));
    return subscribeStore(() => setLinked(findLinkedDeliverable(projectId, resource.id)));
  }, [projectId, resource.id]);

  const handle = () => {
    if (!projectId) return;
    const project = getProjects().find(p => p.id === projectId);
    const task: Task = {
      id: `dl-${Date.now()}`,
      title: resource.title,
      projectId,
      projectName: project?.name ?? '',
      projectColor: project?.clientColor ?? '#888',
      assignee: USERS.lea,
      status: 'review',
      statusLabel: 'En révision',
      priority: 'normal',
      priorityLabel: 'Moyenne',
      dueDate: '—',
      dueDateRed: false,
      checked: false,
      subtasks: [],
      deliverable: true,
      deliverableType: inferDeliverableType(resource),
      linkedResources: [resource.id],
      sharedWithClient: true,
    };
    addDeliverable(projectId, task);
    addNotif({
      kind: 'approval',
      actor: USERS.lea.name,
      text: `a demandé l'approbation de « ${resource.title} »`,
      timestamp: Date.now(),
      resourceId: resource.id,
      taskId: task.id,
      projectId,
    });
    if (onStatusChange) onStatusChange('review', 'En révision');
    else updateResource(resource.id, { status: 'review', statusLabel: 'En révision' });
    showToast({ type: 'task', message: t('approval.livrableCreatedToast') });
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  };

  if (linked) {
    const label = linked.correctionsRequested
      ? t('approval.statusCorrections')
      : linked.status === 'ok'
      ? t('approval.statusApproved')
      : t('approval.statusPending');
    const pillStatus: Status = linked.correctionsRequested ? 'warn' : linked.status;
    return (
      <button
        onClick={() => navigate(`/projets/${projectId}/overview`)}
        title={t('approval.viewLivrable')}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
      >
        <SFPill status={pillStatus} small={size === 'sm'}>{label}</SFPill>
      </button>
    );
  }

  return (
    <SFButton
      variant="primary"
      size={size}
      icon={sent ? 'check' : 'shield-check'}
      onClick={handle}
      style={{ flexShrink: 0, whiteSpace: 'nowrap', ...(sent ? { background: 'var(--ok)', borderColor: 'var(--ok)', color: '#fff' } : {}) }}
    >
      {sent ? t('approval.requestSent') : t('approval.requestApproval')}
    </SFButton>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from `app/`:
```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors. If `Status` doesn't include `'warn'` as a valid pill status color, check `app/src/types/index.ts:2` (`export type Status = 'ok' | 'warn' | 'info' | 'danger' | 'review' | 'neutral' | 'accent';`) — `'warn'` is valid.

- [ ] **Step 3: Live verification via ResourceDetail.tsx (no relocation needed there — good first test)**

`ResourceDetail.tsx:3138` already mounts `RequestApprovalButton` right next to the title/status pill (no relocation needed for this file — see Task 8). Use it as the first live check of the new logic:

1. In the Claude_Browser preview, navigate to a project's screenplay/moodboard/inspirations/form resource (e.g. a project's script or moodboard from `/projets/:id/fichiers`, double-click to open).
2. Click "Demander approbation".
3. Confirm: a toast appears with the new message; the button becomes a pill reading "En attente d'approbation".
4. Navigate to `/projets/:id/overview` (Aperçu) — confirm a new livrable appears in the "Livrables" list, titled after the resource, `sharedWithClient` on (eye icon), linked to the resource (resource chip visible under the livrable row).
5. Reload the resource screen — confirm the pill still shows (persisted, not just local state).

- [ ] **Step 4: Commit**

```bash
git add app/src/components/RequestApprovalButton.tsx
git commit -m "feat(approval): request-approval button now creates/links a real livrable"
```

---

### Task 4: Relocate the button next to the title in `VideoReview.tsx`

**Files:**
- Modify: `app/src/screens/VideoReview.tsx:885-886` (remove from toolbar), `app/src/screens/VideoReview.tsx:1206-1224` (insert near title, inside the "Resource summary" block)

**Interfaces:**
- Consumes: `RequestApprovalButton` (Task 3) — same props, only the JSX location moves.

- [ ] **Step 1: Remove from the player toolbar**

In `app/src/screens/VideoReview.tsx`, delete these two lines (currently 885-886):
```tsx
        {/* Request approval */}
        <RequestApprovalButton resource={resource} projectId={projectId} />
```

- [ ] **Step 2: Insert next to the title**

Find the "Resource summary" block (starts around line 1205-1206):
```tsx
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('review.videoLabel')} · {activeVersion}</p>
```
Change the wrapping `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>` line's immediate children so the button sits as a sibling after the `<div style={{ flex: 1, minWidth: 0 }}>...</div>` title block (that title `<div>` closes right before the `{editingDesc ? ... : ...}` block ends — locate its closing `</div>` and add the button as the next sibling, before that outer flex `<div>` closes). Concretely, the outer flex container becomes:
```tsx
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* ...unchanged title/description JSX... */}
              </div>
              <RequestApprovalButton resource={resource} projectId={projectId} />
            </div>
```
Only add `gap: 8` to the existing style object and insert the `<RequestApprovalButton .../>` line right before that `<div>`'s closing tag — do not touch the title/description JSX in between.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 4: Live verification**

1. Navigate to a video resource (`VideoReview`).
2. Confirm the approval button/pill now renders next to the video title in the right-hand comments panel, not in the bottom player toolbar.
3. Click it if not already linked; confirm the same toast + pill-conversion behavior as Task 3's verification.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/VideoReview.tsx
git commit -m "refactor(video-review): move approval button next to resource title"
```

---

### Task 5: Relocate the button next to the title in `DocumentReview.tsx`

**Files:**
- Modify: `app/src/screens/DocumentReview.tsx:580` (remove), `app/src/screens/DocumentReview.tsx:486-509` (insert)

**Interfaces:**
- Consumes: `RequestApprovalButton` (Task 3).

- [ ] **Step 1: Remove from its current spot**

Delete this line (currently line 580):
```tsx
        {resource && <RequestApprovalButton resource={resource} size="sm" />}
```

- [ ] **Step 2: Insert right after the title/description block**

The title/description block currently ends at line 509 with:
```tsx
          )}
        </div>

        {/* Divider */}
```
Insert the button between the block's closing `</div>` and the divider comment:
```tsx
          )}
        </div>

        {resource && <RequestApprovalButton resource={resource} size="sm" />}

        {/* Divider */}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 4: Live verification**

1. Navigate to a document resource (`DocumentReview`).
2. Confirm the button/pill now sits immediately after the title, before the version dropdown.
3. Click it; confirm toast + pill conversion + a new livrable in Aperçu with `deliverableType: 'document'`.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/DocumentReview.tsx
git commit -m "refactor(document-review): move approval button next to resource title"
```

---

### Task 6: Relocate the button next to the title in `ImageReview.tsx`

**Files:**
- Modify: `app/src/screens/ImageReview.tsx:454` (remove), `app/src/screens/ImageReview.tsx:356-380` (insert)

**Interfaces:**
- Consumes: `RequestApprovalButton` (Task 3).

- [ ] **Step 1: Remove from its current spot**

Delete these two lines (currently 453-454):
```tsx
        {/* Request approval */}
        <RequestApprovalButton resource={resource} projectId={projectId} />
```

- [ ] **Step 2: Insert right after the title/description block**

The title/description block (guarded by `{resource && (...)}`) currently ends at line 380 with:
```tsx
          </div>
        )}

        {/* Divider */}
```
Insert the button between the `)}` and the divider comment:
```tsx
          </div>
        )}

        {resource && <RequestApprovalButton resource={resource} projectId={projectId} />}

        {/* Divider */}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 4: Live verification**

1. Navigate to an image resource (`ImageReview`).
2. Confirm the button/pill now sits immediately after the title, before the round dropdown.
3. Click it; confirm toast + pill conversion + a new livrable in Aperçu with `deliverableType: 'photo'`.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/ImageReview.tsx
git commit -m "refactor(image-review): move approval button next to resource title"
```

---

### Task 7: Relocate the button next to the status pill in `WebReview.tsx`

**Files:**
- Modify: `app/src/screens/WebReview.tsx:291` (remove), `app/src/screens/WebReview.tsx:270-272` (insert)

**Interfaces:**
- Consumes: `RequestApprovalButton` (Task 3).

`WebReview.tsx` has no editable title in its header (unlike the other three) — its header shows a status pill (`resource.status`) right after the back button. That pill is the closest existing anchor, so the approval button/badge goes right after it instead.

- [ ] **Step 1: Remove from its current spot**

Delete this line (currently line 291):
```tsx
        {resource && <RequestApprovalButton resource={resource} projectId={projectId} />}
```

- [ ] **Step 2: Insert right after the status pill**

Find this block (currently lines 270-272):
```tsx
        {resource && (
          <SFPill status={resource.status} small>{resource.statusLabel}</SFPill>
        )}
```
Change it to:
```tsx
        {resource && (
          <SFPill status={resource.status} small>{resource.statusLabel}</SFPill>
        )}
        {resource && <RequestApprovalButton resource={resource} projectId={projectId} />}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 4: Live verification**

1. Navigate to a web resource (`WebReview`).
2. Confirm the button/pill now sits right after the status pill, before the external-link button.
3. Click it; confirm toast + pill conversion + a new livrable in Aperçu with `deliverableType: 'web'`.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/WebReview.tsx
git commit -m "refactor(web-review): move approval button next to status pill"
```

---

### Task 8: Add Approve / Request Corrections to the live client screen (`ClientProjectApercu.tsx`)

**Discovered mid-plan:** the original design assumed the client-facing "Approuver"/"Demander des corrections" buttons already worked, based on reading `app/src/screens/Portail.tsx`. Live verification found `Portail.tsx` is **not wired to any route** in `app/src/main.tsx` — dead code. The actual live client screens (`/mon-espace/projets/:projectId` and `/apercu-client/:clientId/projets/:projectId`, both rendering `ClientProjectApercu.tsx`) list deliverables read-only, with no action buttons at all. This task ports the missing action to the screen that's actually reachable, so livrables created by Tasks 1-7 can actually be approved, not just seen.

Two execution paths, because they have different data-write mechanics:
- **Preview path** (`isPreview === true` — admin using "Voir en tant que"): the acting Supabase user is the studio member themselves, with full write access. Writes go directly through the existing `taskStore.ts` (`updateTask`), exactly like the dead `Portail.tsx` did.
- **Real client-session path** (`isPreview === false` — an actual client account logged in via `/mon-espace`): per `docs/superpowers/specs/2026-07-15-client-access-migration.sql:112-114`, clients currently have a **read-only** RLS policy on `tasks` (`tasks_select_client_access`, `for select` only). A real client account cannot write to `tasks` at all today. This task adds a new, narrowly-scoped RPC function (not a blanket UPDATE policy) that lets a client flip only `status`/`correctionsRequested` on a task that is already a shared deliverable on a project they have access to — never any other field. **This migration is NOT run automatically — per this project's established convention (see `CLAUDE.md`'s Supabase migrations section), it must be pasted into the Supabase SQL Editor and run manually by the user.** The real-client path cannot be live-verified in this environment (no way to authenticate as a real client account here) — this task's live verification covers the preview/demo path only; the migration's correctness rests on code review + the existing `is_client_contact_for_project()` precedent it reuses verbatim.

**Explicitly out of scope for this task** (noted, not built): a notification when a real client (non-preview) approves or requests corrections. The preview path already creates one (mirroring `Portail.tsx`'s exact prior behavor, using a generic "Le client" / "The client" actor label since `ClientProject` has no contact name available). Wiring the equivalent for real client sessions would require a `notifications` table insert from inside the RPC, which needs more context on that table's recipient-fanout logic than this task has — flagged for a future pass, not this one.

**Files:**
- Modify: `app/src/data/clientSessionStore.ts` (add `correctionsRequested` to `ClientDeliverable`, add 2 new async functions)
- Modify: `app/src/data/viewAsClientDataStore.ts` (add 2 new async functions, preview-path equivalents)
- Modify: `app/src/screens/client/ClientProjectApercu.tsx` (add action buttons, wire to the right path)
- Create: `docs/superpowers/specs/2026-07-26-client-deliverable-actions-migration.sql`

**Interfaces:**
- Consumes: `updateTask(projectId, taskId, patch): void` (existing, `taskStore.ts:221`), `addNotif` (existing, `notificationStore.ts:303`), `is_client_contact_for_project(p_project_id text): boolean` (existing Postgres function, defined in `docs/superpowers/specs/2026-07-15-client-access-migration.sql:84-92` — reused, not redefined), `supabase` client (existing, `supabaseClient.ts`).
- Produces: `approveClientDeliverable(taskId: string): Promise<{ok: boolean}>`, `requestClientDeliverableCorrections(taskId: string): Promise<{ok: boolean}>` (both in `clientSessionStore.ts`); `approvePreviewClientDeliverable(projectId, taskId, deliverableTitle): Promise<{ok: boolean}>`, `requestPreviewClientDeliverableCorrections(projectId, taskId, deliverableTitle): Promise<{ok: boolean}>` (both in `viewAsClientDataStore.ts`) — used by Task 9's verification.

- [ ] **Step 1: Add `correctionsRequested` to `ClientDeliverable` and the two real-session action functions**

In `app/src/data/clientSessionStore.ts`, change the `ClientDeliverable` interface (currently at lines 118-125):
```ts
export interface ClientDeliverable {
  id: string;
  title: string;
  deliverable: boolean;
  sharedWithClient?: boolean;
  dueDate?: string;
  status?: string;
  correctionsRequested?: boolean;
}
```
Then, immediately after the `getMyClientDeliverables` function (currently ending at line 140), add:
```ts
// Both actions are narrowly-scoped RPC calls (see
// docs/superpowers/specs/2026-07-26-client-deliverable-actions-migration.sql)
// rather than a direct .update() — a client's RLS policy on `tasks` is
// read-only (tasks_select_client_access), and a blanket UPDATE policy would
// let a client rewrite any field of the task, not just approval state.
export async function approveClientDeliverable(taskId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc('client_deliverable_action', { p_task_id: taskId, p_action: 'approve' });
  if (error) { console.error('approveClientDeliverable failed', error); return { ok: false }; }
  return { ok: true };
}

export async function requestClientDeliverableCorrections(taskId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc('client_deliverable_action', { p_task_id: taskId, p_action: 'request_corrections' });
  if (error) { console.error('requestClientDeliverableCorrections failed', error); return { ok: false }; }
  return { ok: true };
}
```

- [ ] **Step 2: Add the two preview-path action functions**

In `app/src/data/viewAsClientDataStore.ts`, add these imports to the existing import block at the top:
```ts
import { getDeliverables, updateTask } from './taskStore';
import { addNotif } from './notificationStore';
```
(`getDeliverables` is already imported there — just add `updateTask` alongside it. `addNotif` is a new import.)

Then, at the end of the file, after `getPreviewClientInvoices`, add:
```ts
// Preview-path equivalent of clientSessionStore.ts's approve/corrections —
// the acting user here is the studio member themselves (admin using "Voir
// en tant que"), with full existing write access to their own studio's
// tasks, so this writes directly through taskStore.ts instead of an RPC.
export async function approvePreviewClientDeliverable(projectId: string, taskId: string, deliverableTitle: string): Promise<{ ok: boolean }> {
  updateTask(projectId, taskId, { status: 'ok', correctionsRequested: false });
  addNotif({
    kind: 'deliverableApproved',
    actor: 'Le client',
    text: `a approuvé le livrable "${deliverableTitle}"`,
    taskId,
    timestamp: Date.now(),
    projectId,
  });
  return { ok: true };
}

export async function requestPreviewClientDeliverableCorrections(projectId: string, taskId: string, deliverableTitle: string): Promise<{ ok: boolean }> {
  updateTask(projectId, taskId, { correctionsRequested: true });
  addNotif({
    kind: 'comment',
    actor: 'Le client',
    text: `a demandé des corrections sur "${deliverableTitle}"`,
    taskId,
    timestamp: Date.now(),
    projectId,
  });
  return { ok: true };
}
```

- [ ] **Step 3: Wire the buttons into `ClientProjectApercu.tsx`**

Replace the full contents of `app/src/screens/client/ClientProjectApercu.tsx` with:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { SFIcon, SFButton } from '../../components/ui';
import {
  getMyClientProjects, getMyClientDeliverables,
  approveClientDeliverable, requestClientDeliverableCorrections,
  type ClientProject, type ClientDeliverable,
} from '../../data/clientSessionStore';
import {
  getPreviewClientProjects, getPreviewClientDeliverables,
  approvePreviewClientDeliverable, requestPreviewClientDeliverableCorrections,
} from '../../data/viewAsClientDataStore';
import { getViewAsUser } from '../../data/viewAsStore';

const PHASE_ORDER = ['preproduction', 'production', 'postproduction', 'livraison'];

export function ClientProjectApercu() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const [project, setProject] = useState<ClientProject | null>(null);
  const [deliverables, setDeliverables] = useState<ClientDeliverable[] | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const viewAs = getViewAsUser();
  const isPreview = viewAs?.type === 'external';

  const load = useCallback(async () => {
    if (!projectId) return;
    const [projects, dels] = isPreview
      ? await Promise.all([
          getPreviewClientProjects(viewAs!.clientId!),
          getPreviewClientDeliverables(projectId),
        ])
      : await Promise.all([
          getMyClientProjects(),
          getMyClientDeliverables(projectId),
        ]);
    setProject(projects.find(p => p.id === projectId) ?? null);
    setDeliverables(dels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isPreview]);

  useEffect(() => {
    let cancelled = false;
    (async () => { await load(); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isPreview]);

  const handleApprove = async (d: ClientDeliverable) => {
    if (!projectId) return;
    setActingId(d.id);
    const result = isPreview
      ? await approvePreviewClientDeliverable(projectId, d.id, d.title)
      : await approveClientDeliverable(d.id);
    if (result.ok) await load();
    setActingId(null);
  };

  const handleCorrections = async (d: ClientDeliverable) => {
    if (!projectId) return;
    setActingId(d.id);
    const result = isPreview
      ? await requestPreviewClientDeliverableCorrections(projectId, d.id, d.title)
      : await requestClientDeliverableCorrections(d.id);
    if (result.ok) await load();
    setActingId(null);
  };

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deliverables.map(d => (
                <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SFIcon name="package" size={14} color="var(--text-3)" />
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{d.title}</span>
                    {d.status && <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{d.status}</span>}
                  </div>
                  {d.correctionsRequested && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#a85f3e18', border: '1px solid #a85f3e44' }}>
                      <SFIcon name="triangle-alert" size={13} color="#a85f3e" />
                      <span style={{ fontSize: 12, color: '#a85f3e' }}>{t('portal.correctionsRequestedNote')}</span>
                    </div>
                  )}
                  {d.status === 'review' && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <SFButton variant="primary" icon="check" size="sm" disabled={actingId === d.id} onClick={() => handleApprove(d)} style={{ flex: 1, justifyContent: 'center' }}>
                        {t('portal.approve')}
                      </SFButton>
                      {!d.correctionsRequested && (
                        <SFButton variant="secondary" icon="message-circle" size="sm" disabled={actingId === d.id} onClick={() => handleCorrections(d)} style={{ flex: 1, justifyContent: 'center' }}>
                          {t('portal.requestCorrections')}
                        </SFButton>
                      )}
                    </div>
                  )}
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

- [ ] **Step 4: Write the migration file (do not run it — this is a deliverable for the user to run manually)**

Create `docs/superpowers/specs/2026-07-26-client-deliverable-actions-migration.sql`:
```sql
-- Lets a real client account (client_contacts, not a studio member) approve
-- or request corrections on a shared deliverable, without granting a
-- blanket UPDATE policy on `tasks` (which would let a client rewrite any
-- field — title, assignee, everything — not just approval state).
-- SECURITY DEFINER, mirrors the is_client_contact_for_project() precedent
-- already granted in 2026-07-15-client-access-migration.sql.
--
-- Run once in the Supabase SQL Editor.

create or replace function client_deliverable_action(p_task_id text, p_action text)
returns void
language plpgsql security definer as $$
declare
  v_project_id text;
  v_data jsonb;
begin
  if p_action not in ('approve', 'request_corrections') then
    raise exception 'invalid action: %', p_action;
  end if;

  select project_id, data into v_project_id, v_data from tasks where id = p_task_id;
  if v_project_id is null then
    raise exception 'task not found';
  end if;

  if not is_client_contact_for_project(v_project_id) then
    raise exception 'not authorized for this project';
  end if;

  if coalesce((v_data->>'deliverable')::boolean, false) is not true
     or coalesce((v_data->>'sharedWithClient')::boolean, true) is not true then
    raise exception 'task is not a shared deliverable';
  end if;

  if p_action = 'approve' then
    v_data := jsonb_set(jsonb_set(v_data, '{status}', '"ok"'), '{correctionsRequested}', 'false');
  else
    v_data := jsonb_set(v_data, '{correctionsRequested}', 'true');
  end if;

  update tasks set data = v_data where id = p_task_id;
end;
$$;

grant execute on function client_deliverable_action(text, text) to authenticated;
```

- [ ] **Step 5: Typecheck**

Run from `app/`:
```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 6: Live verification (preview path only — real client-session path needs the migration run first, which is a manual step for the user)**

1. In the Claude_Browser preview, use the demo session's "Voir en tant que" flow (or navigate directly to `/apercu-client/:clientId/projets/:projectId` for a project with a pending livrable from Tasks 1-7's testing).
2. Confirm the deliverable now shows "Approuver" / "Demander des corrections" buttons (only for `status === 'review'`).
3. Click "Demander des corrections" — confirm the orange corrections-requested note appears and "Approuver" remains available while the "Demander des corrections" button disappears (matching `!d.correctionsRequested` guard).
4. Click "Approuver" — confirm both buttons disappear and the status label updates.
5. Navigate to the same resource's studio-side screen (from Tasks 4-7) — confirm the badge there now reflects the approval (proves the live-sync subscription still works end-to-end after a client-side action).

- [ ] **Step 7: Commit**

```bash
git add app/src/data/clientSessionStore.ts app/src/data/viewAsClientDataStore.ts app/src/screens/client/ClientProjectApercu.tsx docs/superpowers/specs/2026-07-26-client-deliverable-actions-migration.sql
git commit -m "feat(client-portal): add approve/request-corrections to the live client screen

ClientProjectApercu.tsx (the screen /mon-espace and /apercu-client actually
route to) only listed deliverables read-only — the working approve/
corrections actions lived in Portail.tsx, which no route points to anymore.
Ports the action to the live screen: direct taskStore write for the admin
preview path, a new narrowly-scoped RPC for real client accounts (their
RLS policy on tasks is read-only). Migration SQL included but not run —
per project convention, needs manual execution in Supabase SQL Editor."
```

---

### Task 9: End-to-end verification — client Portail actually receives the request

**Files:** none (verification-only task; fixes anything broken found during this pass, in whichever file(s) the bug lives in).

**Interfaces:** none new.

This is the task that proves the original bug (client never sees the approval request) is actually fixed — everything up to now only proved the studio side works.

- [ ] **Step 1: Create a fresh approval request**

In the Claude_Browser preview, open a video resource that has no linked livrable yet, click "Demander approbation".

- [ ] **Step 2: View it as the client**

Use "Voir en tant que" from `FicheClient.tsx` → Équipe tab (or navigate directly to `/apercu-client/:clientId/projets/:projectId` for the project, once a `viewAsStore` preview session is active) — this is the live route; `/portail/:projectId` no longer exists (see Task 8).

- [ ] **Step 3: Confirm it's visible and actionable**

Confirm the new livrable appears in the deliverables list with "Approuver"/"Demander des corrections" buttons (from Task 8), titled after the video resource. Click "Approuver".

- [ ] **Step 4: Confirm the studio side reflects the approval**

Navigate back to the video resource screen (studio view). Confirm the badge next to the title now reads "Approuvé" instead of "En attente d'approbation" (this proves the `subscribeStore` live-sync in `RequestApprovalButton.tsx` works, not just the initial render).

- [ ] **Step 5: Repeat steps 1-4 once for a document, image, and web resource, and once for a `ResourceDetail.tsx`-routed type (e.g. moodboard)**

Same check, one pass per remaining resource type, to catch any type-specific issue the video pass didn't (e.g. a wrong `deliverableType` mapping breaking the display for one type). Task 3's step 3 only checked the Aperçu (studio) side for a `ResourceDetail.tsx` type (screenplay/moodboard/inspirations/form) — this step is the first time one of those goes through the full client round-trip too.

- [ ] **Step 6: Final typecheck across the whole app**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 7: Push everything**

```bash
git push origin master
```

---

### Task 10: Make "Voir en tant que" preview read-only for deliverable actions

**Discovered in the final whole-branch review, addressed post-hoc at the user's request:** Task 8 gave the admin's "Voir en tant que" preview session the ability to actually approve/request-corrections on a deliverable — writing real data and creating a notification with `actor: 'Le client'`, even though no real client ever clicked anything. The user decided: preview should go back to being genuinely read-only (it's called "Voir en tant que" — see as — not "agir en tant que" — act as). Only a real client account, authenticated via `/mon-espace`, should be able to approve/reject.

**Files:**
- Modify: `app/src/screens/client/ClientProjectApercu.tsx` (gate the action buttons behind `!isPreview`, remove now-dead imports)
- Modify: `app/src/data/viewAsClientDataStore.ts` (remove the two now-unused preview-write functions — dead code per this project's "no backwards-compat hacks, delete what's unused" convention)

**Interfaces:**
- Consumes: `isPreview` (existing local const in `ClientProjectApercu.tsx`, derived from `getViewAsUser()`)
- Removes: `approvePreviewClientDeliverable`, `requestPreviewClientDeliverableCorrections` (added in Task 8, now unused) — confirm via `grep -rn "approvePreviewClientDeliverable\|requestPreviewClientDeliverableCorrections" app/src` that nothing else references them before deleting.

- [ ] **Step 1: Remove the two preview-write functions from `viewAsClientDataStore.ts`**

Read the current file in full first. Delete the `approvePreviewClientDeliverable` and `requestPreviewClientDeliverableCorrections` functions (added in Task 8, at the end of the file, after `getPreviewClientInvoices`). Also remove the now-unused imports this leaves behind: `updateTask` from `./taskStore` (keep `getDeliverables`, which is still used) and `addNotif` from `./notificationStore` (no longer used anywhere in this file once the two functions are gone — confirm before removing).

- [ ] **Step 2: Gate the action buttons in `ClientProjectApercu.tsx`**

Read the current file in full first (reproduced above in this plan's Task 8 for reference, but the file may have been touched by later fix commits — read the real current content). Make these changes:

1. Remove the now-dead imports `approvePreviewClientDeliverable, requestPreviewClientDeliverableCorrections` from the `viewAsClientDataStore` import line (keep `getPreviewClientProjects, getPreviewClientDeliverables`).
2. In `handleApprove`/`handleCorrections`, remove the `isPreview ? ... : ...` branch — since preview no longer supports these actions, these handlers are now only ever called when `!isPreview`, so they should just call the real-session functions directly:
```ts
const handleApprove = async (d: ClientDeliverable) => {
  if (!projectId) return;
  setActingId(d.id);
  const result = await approveClientDeliverable(d.id);
  if (result.ok) {
    setActionError(null);
    await load();
  } else {
    setActionError(t('portal.actionFailed'));
  }
  setActingId(null);
};

const handleCorrections = async (d: ClientDeliverable) => {
  if (!projectId) return;
  setActingId(d.id);
  const result = await requestClientDeliverableCorrections(d.id);
  if (result.ok) {
    setActionError(null);
    await load();
  } else {
    setActionError(t('portal.actionFailed'));
  }
  setActingId(null);
};
```
3. Wrap the existing `{d.status === 'review' && (...)}` action-buttons block with an additional `!isPreview` condition, so it becomes `{d.status === 'review' && !isPreview && (...)}` — read the exact current JSX around this block first (it's inside the `deliverables.map(d => ...)` block) and make the minimal one-condition change, don't restructure anything else.

- [ ] **Step 3: Typecheck**

Run from `app/`:
```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors (this removes code, so also confirm no other file imports the two deleted functions — if the grep from this task's Interfaces section found any other reference, stop and report instead of deleting).

- [ ] **Step 4: Live verification**

1. Via "Voir en tant que" (FicheClient.tsx → Équipe → a contact → "Voir en tant que"), navigate to a project with a pending deliverable (`status: 'review'`).
2. Confirm the deliverable still shows in the list (read-only — title, status label), but "Approuver"/"Demander des corrections" no longer appear.
3. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/client/ClientProjectApercu.tsx app/src/data/viewAsClientDataStore.ts
git commit -m "fix(client-portal): make 'Voir en tant que' preview read-only again

Task 8 let an admin's preview session actually approve/reject a
deliverable, writing real data and fabricating a 'Le client a...'
activity entry for an action no real client took. Previewing is meant
to show what the client sees, not act on their behalf — only a real
client account (/mon-espace) can approve or request corrections now."
```

---

### Task 11: "Relancer l'approbation" — resubmit after corrections requested

**Context:** the original design spec (`docs/superpowers/specs/2026-07-26-approval-requests-design.md`, "Flux" section, step 2) said a resource with an existing pending livrable should let the studio re-fire the approval notification rather than being stuck. What actually got built in Task 3: once any livrable is linked, `RequestApprovalButton` always renders a read-only status pill that navigates to Aperçu — there's no way to resubmit after the client requests corrections and the studio uploads a fix, short of manually changing the status in Aperçu. This task closes that gap directly on the resource screen, where the studio is already looking at the fixed content.

**Files:**
- Modify: `app/src/components/RequestApprovalButton.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (2 new keys)

**Interfaces:**
- Consumes: `updateTask(projectId, taskId, patch): void` (existing, `taskStore.ts:221`) — not yet imported in this file, needs adding.
- No new exports — this only changes `RequestApprovalButton`'s internal render logic.

- [ ] **Step 1: Add the 2 new i18n keys**

In `app/src/locales/fr.json`, in the existing `"approval"` object (already contains `livrableCreatedToast`, `viewLivrable`, `statusPending`, `statusApproved`, `statusCorrections` from Tasks 2 and the rest), add:
```json
    "relaunchApproval": "Relancer l'approbation",
    "relaunchedToast": "Nouvelle demande d'approbation envoyée au client"
```
In `app/src/locales/en.json`, in the matching `"approval"` object, add:
```json
    "relaunchApproval": "Resubmit for approval",
    "relaunchedToast": "New approval request sent to the client"
```

- [ ] **Step 2: Add the relaunch handler and update the render logic**

Read the current full content of `app/src/components/RequestApprovalButton.tsx` first (it was last fully rewritten in Task 3; no later task changed its internals, only its mount location in other files — so it should match Task 3's content exactly, but verify).

Add `updateTask` to the existing `taskStore` import:
```ts
import { addDeliverable, findLinkedDeliverable, subscribeStore, updateTask } from '../data/taskStore';
```

Add a new handler, right after the existing `handle` function:
```ts
const handleRelaunch = () => {
  if (!projectId || !linked) return;
  updateTask(projectId, linked.id, { status: 'review', correctionsRequested: false });
  addNotif({
    kind: 'approval',
    actor: USERS.lea.name,
    text: `a demandé l'approbation de « ${resource.title} »`,
    timestamp: Date.now(),
    resourceId: resource.id,
    taskId: linked.id,
    projectId,
  });
  showToast({ type: 'task', message: t('approval.relaunchedToast') });
};
```

Change the `if (linked) { ... }` block. It currently computes a `label`/`pillStatus` and always returns a pill. Split it: when `linked.correctionsRequested` is true, return a button (not a pill) that calls `handleRelaunch`; otherwise keep the existing pill behavior unchanged:
```tsx
if (linked) {
  if (linked.correctionsRequested) {
    return (
      <SFButton
        variant="primary"
        size={size}
        icon="refresh-cw"
        onClick={handleRelaunch}
        style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        {t('approval.relaunchApproval')}
      </SFButton>
    );
  }
  const label = linked.status === 'ok' ? t('approval.statusApproved') : t('approval.statusPending');
  const pillStatus: Status = linked.status;
  return (
    <button
      onClick={() => navigate(`/projets/${projectId}/overview`)}
      title={t('approval.viewLivrable')}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
    >
      <SFPill status={pillStatus} small={size === 'sm'}>{label}</SFPill>
    </button>
  );
}
```
(This removes the now-dead `t('approval.statusCorrections')` branch and the `linked.correctionsRequested ? 'warn' : ...` pill-status ternary from the old label/pillStatus computation, since that case is now handled by the early return above — read the exact current code first so this edit lands cleanly rather than leaving orphaned logic.)

- [ ] **Step 3: Typecheck**

Run from `app/`:
```bash
npx tsc --noEmit -p tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 4: Live verification**

1. Navigate to a resource whose linked livrable currently has `correctionsRequested: true` (use "Voir en tant que" to request corrections on a pending one first if none exists — Task 10 removed the client-preview UI for this, so trigger it via the studio side: open the livrable in Aperçu, or use the browser console to call `updateTask` directly against the demo store).
2. Confirm the resource screen now shows a "Relancer l'approbation" button (not a pill) instead of the old "Corrections demandées" pill.
3. Click it. Confirm: a toast appears, the button converts to the normal pending pill ("En attente d'approbation"), and in Aperçu the livrable's status is back to `review` with `correctionsRequested: false`.
4. Confirm the client (via "Voir en tant que") sees the deliverable again under pending review, without the corrections note.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/RequestApprovalButton.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(approval): resubmit for approval after corrections requested

Closes a gap from the original design spec's 'relaunch, don't
duplicate' intent — RequestApprovalButton previously only ever showed
a read-only status pill once a livrable existed, with no way to
resubmit after the client requested corrections and the studio fixed
the issue."
```
