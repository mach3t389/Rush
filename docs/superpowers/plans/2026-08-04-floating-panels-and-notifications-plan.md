# Floating Panels Unification + Notification Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge every centered modal in the app (including `SFModal`) onto one visual style, convert `TaskPanel` and three other side panels to that same floating-centered style (with `TaskPanel` gaining a two-column Trello-style layout), and fix two notification bugs (unread state never clears on open; navigation doesn't land on the specific comment).

**Architecture:** `SFModal.tsx`'s style values change first since every later task either consumes it directly or is built to match it. Hand-rolled modals are migrated to wrap `<SFModal>` one file at a time. `TaskPanel`'s outer chrome and body layout change without touching its ~30 pieces of internal state or its sub-pickers. Notification fixes touch `notificationStore.ts`, `commentNotify.ts`, `Activite.tsx`, and each of the three screens that mount `TaskPanel` from a notification link.

**Tech Stack:** React 19 + TypeScript, Vite, react-i18next. No automated test suite in this repo — verification is `npm run build` (typecheck) + manual browser checks via the dev server, per this repo's established convention (see other plans under `docs/superpowers/plans/`).

**Design doc:** `docs/superpowers/specs/2026-08-04-floating-panels-and-notifications-design.md` — read this first.

## Global Constraints

- Canonical modal style (from the design doc, Section 1): border-radius `16`, backdrop `rgba(0,0,0,0.6)`, box-shadow `0 20px 60px rgba(0,0,0,0.5)`, title `fontSize:15, fontWeight:700`.
- Anchored dropdowns/pickers (`components/ui/DatePicker.tsx`, `components/SubtaskTargetPicker.tsx`, inline context menus) are explicitly OUT OF SCOPE — do not touch them.
- Every task that changes a `.tsx` file ends with `npm run build` (run from `app/`) showing 0 errors before moving to the next task.
- Every new user-facing string goes through `t('<namespace>.<key>')` in both `app/src/locales/fr.json` and `en.json`, added at the same relative position in both files.
- No automated tests exist — "verify" steps mean: start the dev server (`npm run dev` from `app/`, or the harness's `preview_start`), navigate to the relevant screen, and visually/functionally confirm the described behavior.

---

### Task 1: `SFModal.tsx` — canonical style values

**Files:**
- Modify: `app/src/components/ui/SFModal.tsx`

**Interfaces:**
- Produces: `<SFModal>` now renders at the new canonical style. No prop signature changes — every existing caller (`Travail.tsx`'s move-task modal, and all callers added in later tasks) is unaffected by this task alone.

- [ ] **Step 1: Update the four style values**

In `app/src/components/ui/SFModal.tsx`, in the inner card `<div>` (around line 56-62) and the backdrop `<div>` (around line 50):

```tsx
      <div onMouseDown={closeOnBackdrop ? onClose : undefined} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)',
        borderRadius: 16, padding, width, maxHeight,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: maxHeight ? 'hidden' : 'visible',
      }}>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>
```

(Only the backdrop's `background`, the card's `borderRadius`/`boxShadow`, and the title `<h3>`'s `fontSize` change — every other line in this block stays exactly as-is.)

- [ ] **Step 2: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 3: Verify visually**

Start the dev server, open any screen that already uses `<SFModal>` (e.g. `Travail.tsx`'s "move task" action from a task's right-click menu), and confirm the dialog now shows 16px rounded corners, a darker (60%) backdrop, and a 15px bold title.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ui/SFModal.tsx
git commit -m "style(modal): converge SFModal on the app's de facto canonical modal style"
```

---

### Task 2: `Taches.tsx` bulk move/copy modal → `SFModal`

**Files:**
- Modify: `app/src/screens/Taches.tsx` (~line 202-243, per the pre-plan style survey — read the current file first to confirm exact line numbers, since earlier tasks in other chantiers may have shifted them)

**Interfaces:**
- Consumes: `SFModal` from `../components/ui` (Task 1).

- [ ] **Step 1: Read the current modal implementation**

Read `app/src/screens/Taches.tsx` around the bulk move/copy modal (search for its hand-rolled backdrop `position:fixed` div and card div — it currently uses `background: rgba(0,0,0,0.6)`, `borderRadius: 16`, `boxShadow: '0 20px 60px rgba(0,0,0,0.5)'`, title `fontSize:15, fontWeight:700`, width `420`).

- [ ] **Step 2: Replace the hand-rolled wrapper with `<SFModal>`**

Import `SFModal` from `../components/ui` if not already imported. Replace the modal's outer `position:fixed` backdrop `<div>` + card `<div>` + manual `<h3>` title + close button with:

```tsx
<SFModal open={showBulkMoveModal} onClose={() => setShowBulkMoveModal(false)} title={t('tasks.bulkMoveTitle')} width={420}>
  {/* existing modal body content, unchanged */}
</SFModal>
```

(Substitute the actual state variable and title translation key already used by this modal — do not invent new ones. The existing inner content — project/section pickers, confirm button, etc. — moves inside `<SFModal>` unchanged; only the outer chrome is replaced.)

- [ ] **Step 3: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 4: Verify visually**

Open Mes tâches, select multiple tasks, trigger the bulk move/copy modal, and confirm it still opens/closes/functions identically, now with the `SFModal` chrome (same values as before this migration, since Task 1 already made `SFModal` match this modal's pre-existing style — this should be a purely structural change with no visible difference from Task 1's state).

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Taches.tsx
git commit -m "refactor(modal): migrate Taches.tsx bulk move/copy modal to SFModal"
```

---

### Task 3: `Travail.tsx` move-section + bulk-move modals → `SFModal`

**Files:**
- Modify: `app/src/screens/Travail.tsx` (~line 251-267 and ~line 295-341, per the pre-plan survey — confirm exact lines by reading the file)

**Interfaces:**
- Consumes: `SFModal` from `../components/ui` (Task 1).

- [ ] **Step 1: Read both modals' current implementation**

Read `app/src/screens/Travail.tsx` around both hand-rolled modals (move-section, ~line 251-267; bulk-move, ~line 295-341). Both currently use `rgba(0,0,0,0.6)` backdrop, radius `16`, shadow `0 20px 60px rgba(0,0,0,0.5)`, title `15/700`.

- [ ] **Step 2: Replace both wrappers with `<SFModal>`**

For each modal, same pattern as Task 2 Step 2 — replace the hand-rolled backdrop/card/title/close-button with `<SFModal open={...} onClose={...} title={...} width={380 /* move-section */ | 420 /* bulk-move */}>`, keeping each modal's existing inner content and state variables unchanged.

- [ ] **Step 3: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 4: Verify visually**

Open a project's Travail (list) view. Trigger "move section" (section header menu) and a bulk-move (multi-select tasks, then move) — confirm both still work identically with `SFModal` chrome.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "refactor(modal): migrate Travail.tsx move-section and bulk-move modals to SFModal"
```

---

### Task 4: `Clients.tsx` new-client modal → `SFModal`

**Files:**
- Modify: `app/src/screens/Clients.tsx` (~line 110-186, per the pre-plan survey)

**Interfaces:**
- Consumes: `SFModal` from `../components/ui` (Task 1).

- [ ] **Step 1: Read the current modal implementation**

Read `app/src/screens/Clients.tsx` around the new-client/new-group modal. It currently uses a distinct third style (`rgba(0,0,0,0.65)` backdrop, radius `18`, shadow `0 24px 72px rgba(0,0,0,0.6)`, title `17/700`, width `480`) — this one DOES change visually once migrated, since it wasn't already at the majority style.

- [ ] **Step 2: Replace the wrapper with `<SFModal>`**

Same pattern as Task 2 Step 2 — `<SFModal open={...} onClose={...} title={...} width={480}>`. Since this modal's title/radius/shadow were previously distinct, this migration is the one that visibly changes it to match everything else (16px radius, 15px title, `0 20px 60px rgba(0,0,0,0.5)` shadow) — that's the intended unification, not a regression.

- [ ] **Step 3: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 4: Verify visually**

Open Membres → Groupes (or wherever "Nouveau groupe" is triggered — this modal is shared, per `Membres.tsx`'s reuse of `Clients.tsx`'s exported `NewClientModal`). Confirm it opens with the new unified chrome and still creates a group correctly.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Clients.tsx
git commit -m "refactor(modal): migrate Clients.tsx new-client modal to SFModal, unifying its previously-distinct style"
```

---

### Task 5: `FicheClient.tsx` invite/assign/view-as modals → `SFModal`

**Files:**
- Modify: `app/src/screens/FicheClient.tsx` (~line 81-83, ~180-182, ~650-676, per the pre-plan survey)

**Interfaces:**
- Consumes: `SFModal` from `../components/ui` (Task 1).

- [ ] **Step 1: Read all three modals' current implementation**

Read `app/src/screens/FicheClient.tsx` around: invite-person modal (~81-83, width 440), assign-members modal (~180-182, width 400), view-as project picker (~650-676, width 340 — already closest to canonical since it used `14/700` pre-migration).

- [ ] **Step 2: Replace all three wrappers with `<SFModal>`**

Same pattern as Task 2 Step 2, once per modal, preserving each one's existing width and inner content/state.

- [ ] **Step 3: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 4: Verify visually**

Open a group's detail page (`/membres` → Groupes → any group, or directly `/clients/:id`). Trigger: invite a person, assign a member to a project, and (if a "view as" affordance is visible for this account) the view-as project picker. Confirm all three still work with the unified chrome.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/FicheClient.tsx
git commit -m "refactor(modal): migrate FicheClient.tsx invite/assign/view-as modals to SFModal"
```

---

### Task 6: `CommandPalette.tsx` chrome → canonical values (no title slot)

**Files:**
- Modify: `app/src/components/CommandPalette.tsx` (~line 88-181, per the pre-plan survey)

**Interfaces:**
- Consumes: `SFModal` from `../components/ui` (Task 1) — used WITHOUT a `title` prop, since this component renders its own search-input header inside `children`.

- [ ] **Step 1: Read the current implementation**

Read `app/src/components/CommandPalette.tsx`. It currently hand-rolls its own backdrop (`rgba(0,0,0,0.55)`) and card (radius `14` — already matches old `SFModal` canonical, shadow `0 24px 64px rgba(0,0,0,0.45)`, width `560`, `zIndex 9999`), with the search input itself as the header (no `<h3>` title).

- [ ] **Step 2: Replace the wrapper with `<SFModal>`, no title**

```tsx
<SFModal open={open} onClose={onClose} width={560} zIndex={9999} padding={0}>
  {/* existing search input + results list, unchanged — this component already
      renders its own header row, so SFModal's title prop is omitted */}
</SFModal>
```

Use `padding={0}` if the existing content already manages its own internal padding (check the current implementation — don't introduce double padding). Preserve the existing `Escape`-to-close and outside-click-to-close behavior (already `SFModal` defaults: `closeOnEscape`/`closeOnBackdrop` both default `true`).

- [ ] **Step 3: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 4: Verify visually**

Press `Ctrl+K` (or `R`) anywhere in the app to open the command palette. Confirm it still opens centered, searches correctly, and now shows the canonical 16px radius / 60% backdrop / `0 20px 60px rgba(0,0,0,0.5)` shadow instead of its previous bespoke values.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/CommandPalette.tsx
git commit -m "refactor(modal): migrate CommandPalette chrome to SFModal (no title slot)"
```

---

### Task 7: `TaskPanel.tsx` — floating centered modal + two-column layout

**Files:**
- Modify: `app/src/components/TaskPanel.tsx` (outer chrome ~line 552-577; body split at line 815 and its close at line 1292 — confirm exact lines by reading the file, since Tasks 1-6 don't touch this file)

**Interfaces:**
- Consumes: nothing new — no other task's exports are required. `TaskPanel`'s own prop signature (`task`, `onClose`, `onUpdate`, `onMove`, `sectionLabel`, `autoFocusComments`, `inline`) is UNCHANGED, so `Taches.tsx`/`Travail.tsx`/`Modeles.tsx` (its three mount points) require no changes in this task.
- Produces: the visual/layout change described below applies automatically everywhere `<TaskPanel>` is mounted, since it's the same component.

- [ ] **Step 1: Replace the outer (non-inline) chrome — centered, backdrop-dimmed, canonical radius/shadow**

In `app/src/components/TaskPanel.tsx`, the panel's outer `<div>` (around line 552-577) currently renders two different style objects depending on `inline`: the `inline` branch (unchanged by this task) and the non-`inline` branch, which is currently a flush-right slide-in panel with no backdrop and no border-radius. Replace the return statement's opening structure:

```tsx
  return (
    <>
      {!inline && (
        <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.6)' }} />
      )}
      {/* Panel */}
      <div ref={panelRef} onMouseDown={e => e.stopPropagation()} style={inline ? {
        width: 440,
        flex: 1,
        minHeight: 0,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderLeft: '1px solid var(--border)',
      } : {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(1040px, 92vw)',
        maxHeight: '88vh',
        zIndex: 200,
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
```

(`width: 'min(1040px, 92vw)'` gives room for the two-column body below while staying responsive on smaller viewports; adjust only if the two-column content in Step 3 visibly overflows during manual testing.)

- [ ] **Step 2: Remove the now-redundant outside-click-to-close effect**

The existing `useEffect` (around line 538-550) that closes the panel on an outside `mousedown` is now redundant — Step 1's new backdrop `<div onMouseDown={onClose}>` handles that. Delete this effect entirely (it was also `inline`-gated, so removing it doesn't affect the `inline` mode, which never had outside-click-to-close in the first place).

- [ ] **Step 3: Split the body into two columns**

The body container (currently `app/src/components/TaskPanel.tsx` line 815: `<div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>`, closing at line 1292) currently holds ALL content — task details (817-1171) followed immediately by comments (1172-1291) — in one vertical scrolling column. Change it to a horizontal two-column layout by:

1. Changing the body container's own style (line 815) to a row flex with no padding/gap of its own (each column manages its own):
   ```tsx
   <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
   ```
2. Immediately after that opening tag, insert a new left-column wrapper:
   ```tsx
   <div style={{ flex: '1 1 60%', overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
   ```
3. Immediately BEFORE the comments block starts (the `{/* Commentaires */}` comment and `<div ref={commentsAnchorRef} ...>` at what is currently line 1172-1173), close the left column and open the right column:
   ```tsx
   </div>
   <div style={{ flex: '0 0 380px', maxWidth: 380, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)' }}>
   ```
4. Immediately AFTER the comments block's own closing content (right before the body container's own closing `</div>`, currently line 1292), close the right column:
   ```tsx
   </div>
   ```

Everything else inside the body (the task-detail fields in the left column, the comment list/input in the right column) is untouched — only these four wrapper insertions/style changes are made. The `commentsAnchorRef` div and its existing `scrollIntoView`/`highlight-flash` logic (used by `autoFocusComments`, see the `useEffect` around line 351-362) keep working unchanged, since the ref'd element still exists — it's just now inside the right column instead of below the left column's content.

- [ ] **Step 4: Remove the now-redundant "jump to comments" header button**

The header button that scrolls to `commentsAnchorRef` (around line 645-654, `title={t('taskPanel.goToComments')}`) is no longer needed now that comments are an always-visible column rather than something to scroll down to. Delete this `<button>` block (keep the sibling close button at line 655-660 as-is).

- [ ] **Step 5: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 6: Verify visually, all three mount points**

Start the dev server. Open a task from: (a) a project's Travail (list) view, (b) Mes tâches, (c) Modèles (a project template's task list). For each, confirm: the panel now opens centered with a dimmed backdrop, at the new 16px-radius/shadow chrome; task details are in a left column and comments/activity in a right column, both visible without scrolling past one to reach the other; clicking the backdrop closes the panel; clicking inside the panel does not close it.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/TaskPanel.tsx
git commit -m "feat(task-panel): replace side panel with a centered two-column floating modal"
```

---

### Task 8: Three remaining side panels → `SFModal`

**Files:**
- Modify: `app/src/components/ProjectCard.tsx` (~line 92-113, per the pre-plan survey)
- Modify: `app/src/screens/Clients.tsx` (~line 230-300, per the pre-plan survey)
- Modify: `app/src/screens/FicheClient.tsx` (~line 399-401, per the pre-plan survey)

**Interfaces:**
- Consumes: `SFModal` from `../components/ui` (Task 1).

- [ ] **Step 1: Read all three panels' current implementation**

Each is a `createPortal`-based flush-right slide-in panel (`rgba(0,0,0,0.5)` backdrop, no border-radius, no box-shadow, title `15/700`, widths 400/400/420 respectively) — read each one's current JSX before editing.

- [ ] **Step 2: Replace each with `<SFModal>`**

Unlike Task 7 (`TaskPanel`, which keeps its own bespoke implementation for the two-column layout and its anchored sub-pickers), these three panels have simple single-column content and no anchored pickers depending on the panel's own coordinate system — wrap each one directly in `<SFModal open={...} onClose={...} title={...} width={400 | 400 | 420}>`, removing their hand-rolled `createPortal`/backdrop/card divs entirely and letting `SFModal` own the portal.

- [ ] **Step 3: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 4: Verify visually**

Trigger each: a project's quick-detail panel (from `ProjectCard`, wherever it's opened — e.g. clicking a project card's quick-view affordance), the client quick-detail panel on `/clients`, and a member-card panel on a `FicheClient` group page. Confirm all three now open centered with the unified chrome instead of sliding in from the right edge.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ProjectCard.tsx app/src/screens/Clients.tsx app/src/screens/FicheClient.tsx
git commit -m "refactor(modal): migrate the 3 remaining side panels (project/client/member quick-view) to SFModal"
```

---

### Task 9: Notification fix A — mark read on notification-driven open

**Scope note:** this task covers task-linked notifications only (`taskId` — comments/mentions/status changes on tasks), matching the user's original report ("exactement à la tâche avec le commentaire"). Resource-linked notifications (`resourceId`, e.g. a new file version or annotation) navigate to a different screen (`ResourceRouter`/`ResourceDetail`-family) with its own separate open-flow, not touched by this plan — `markResourceRead` stays unused by this task; flag it as a known follow-up if the user later reports the same "doesn't clear" bug for resource notifications.

**Files:**
- Modify: `app/src/screens/Travail.tsx` (~line 1796-1817, the `openTask`/`highlight` query-param effect)
- Modify: `app/src/screens/Taches.tsx` (find its equivalent open-from-notification effect, if present — Mes tâches may reuse a similar `?openTask=` pattern; read the file to confirm)
- Modify: `app/src/screens/Modeles.tsx` (find its equivalent, if present)

**Interfaces:**
- Consumes: `markTaskRead(taskId: string): void`, already exported from `app/src/data/notificationStore.ts` (no changes needed to that file for this task).

- [ ] **Step 1: Fix `Travail.tsx`**

In `app/src/screens/Travail.tsx`, the effect that opens the task panel from a notification link (currently around line 1796-1817):

```tsx
  useEffect(() => {
    const taskId = searchParams.get('openTask') ?? searchParams.get('highlight');
    if (!taskId) return;
    const focusComments = searchParams.get('focus') === 'comments';
    setSearchParams({}, { replace: true });
    const timer = setTimeout(() => {
      const allTasks = sections.flatMap(s => s.tasks);
      const task = allTasks.find(t => t.id === taskId);
      if (task) {
        markTaskRead(taskId);
        setSelectedTask(task);
        setAutoFocusComments(focusComments);
      } else {
        // Fallback: flash the row if panel can't open
        const el = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.animation = 'highlight-flash 2s ease forwards';
        el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [searchParams]);
```

(Only the added `markTaskRead(taskId);` line, inserted right before `setSelectedTask(task);`, is new — `markTaskRead` is already imported in this file per the existing `import { markTaskRead } from '../data/notificationStore';` at line 10.)

- [ ] **Step 2: Find and fix `Taches.tsx`'s equivalent**

Read `app/src/screens/Taches.tsx` and search for its own `?openTask=`/`?highlight=` handling (Mes tâches shows tasks across projects, so this may look slightly different from `Travail.tsx`'s single-project version, but should follow the same "resolve task, open panel" shape). Apply the same one-line fix: call `markTaskRead(taskId)` right before opening the panel, importing `markTaskRead` from `../data/notificationStore` if not already imported.

- [ ] **Step 3: Find and fix `Modeles.tsx`'s equivalent, if it exists**

Read `app/src/screens/Modeles.tsx` and check whether it has its own notification-driven task-open flow (template task editing may or may not be a notification target — if `Modeles.tsx` has no such effect, skip this step, since template tasks may not generate notifications in the first place).

- [ ] **Step 4: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 5: Verify manually**

In a demo or real session with at least one unread comment notification: open `/activite`, confirm the notification shows as unread (highlighted row), click it, confirm the task panel opens AND the notification's unread state clears (re-visit `/activite` or check the notification bell badge count — it should have decremented).

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Travail.tsx app/src/screens/Taches.tsx
git commit -m "fix(notifications): mark task/resource read when opening from a notification link"
```

---

### Task 10: Notification fix B — precise comment-level navigation

**Files:**
- Modify: `app/src/data/notificationStore.ts` (add `commentId` to `AppNotif`)
- Modify: `app/src/data/commentNotify.ts` (stamp `commentId` when creating comment/mention notifications)
- Modify: `app/src/screens/Activite.tsx` (pass `commentId` through the navigate URL)
- Modify: `app/src/components/TaskPanel.tsx` (scroll to + highlight the specific comment, not just the comments column)
- Modify: `app/src/screens/Travail.tsx` (read `commentId` from the URL, pass it through to `TaskPanel`)

**Interfaces:**
- Consumes: Task 7's two-column `TaskPanel` layout (comments now live in a dedicated, always-visible right column, so highlighting a specific comment within it doesn't require any additional scroll-into-view of the column itself — only of the target comment element).
- Produces: `TaskPanel` gains a new optional prop `focusCommentId?: string`, consumed only internally (no other file needs to read it).

- [ ] **Step 1: Add `commentId` to `AppNotif`**

In `app/src/data/notificationStore.ts`, in the `AppNotif` interface (currently lines 24-35):

```tsx
export interface AppNotif {
  id: string;
  kind: NotifKind;
  actor: string;
  text: string;
  timestamp: number;
  read: boolean;
  taskId?: string;
  resourceId?: string;
  projectId?: string;
  clientId?: string;
  commentId?: string;
}
```

- [ ] **Step 2: Stamp `commentId` in `commentNotify.ts`**

Read `app/src/data/commentNotify.ts`. Find every call site that does `addNotif({ kind: 'comment', ... })` or `addNotif({ kind: 'mention', ... })` where a comment object (with its own `id`) is already in scope, and add `commentId: comment.id` (using whatever the local variable is actually named — read the surrounding code to get the exact name) to the object passed to `addNotif`.

- [ ] **Step 3: Pass `commentId` through the notification-click URL**

In `app/src/screens/Activite.tsx`, `NotifGroupRow`'s `handleClick` (currently lines 154-157):

```tsx
  const handleClick = () => {
    if (taskId)          navigate(`/projets/${projectId}?openTask=${taskId}&focus=comments${group.commentId ? `&commentId=${group.commentId}` : ''}`);
    else if (resourceId) navigate(`/projets/${projectId}/ressources/${resourceId}?focus=comments${group.commentId ? `&commentId=${group.commentId}` : ''}`);
  };
```

This requires `NotifGroup` (the `groupNotifs` output type, currently lines 62-72) to also carry a `commentId?: string`, sourced from the latest notification in the group (`sorted[0].commentId`) inside `groupNotifs` (currently lines 74-100) — add both the field and the assignment, mirroring how `taskId`/`resourceId`/`projectId` are already carried through from `sorted[0]`.

- [ ] **Step 4: `TaskPanel` accepts and uses `focusCommentId`**

In `app/src/components/TaskPanel.tsx`, add a new prop:

```tsx
export function TaskPanel({ task, onClose, onUpdate, onMove, sectionLabel, autoFocusComments, focusCommentId, inline }: {
  task: Task;
  onClose: () => void;
  onUpdate?: (patch: Partial<Task>) => void;
  onMove?: (newProjectId: string, newSectionLabel: string) => void;
  sectionLabel?: string;
  autoFocusComments?: boolean;
  focusCommentId?: string;
  inline?: boolean;
}) {
```

In the existing `autoFocusComments` effect (currently lines 351-362), extend it to also scroll to and flash-highlight the specific comment element when `focusCommentId` is set. Each rendered comment in the comments list must have a `data-comment-id={c.id}` attribute for this to find it — check the comment-rendering JSX (inside the block starting ~line 1172) and add this attribute to the comment row's root element if it isn't already there. Then:

```tsx
  React.useEffect(() => {
    if (!autoFocusComments) return;
    const timer = setTimeout(() => {
      const target = focusCommentId
        ? document.querySelector<HTMLElement>(`[data-comment-id="${focusCommentId}"]`)
        : commentsAnchorRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target && (target.style.animation = 'highlight-flash 2s ease forwards');
      target?.addEventListener('animationend', () => {
        if (target) target.style.animation = '';
      }, { once: true });
      if (!focusCommentId) commentInputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [autoFocusComments, focusCommentId]);
```

(This replaces the existing effect body, not the whole file — same `useEffect` call, extended logic. When `focusCommentId` isn't provided, behavior is identical to today: falls back to `commentsAnchorRef` and focuses the comment input.)

- [ ] **Step 5: Wire `commentId` through `Travail.tsx`**

In `app/src/screens/Travail.tsx`'s notification-open effect (already modified in Task 9 Step 1), read the new query param and pass it through:

```tsx
  useEffect(() => {
    const taskId = searchParams.get('openTask') ?? searchParams.get('highlight');
    if (!taskId) return;
    const focusComments = searchParams.get('focus') === 'comments';
    const commentId = searchParams.get('commentId') ?? undefined;
    setSearchParams({}, { replace: true });
    const timer = setTimeout(() => {
      const allTasks = sections.flatMap(s => s.tasks);
      const task = allTasks.find(t => t.id === taskId);
      if (task) {
        markTaskRead(taskId);
        setSelectedTask(task);
        setAutoFocusComments(focusComments);
        setFocusCommentId(commentId);
      } else {
        const el = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.animation = 'highlight-flash 2s ease forwards';
        el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [searchParams]);
```

Add a new `const [focusCommentId, setFocusCommentId] = useState<string | undefined>();` alongside the existing `autoFocusComments` state, and pass `focusCommentId={focusCommentId}` to the `<TaskPanel>` render (alongside the existing `autoFocusComments={autoFocusComments}` prop, currently ~line 2348), resetting it in `onClose` alongside `setAutoFocusComments(false)`.

- [ ] **Step 6: Verify build**

Run: `npm run build` (from `app/`)
Expected: 0 errors.

- [ ] **Step 7: Verify manually**

Add several comments to one task (as different demo users, if the demo session allows switching, or just several comments as one user). Trigger a comment notification for one specific comment (not the most recent one, to make the test meaningful), click it from `/activite`, and confirm `TaskPanel` opens with that exact comment scrolled into view and flash-highlighted — not just the top of the comments column.

- [ ] **Step 8: Commit**

```bash
git add app/src/data/notificationStore.ts app/src/data/commentNotify.ts app/src/screens/Activite.tsx app/src/components/TaskPanel.tsx app/src/screens/Travail.tsx
git commit -m "fix(notifications): navigate to and highlight the specific comment that triggered a notification"
```

---

### Final: Whole-branch review + finishing

- [ ] **Step 1: Full build**

Run: `npm run build` (from `app/`)
Expected: 0 errors, 0 new warnings beyond the pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` chunk warnings already present before this chantier.

- [ ] **Step 2: Full manual pass**

Re-verify, in one sitting: every migrated modal (Tasks 2-6, 8) opens/closes/functions correctly with the unified chrome; `TaskPanel` (Task 7) opens centered with two columns at all three mount points; both notification fixes (Tasks 9-10) work end-to-end from `/activite`.

- [ ] **Step 3: Use `superpowers:finishing-a-development-branch`**

Follow that skill's process (test verification already done in Steps 1-2 above → present merge/PR/keep/discard options → execute chosen option → clean up worktree per this repo's worktree-per-chantier convention).
