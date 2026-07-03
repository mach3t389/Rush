# Livrables du Portail client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded, non-functional deliverables list in the client portal (`Portail.tsx`) with the real deliverable data already used by the studio (`Task` records with `deliverable: true`), and make Approve/Request-corrections actually persist and notify the studio.

**Architecture:** Two new small fields on `Task` (`sharedWithClient`, `correctionsRequested`) gate what the client sees and track client feedback separately from the existing 5-value `Status` enum. A new shared module `deliverableStatus.ts` centralizes how a deliverable's status is displayed (label/color/icon), used by both `TravailOverview.tsx` (studio) and `Portail.tsx` (client) so they never drift apart. `Portail.tsx` reads live data via the existing `taskStore` (`getDeliverables`/`subscribeStore`), matching the pattern `TravailOverview.tsx` already uses.

**Tech Stack:** React 19 + TypeScript, i18next (`useTranslation`), existing `taskStore.ts`/`notificationStore.ts` singleton stores, `SFButton`/`SFIcon`/`SFBar` UI primitives.

## Global Constraints

- No automated test suite exists in this project. Verification is `npx tsc --noEmit -p tsconfig.app.json` (run from `app/`) — **not** bare `npx tsc --noEmit`, which silently compiles zero files in this repo (its root `tsconfig.json` is `{ "files": [], "references": [...] }`). Compare the error count/list to the pre-existing baseline for files you didn't touch; only branch-introduced errors in files this plan modifies must be zero.
- **Never hard-code user-facing text.** Every new or changed string goes through `t('namespace.key')`, added to both `app/src/locales/fr.json` and `app/src/locales/en.json` before use.
- Do not widen the shared `Status` type (`app/src/types/index.ts`) to add a 6th "corrections requested" value — it's consumed by many `Record<Status, …>` maps across the codebase and a missing-case bug there was just found and fixed in the previous branch. Use the separate `correctionsRequested?: boolean` field instead (see spec).
- Out of scope (do not touch): the "Corrections en cours" sidebar panel (`VIDEO_CORRECTIONS` mock) in `Portail.tsx`, any real preview/player embedding, version history, portal authentication.
- Follow existing store conventions: `updateTask`/`getDeliverables`/`subscribeStore` from `app/src/data/taskStore.ts` (already exist, do not modify their signatures except where Task 1 specifies).

---

### Task 1: `Task` type fields + auto-clear logic + missing status-label i18n keys

**Files:**
- Modify: `app/src/types/index.ts` (the `Task` interface)
- Modify: `app/src/data/taskStore.ts:53-60` (the `updateTask` function)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Produces: `Task.sharedWithClient?: boolean`, `Task.correctionsRequested?: boolean`. `updateTask`'s behavior change: any call that sets `status` without explicitly setting `correctionsRequested` now also resets `correctionsRequested` to `false`.

- [ ] **Step 1: Add the two fields to `Task`**

In `app/src/types/index.ts`, in the `Task` interface, add after the existing line `linkedResources?: string[];`:

```ts
  sharedWithClient?: boolean;      // livrable visible dans le portail client
  correctionsRequested?: boolean;  // le client a demandé des changements sur ce livrable
```

- [ ] **Step 2: Auto-clear `correctionsRequested` on status change**

Replace the `updateTask` function in `app/src/data/taskStore.ts` (currently lines 53-60):

```ts
export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t),
  }));
  setSections(projectId, next);
}
```

with:

```ts
export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => {
      if (t.id !== taskId) return t;
      // Changing a deliverable's status is how the studio acknowledges client
      // feedback — clear correctionsRequested unless the caller is explicitly
      // setting it as part of this same patch.
      const resolvedPatch = (patch.status !== undefined && patch.correctionsRequested === undefined)
        ? { ...patch, correctionsRequested: false }
        : patch;
      return { ...t, ...resolvedPatch };
    }),
  }));
  setSections(projectId, next);
}
```

- [ ] **Step 3: Add the 5 missing deliverable-status i18n keys (pre-existing gap) + 1 new one**

These 5 keys (`overview.deliverableToDeliver`, `overview.deliverableInProgress`, `overview.deliverableApproved`, `overview.deliverableInReview`, `overview.deliverableOverdue`) are referenced today by `TravailOverview.tsx`'s `DELIVERABLE_STATUS` map but **do not exist** in either locale file — confirmed by direct search. This plan surfaces the deliverables feature to real users for the first time (no seed task in `mock.ts` has `deliverable: true`, so this gap was never visible before), so it must be fixed here.

In `app/src/locales/fr.json`, in the `"overview"` block, insert after the line `"delivOther": "Autre",` (currently line 809):

```json
    "deliverableToDeliver": "À livrer",
    "deliverableInProgress": "En cours",
    "deliverableApproved": "Approuvé",
    "deliverableInReview": "En révision",
    "deliverableOverdue": "En retard",
    "deliverableCorrectionsRequested": "Corrections demandées",
```

In `app/src/locales/en.json`, in the `"overview"` block, insert after the line `"delivOther": "Other",` (currently line 809):

```json
    "deliverableToDeliver": "To deliver",
    "deliverableInProgress": "In progress",
    "deliverableApproved": "Approved",
    "deliverableInReview": "In review",
    "deliverableOverdue": "Overdue",
    "deliverableCorrectionsRequested": "Corrections requested",
```

- [ ] **Step 4: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "taskStore.ts|types/index.ts"`
Expected: no output.

- [ ] **Step 5: Validate JSON**

Run (from `app/`): `node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add app/src/types/index.ts app/src/data/taskStore.ts app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add sharedWithClient/correctionsRequested to Task, fix missing deliverable-status i18n keys"
```

---

### Task 2: `deliverableStatus.ts` — shared status display (new file)

**Files:**
- Create: `app/src/data/deliverableStatus.ts`

**Interfaces:**
- Consumes: `Task` type from `../types` (has `status: Status` and, after Task 1, `correctionsRequested?: boolean`).
- Produces: `interface DeliverableDisplay { color: string; icon: string; labelKey: string }`; `getDeliverableDisplay(task: Task): DeliverableDisplay`.

- [ ] **Step 1: Create the file**

```ts
// Shared status→display mapping for deliverables (Task with deliverable: true).
// Used by both TravailOverview.tsx (studio) and Portail.tsx (client) so the
// two views never show different colors/labels for the same underlying state.

import type { Task } from '../types';

export interface DeliverableDisplay {
  color: string;
  icon: string;
  labelKey: string;
}

const DELIVERABLE_STATUS: Record<string, DeliverableDisplay> = {
  warn:   { labelKey: 'overview.deliverableToDeliver',  color: 'var(--text-3)', icon: 'clock' },
  info:   { labelKey: 'overview.deliverableInProgress', color: 'var(--info)',   icon: 'loader' },
  ok:     { labelKey: 'overview.deliverableApproved',   color: 'var(--ok)',     icon: 'check-circle' },
  review: { labelKey: 'overview.deliverableInReview',   color: 'var(--review)', icon: 'eye' },
  danger: { labelKey: 'overview.deliverableOverdue',    color: 'var(--danger)', icon: 'alert-circle' },
};

const CORRECTIONS_REQUESTED: DeliverableDisplay = {
  labelKey: 'overview.deliverableCorrectionsRequested',
  color: '#a85f3e',
  icon: 'alert-triangle',
};

export function getDeliverableDisplay(task: Task): DeliverableDisplay {
  if (task.correctionsRequested) return CORRECTIONS_REQUESTED;
  return DELIVERABLE_STATUS[task.status] ?? DELIVERABLE_STATUS['warn'];
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "deliverableStatus.ts"`
Expected: no output. (Not imported anywhere yet — this only checks the file compiles standalone.)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/deliverableStatus.ts
git commit -m "feat: add shared deliverableStatus display helper"
```

---

### Task 3: `TravailOverview.tsx` — use shared status helper + "Partager avec le client" toggle

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx` (imports, remove local `DELIVERABLE_STATUS`, deliverable row rendering)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getDeliverableDisplay` from `../data/deliverableStatus` (Task 2); `updateTask` from `../data/taskStore` (already imported in this file).

- [ ] **Step 1: Import the shared helper and remove the local constant**

In `app/src/screens/TravailOverview.tsx`, add to the imports (near the other `../data/*` imports, e.g. after the line `import { getDeliverables, addDeliverable, updateTask, subscribeStore, getSections } from '../data/taskStore';`):

```tsx
import { getDeliverableDisplay } from '../data/deliverableStatus';
```

Remove the local constant (currently lines 68-74):

```tsx
const DELIVERABLE_STATUS: Record<string, { labelKey:string; color:string; icon:string }> = {
  warn:   { labelKey:'overview.deliverableToDeliver', color:'var(--text-3)', icon:'clock'        },
  info:   { labelKey:'overview.deliverableInProgress', color:'var(--info)',  icon:'loader'       },
  ok:     { labelKey:'overview.deliverableApproved',  color:'var(--ok)',     icon:'check-circle' },
  review: { labelKey:'overview.deliverableInReview',  color:'var(--review)', icon:'eye'          },
  danger: { labelKey:'overview.deliverableOverdue',   color:'var(--danger)', icon:'alert-circle' },
};
```

- [ ] **Step 2: Update the usage sites**

Find the line (search for it — it's inside the `deliverables.map((dl) => { ... })` block, previously around line 631):

```tsx
              const st = DELIVERABLE_STATUS[dl.status] ?? DELIVERABLE_STATUS['warn'];
```

Replace with:

```tsx
              const st = getDeliverableDisplay(dl);
```

Then find the "Statut" cell further down in the same `.map()` block (previously line 794):

```tsx
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 600, color: st.color }}>{st.label}</span>
```

Replace with:

```tsx
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 600, color: st.color }}>{t(st.labelKey)}</span>
```

(`{st.label}` was reading a field that doesn't exist on the status object — a pre-existing bug where the "Statut" column has always rendered blank, since no seed task ever had `deliverable: true` to exercise this code path. `getDeliverableDisplay` only exposes `labelKey`, not a pre-resolved `label`, so this fixes both the missing-import and the blank-column bug in the same edit.)

No other line in this file's deliverables `.map()` block needs to change: the icon box (`st.icon`/`st.color`, previously around lines 651-652) already uses the two fields `DeliverableDisplay` provides and requires no edit. Do not touch the separate, unrelated `st` variable used later in the file's "Factures" section (`INVOICE_STATUS`) — it is a different object with a `bg` field that `DeliverableDisplay` intentionally does not have, and is out of scope for this task.

- [ ] **Step 3: Add the "Partager avec le client" toggle button**

Find this exact sequence (the end of the "Bouton lier une ressource existante" block, followed by the closing of the outer "Label + sous-tâches + ressources liées" flex container, followed by the start of the "Type — clickable dropdown" section):

```tsx
                        </>
                      )}
                    </div>
                  </div>

                  {/* Type — clickable dropdown */}
```

Replace it with (inserting the new button between the two `</div>` lines, so it becomes a flex sibling of the paperclip button's wrapper `<div>`, both still inside the outer row cell):

```tsx
                        </>
                      )}
                    </div>

                    {/* Bouton partager avec le client */}
                    <button onClick={e => { e.stopPropagation(); updateTask(project.id, dl.id, { sharedWithClient: !dl.sharedWithClient }); }}
                      title={dl.sharedWithClient ? t('overview.unshareWithClient') : t('overview.shareWithClient')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: dl.sharedWithClient ? 'rgba(249,255,0,0.08)' : 'var(--surface-3)', border: `1px solid ${dl.sharedWithClient ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: dl.sharedWithClient ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
                      <SFIcon name={dl.sharedWithClient ? 'eye' : 'eye-off'} size={12} color={dl.sharedWithClient ? 'var(--accent)' : 'var(--text-3)'} />
                    </button>
                  </div>

                  {/* Type — clickable dropdown */}
```

(`updateTask` and `SFIcon` are already imported in this file. This sequence — `</>`, `)}`, `</div>`, `</div>`, blank line, the Type-dropdown comment — appears only once in this file, at the end of the deliverables row; if a search for it turns up more than one match, stop and ask before editing.)

- [ ] **Step 4: Add the two new i18n keys**

In `app/src/locales/fr.json`, in the `"overview"` block, insert after the line `"deliverableCorrectionsRequested": "Corrections demandées",` (added in Task 1):

```json
    "shareWithClient": "Partager avec le client",
    "unshareWithClient": "Retirer du portail client",
```

In `app/src/locales/en.json`, in the `"overview"` block, insert after the line `"deliverableCorrectionsRequested": "Corrections requested",`:

```json
    "shareWithClient": "Share with client",
    "unshareWithClient": "Remove from client portal",
```

- [ ] **Step 5: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "TravailOverview.tsx"`
Expected: no output.

- [ ] **Step 6: Manual verification via Preview**

Start the dev server, sign in, open a project's Vue d'ensemble (`/projets/:id/overview`), find "Livrables client", add one if none exist (button "+ Ajouter"). Confirm the new eye/eye-off button appears next to the trombone, toggles between the two visual states on click, and that the deliverable's status label/color still render correctly (via the shared helper).

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/TravailOverview.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add client-sharing toggle to studio deliverables, use shared status helper"
```

---

### Task 4: `Portail.tsx` — real deliverables, live approve/corrections, missing i18n

**Files:**
- Modify: `app/src/screens/Portail.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getDeliverables`, `updateTask`, `subscribeStore` from `../data/taskStore`; `getDeliverableDisplay` from `../data/deliverableStatus` (Task 2); `formatDisplay` from `../components/ui`; `Task`, `DeliverableType` types from `../types`.

- [ ] **Step 1: Replace the imports**

Replace (currently `app/src/screens/Portail.tsx:1-8`):

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { VIDEO_CORRECTIONS } from '../data/mock';
import { findProject } from '../data/projectStore';
import { addNotif } from '../data/notificationStore';
import { SFPill, SFBar, SFButton, SFIcon } from '../components/ui';
import { getInvoicesByProject, getEnabledPaymentMethods, formatMoney, type Invoice } from '../data/financeStore';
```

with:

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { VIDEO_CORRECTIONS } from '../data/mock';
import { findProject } from '../data/projectStore';
import { addNotif } from '../data/notificationStore';
import { getDeliverables, updateTask, subscribeStore } from '../data/taskStore';
import { getDeliverableDisplay } from '../data/deliverableStatus';
import { SFPill, SFBar, SFButton, SFIcon, formatDisplay } from '../components/ui';
import { getInvoicesByProject, getEnabledPaymentMethods, formatMoney, type Invoice } from '../data/financeStore';
import type { Task, DeliverableType } from '../types';

const DELIVERABLE_TYPE_ICON: Record<DeliverableType, string> = {
  video: 'video', photo: 'image', audio: 'music', document: 'file-text', web: 'globe',
  graphique: 'pen-tool', service: 'briefcase', produit: 'package-2', autre: 'circle-dashed',
};

const DELIVERABLE_TYPE_LABEL: Record<DeliverableType, string> = {
  video: 'overview.delivVideo', photo: 'overview.delivPhoto', audio: 'overview.delivAudio',
  document: 'overview.delivDocument', web: 'overview.delivWeb', graphique: 'overview.delivGraphic',
  service: 'overview.delivService', produit: 'overview.delivProduct', autre: 'overview.delivOther',
};
```

(`DELIVERABLE_TYPE_ICON`/`DELIVERABLE_TYPE_LABEL` intentionally duplicate the small mapping already in `TravailOverview.tsx`'s `DELIVERABLE_TYPES` array — the approved design only calls for extracting the *status* helper, not the type labels, and this mapping is 9 short lines with no logic. Do not attempt to also extract this one; it's out of scope for this plan.)

- [ ] **Step 2: Replace component state and handlers**

Replace (currently `app/src/screens/Portail.tsx:85-130`, from the `const [approved, setApproved]` line through the end of `handleCorrections`):

```tsx
  const [approved, setApproved] = useState(false);
  const [requestedCorrections, setRequestedCorrections] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);

  const openInvoices = getInvoicesByProject(project.id).filter(i => ['sent', 'viewed', 'overdue'].includes(i.status));
  const paymentMethods = getEnabledPaymentMethods();

  const currentPhaseIdx = PHASE_ORDER.indexOf(project.phase);
  const phases = [
    { label: t('portal.phasePreproduction'),  done: currentPhaseIdx >= 0 },
    { label: t('portal.phaseProduction'),     done: currentPhaseIdx >= 1 },
    { label: t('portal.phasePostproduction'), done: currentPhaseIdx >= 2 },
    { label: t('portal.phaseDelivery'),       done: currentPhaseIdx >= 3 },
  ];

  const LIVRABLES = [
    { name: 'Rough Cut Final — V4', version: 'V4', type: t('portal.deliverableTypeVideo'),  status: 'review' as const, label: t('portal.statusInReview'),    date: '8 juin 2025',  pending: true  },
    { name: 'Scénario V3',          version: 'V3', type: t('portal.deliverableTypeScript'), status: 'ok'     as const, label: t('portal.statusApproved'),    date: '1 juin 2025',  pending: false },
    { name: 'Rough Cut V3',         version: 'V3', type: t('portal.deliverableTypeVideo'),  status: 'danger'  as const, label: t('portal.statusCorrections'), date: '28 mai 2025',  pending: false },
    { name: 'Rough Cut V2',         version: 'V2', type: t('portal.deliverableTypeVideo'),  status: 'ok'      as const, label: t('portal.statusApproved'),    date: '20 mai 2025',  pending: false },
  ];
  const pendingLivrable = LIVRABLES[0];

  const handleApprove = () => {
    setApproved(true);
    addNotif({
      kind: 'status',
      actor: project.clientName,
      text: `a approuvé le livrable "${pendingLivrable.name}"`,
      timestamp: Date.now(),
      projectId: project.id,
    });
  };

  const handleCorrections = () => {
    setRequestedCorrections(true);
    addNotif({
      kind: 'comment',
      actor: project.clientName,
      text: `a demandé des corrections sur "${pendingLivrable.name}"`,
      timestamp: Date.now(),
      projectId: project.id,
    });
  };
```

with:

```tsx
  const [showMessage, setShowMessage] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Task[]>(() => getDeliverables(project.id).filter(d => d.sharedWithClient));

  useEffect(() => subscribeStore(() => setDeliverables(getDeliverables(project.id).filter(d => d.sharedWithClient))), [project.id]);

  const openInvoices = getInvoicesByProject(project.id).filter(i => ['sent', 'viewed', 'overdue'].includes(i.status));
  const paymentMethods = getEnabledPaymentMethods();

  const currentPhaseIdx = PHASE_ORDER.indexOf(project.phase);
  const phases = [
    { label: t('portal.phasePreproduction'),  done: currentPhaseIdx >= 0 },
    { label: t('portal.phaseProduction'),     done: currentPhaseIdx >= 1 },
    { label: t('portal.phasePostproduction'), done: currentPhaseIdx >= 2 },
    { label: t('portal.phaseDelivery'),       done: currentPhaseIdx >= 3 },
  ];

  const pendingDeliverables = deliverables.filter(d => d.status === 'review');
  const historyDeliverables = deliverables.filter(d => d.status !== 'review');

  const handleApprove = (dl: Task) => {
    updateTask(project.id, dl.id, { status: 'ok', correctionsRequested: false });
    addNotif({
      kind: 'approval',
      actor: project.clientName,
      text: `a approuvé le livrable "${dl.title}"`,
      taskId: dl.id,
      timestamp: Date.now(),
      projectId: project.id,
    });
  };

  const handleCorrections = (dl: Task) => {
    updateTask(project.id, dl.id, { correctionsRequested: true });
    addNotif({
      kind: 'comment',
      actor: project.clientName,
      text: `a demandé des corrections sur "${dl.title}"`,
      taskId: dl.id,
      timestamp: Date.now(),
      projectId: project.id,
    });
  };
```

- [ ] **Step 3: Replace the pending-card + confirmation-banner + history JSX**

Replace the entire block from the `{/* Livrable en attente */}` comment through the end of the `{/* Historique des livrables */}` `<div>` (currently `app/src/screens/Portail.tsx:184-273`):

```tsx
          {/* Livrable en attente */}
          {!approved && !requestedCorrections && (
            <div style={{
              background: 'var(--surface)', borderRadius: 'var(--radius)',
              border: '1px solid var(--accent)', padding: 24,
            }}>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                {t('portal.awaitingYourApproval')}
              </p>

              <div style={{
                aspectRatio: '16/9', borderRadius: 10,
                background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 11px), var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, border: '1px solid var(--border)', cursor: 'pointer',
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'rgba(249,255,0,0.12)', border: '1px solid var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <SFIcon name="play" size={22} color="var(--accent)" />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{pendingLivrable.name}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                    {pendingLivrable.type} · {pendingLivrable.version} · {t('portal.sharedOn', { date: pendingLivrable.date })}
                  </p>
                </div>
                <SFPill status={pendingLivrable.status} small>{pendingLivrable.label}</SFPill>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <SFButton variant="primary" icon="check" onClick={handleApprove} style={{ flex: 1, justifyContent: 'center' }}>
                  {t('portal.approve')}
                </SFButton>
                <SFButton variant="secondary" icon="message-circle" onClick={handleCorrections} style={{ flex: 1, justifyContent: 'center' }}>
                  {t('portal.requestCorrections')}
                </SFButton>
              </div>
            </div>
          )}

          {/* Confirmation après action */}
          {(approved || requestedCorrections) && (
            <div style={{
              background: 'var(--surface)', borderRadius: 'var(--radius)',
              border: `1px solid ${approved ? 'var(--ok)' : 'var(--warn)'}`,
              padding: 24, display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <SFIcon name={approved ? 'check-circle' : 'message-circle'} size={28} color={approved ? 'var(--ok)' : 'var(--warn)'} />
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  {approved ? t('portal.deliverableApproved') : t('portal.correctionsRequested')}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {approved
                    ? t('portal.teamNotifiedThanks')
                    : t('portal.teamNotifiedCorrections')
                  }
                </p>
              </div>
            </div>
          )}

          {/* Historique des livrables */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{t('portal.deliverableHistory')}</p>
            {LIVRABLES.slice(1).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: i < LIVRABLES.length - 2 ? '1px solid var(--border)' : 'none' }}>
                <div style={{
                  width: 48, height: 32, borderRadius: 6, flexShrink: 0,
                  background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 9px), var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <SFIcon name="film" size={12} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                    {item.type} · {item.version} · {item.date}
                  </p>
                </div>
                <SFPill status={item.status} small>{item.label}</SFPill>
              </div>
            ))}
          </div>
```

with:

```tsx
          {deliverables.length === 0 ? (
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 32, textAlign: 'center' }}>
              <SFIcon name="package" size={28} color="var(--text-3)" />
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 12 }}>{t('portal.noDeliverablesShared')}</p>
            </div>
          ) : (
            <>
              {/* Livrables en attente d'approbation */}
              {pendingDeliverables.map(dl => {
                const typeIcon = DELIVERABLE_TYPE_ICON[dl.deliverableType ?? 'autre'];
                const typeLabel = t(DELIVERABLE_TYPE_LABEL[dl.deliverableType ?? 'autre']);
                return (
                  <div key={dl.id} style={{
                    background: 'var(--surface)', borderRadius: 'var(--radius)',
                    border: '1px solid var(--accent)', padding: 24,
                  }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                      {t('portal.awaitingYourApproval')}
                    </p>

                    <div style={{
                      aspectRatio: '16/9', borderRadius: 10,
                      background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 11px), var(--surface-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 16, border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'rgba(249,255,0,0.12)', border: '1px solid var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <SFIcon name={typeIcon} size={22} color="var(--accent)" />
                      </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{dl.title}</p>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                        {typeLabel} · {t('portal.sharedOn', { date: formatDisplay(dl.dueDate) })}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <SFButton variant="primary" icon="check" onClick={() => handleApprove(dl)} style={{ flex: 1, justifyContent: 'center' }}>
                        {t('portal.approve')}
                      </SFButton>
                      <SFButton variant="secondary" icon="message-circle" onClick={() => handleCorrections(dl)} style={{ flex: 1, justifyContent: 'center' }}>
                        {t('portal.requestCorrections')}
                      </SFButton>
                    </div>
                  </div>
                );
              })}

              {/* Historique des livrables */}
              {historyDeliverables.length > 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{t('portal.deliverableHistory')}</p>
                  {historyDeliverables.map((item, i) => {
                    const display = getDeliverableDisplay(item);
                    const typeIcon = DELIVERABLE_TYPE_ICON[item.deliverableType ?? 'autre'];
                    const typeLabel = t(DELIVERABLE_TYPE_LABEL[item.deliverableType ?? 'autre']);
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: i < historyDeliverables.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{
                          width: 48, height: 32, borderRadius: 6, flexShrink: 0,
                          background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 9px), var(--surface-2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <SFIcon name={typeIcon} size={12} color="var(--text-3)" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 500, fontSize: 13 }}>{item.title}</p>
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                            {typeLabel} · {formatDisplay(item.dueDate)}
                          </p>
                        </div>
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 600, color: display.color, background: `${display.color}18`, border: `1px solid ${display.color}44`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                          {t(display.labelKey)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
```

- [ ] **Step 4: Add the i18n keys**

In `app/src/locales/fr.json`, in the `"portal"` block, replace the line `"deliverableTypeVideo": "Vidéo",` through `"statusCorrections": "Corrections demandées",` (currently 5 lines, right after `"phaseDelivery": "Livraison",`) with:

```json
    "studioView": "Vue studio",
    "awaitingYourApproval": "En attente de votre approbation",
    "sharedOn": "Partagé le {{date}}",
    "approve": "Approuver",
    "requestCorrections": "Demander des corrections",
    "deliverableHistory": "Historique des livrables",
    "noDeliverablesShared": "Aucun livrable partagé pour le moment.",
    "projectProgress": "Avancement du projet",
    "correctionsInProgress": "Corrections en cours",
    "studioContact": "Contact studio",
    "creativeDirector": "Directrice créative",
    "sendMessage": "Envoyer un message",
    "expectedDelivery": "Livraison prévue",
    "projectStatus": "Statut du projet",
```

(This removes the 5 now-dead keys `deliverableTypeVideo`/`deliverableTypeScript`/`statusInReview`/`statusApproved`/`statusCorrections` — they were only used by the deleted `LIVRABLES` mock — and adds the 13 keys that were referenced by this file's JSX but never had translations, plus `noDeliverablesShared` for the new empty state. Do not remove `statusInReview`/`statusApproved` etc. from any *other* namespace block in the file — only from inside `"portal"`.)

In `app/src/locales/en.json`, in the `"portal"` block, replace the equivalent 5 lines with:

```json
    "studioView": "Studio view",
    "awaitingYourApproval": "Awaiting your approval",
    "sharedOn": "Shared on {{date}}",
    "approve": "Approve",
    "requestCorrections": "Request corrections",
    "deliverableHistory": "Deliverable history",
    "noDeliverablesShared": "No deliverables shared yet.",
    "projectProgress": "Project progress",
    "correctionsInProgress": "Corrections in progress",
    "studioContact": "Studio contact",
    "creativeDirector": "Creative director",
    "sendMessage": "Send a message",
    "expectedDelivery": "Expected delivery",
    "projectStatus": "Project status",
```

- [ ] **Step 5: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "Portail.tsx"`
Expected: no output. (This also confirms removing `approved`/`requestedCorrections`/`LIVRABLES`/`pendingLivrable` didn't leave any dangling reference — the rest of the file, e.g. "Contact studio"/"Livraison prévue"/"Statut" cards further down, already used `t('portal.studioContact')` etc., which now resolve to real strings instead of missing keys, with no code changes needed there.)

- [ ] **Step 6: Validate JSON**

Run (from `app/`): `node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 7: Manual verification via Preview**

Start the dev server, sign in, go to a project's Vue d'ensemble, add a deliverable, share it (Task 3's toggle), set its status to "En révision" via the normal task status control. Then open `/portail/<projectId>` in a new tab:
- Expected: the deliverable appears as a pending-approval card with its real title, type, and due date (no more "Rough Cut Final — V4").
- Click "Approuver": expected the card disappears from "en attente" and reappears in "Historique des livrables" with an "Approuvé" badge; back in the studio Vue d'ensemble, the deliverable's status is now "Approuvé" and a clickable notification appears in the bell.
- On another deliverable, click "Demander des corrections": expected an orange "Corrections demandées" badge appears (distinct from the red "En retard" color), and a notification appears studio-side.
- In the studio, change that deliverable's status via the normal status control: expected the "Corrections demandées" badge disappears next time the portal reflects the change (same tab, live update via `subscribeStore`).
- Toggle "Partager avec le client" off for a deliverable: expected it disappears from the portal immediately.
- Unshare all deliverables: expected the empty-state message appears.

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/Portail.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: wire client portal deliverables to real Task data, fix missing portal i18n keys"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Full flow, multiple deliverables**

Create two deliverables on the same project, share both, set both to "En révision". Open the portal.
Expected: two separate pending-approval cards, each with its own Approve/Corrections buttons acting independently on the correct deliverable (verify by approving only one and confirming the other stays pending).

- [ ] **Step 2: Non-shared deliverables stay hidden**

Create a third deliverable, do NOT share it.
Expected: it never appears in the portal, regardless of its status.

- [ ] **Step 3: `correctionsRequested` auto-clear**

Request corrections on a deliverable from the portal. Confirm the orange badge appears in both `TravailOverview.tsx` and the portal. In the studio, change that deliverable's status to any value via the normal task status control. Reload the portal tab.
Expected: the orange "Corrections demandées" badge is gone, replaced by whatever status label matches the new status.

- [ ] **Step 4: Final typecheck across all touched files**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "types/index.ts|taskStore.ts|deliverableStatus.ts|TravailOverview.tsx|Portail.tsx"`
Expected: no output.

- [ ] **Step 5: Lint**

Run (from `app/`): `npm run lint`
Expected: no new errors in the files this plan touched, compared to the pre-existing baseline (this repo has a large number of pre-existing lint errors unrelated to this branch — do not attempt to fix those).
