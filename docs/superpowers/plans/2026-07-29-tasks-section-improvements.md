# Tasks Section Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 bugs/UX gaps in the project task list view (Travail.tsx).

**Architecture:** All changes are in `app/src/screens/Travail.tsx` (one large self-contained screen file). No new files needed. Changes are independent and can be tackled in order.

**Tech Stack:** React 19, TypeScript, inline styles, i18next, Lucide icons via SFIcon.

## Global Constraints

- Never hardcode user-facing strings — use `t('key')` and add keys to `app/src/locales/fr.json` + `en.json`.
- Styles are inline `style={{}}` — no Tailwind classes.
- `SFIcon` takes kebab-case Lucide icon names; silently returns null if unknown.
- No automated tests — verify via `npm run dev` in `app/`.
- `tsc -p tsconfig.app.json --noEmit` for type checks.

---

### Task 1: Auto-open first task row after Enter on section creation

**Files:**
- Modify: `app/src/screens/Travail.tsx` (~lines 1929–1936 and 2034–2041)

**Context:** `handleAddSection` sets `pendingAutoOpenLabelRef.current`, a `useEffect` watches `sections` and calls `setAutoOpenSectionLabel(pending)` then immediately clears it via `setTimeout(..., 0)`. The `AddTaskRow` at line 1333 receives `autoOpen={autoOpenAddTask}` and initialises `useState(!!autoOpen)` — this reads the prop only once at mount. The timing currently **works** if the section mounts in the same React flush. But it fails when the new section is scrolled off-screen (not yet rendered), or when `setTimeout` fires before the section component mounts. Fix: remove the zero-delay clear and instead clear the autoOpen flag from within the section, once AddTaskRow signals it opened.

Simpler, more robust fix: keep `setAutoOpenSectionLabel(pending)` but clear it on the NEXT render after the section has mounted, by using `useEffect` in the section component to call a parent callback. Even simpler: just keep `autoOpenSectionLabel` for an entire render cycle (don't clear it immediately), and let `AddTaskRow`'s `useState(!!autoOpen)` capture `true` on first mount. The `setTimeout` reset is the root cause — replace it with a one-frame delay that's long enough for the section to mount.

- [ ] **Step 1: Replace the zero-delay setTimeout with a 50ms delay**

In `useEffect` at ~line 1929 in `Travail.tsx`, change:

```tsx
useEffect(() => {
  const pending = pendingAutoOpenLabelRef.current;
  if (pending && sections.some(s => s.label === pending)) {
    setAutoOpenSectionLabel(pending);
    pendingAutoOpenLabelRef.current = null;
    setTimeout(() => setAutoOpenSectionLabel(null), 0);  // ← BUG: too fast
  }
}, [sections]);
```

to:

```tsx
useEffect(() => {
  const pending = pendingAutoOpenLabelRef.current;
  if (pending && sections.some(s => s.label === pending)) {
    setAutoOpenSectionLabel(pending);
    pendingAutoOpenLabelRef.current = null;
    setTimeout(() => setAutoOpenSectionLabel(null), 50);
  }
}, [sections]);
```

- [ ] **Step 2: Scroll to the new section after creating it**

In `handleAddSection` (~line 2034), after setting `pendingAutoOpenLabelRef.current`, scroll the newly created section into view:

```tsx
const handleAddSection = () => {
  const label = newSectionLabel.trim();
  if (!label) return;
  setSections(prev => [...prev, { label, tasks: [] }]);
  setNewSectionLabel('');
  setAddingSection(false);
  pendingAutoOpenLabelRef.current = label;
  // Scroll to the bottom where the new section will appear
  setTimeout(() => {
    const el = document.querySelector(`[data-section-label="${CSS.escape(label)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
};
```

Then in the section container `div` (the outermost div returned by the `SectionBlock` component, ~line 1131), add `data-section-label={label}` to the `style` div:

```tsx
<div
  data-section-label={label}
  draggable
  ...
>
```

- [ ] **Step 3: Verify manually**

```
cd app && npm run dev
```

Go to any project → Tasks tab. Type a section name → press Enter. The section should appear and immediately show an open task input row. Type a task name → Enter. Another blank row appears. Escape to close.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "fix(tasks): auto-open first task row after Enter on section creation"
```

---

### Task 2: Description icon inline with task title (no extra column)

**Files:**
- Modify: `app/src/screens/Travail.tsx` (~line 580–615, the title `<div>` in `TaskRow`)

**Context:** `task.description` is a string field (see `TaskPanel.tsx` line 465). The task row's title column is a flex `<div>` at line 570–615 that already shows a `package` icon for deliverables and the title text. When `task.description` has content, show a small `align-left` icon right after the title text. Visible only when description exists and row is not in editing mode.

- [ ] **Step 1: Add description icon after title span**

In `TaskRow`, inside the title `<div>` (after line 613, the closing `</span>` of the non-editing branch), add:

```tsx
{!editingTitle && task.description && (
  <span title={task.description.slice(0, 120)} style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center' }}>
    <SFIcon name="align-left" size={11} color="var(--text-3)" />
  </span>
)}
```

Place it inside the existing flex container, after `</span>` (the title span) and before the closing `</div>` of the title column. Full context of the surrounding code to match:

```tsx
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, textDecoration: checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleDraft}
          </span>
        )}
        {/* ← INSERT HERE ↓ */}
        {!editingTitle && task.description && (
          <span title={task.description.slice(0, 120)} style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center' }}>
            <SFIcon name="align-left" size={11} color="var(--text-3)" />
          </span>
        )}
      </div>
```

- [ ] **Step 2: Verify**

Start dev server and open a project. Open a task's detail panel, add a description, close the panel. The task row should now show a small `align-left` icon right after the title. Tasks without descriptions should show no icon.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "feat(tasks): show description icon inline with task title"
```

---

### Task 3: Subtask count icon inline with task title (remove dedicated column)

**Files:**
- Modify: `app/src/screens/Travail.tsx` (~lines 617–631 and 580–615)

**Context:** Currently the subtask count is a grid COLUMN (`{!compact && <>{/* Sous-tâches */}...`)). The user wants it inline with the title instead (like Notion). Remove it from the column and put it right after the title text, adjacent to the description icon from Task 2.

- [ ] **Step 1: Remove subtasks column from TaskRow**

Around line 619–631, remove the entire subtasks column block:

```tsx
      {/* Sous-tâches */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {hasSubtasks ? (
          <>
            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {task.subtasks!.length}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--border-2)', fontFamily: 'var(--ff-mono)', fontSize: 10 }}>—</span>
        )}
      </div>
```

Also find the `<span />{/* Sous-tâches */}` placeholder in `AddTaskRow` (~line 895) and remove it:

```tsx
        <span />{/* Sous-tâches */}
```

- [ ] **Step 2: Add subtask badge inline with title**

In the title `<div>` (same area as Task 2's description icon), add the subtask badge right after the description icon. Both icons sit inline after the title text, only when they have data:

```tsx
        {!editingTitle && task.description && (
          <span title={task.description.slice(0, 120)} style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center' }}>
            <SFIcon name="align-left" size={11} color="var(--text-3)" />
          </span>
        )}
        {!editingTitle && hasSubtasks && (
          <span style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{task.subtasks!.length}</span>
          </span>
        )}
```

- [ ] **Step 3: Check the GRID constants**

The grid columns at the top of the file define how many columns TaskRow has. Find `GRID` and `GRID_COMPACT` constants and remove the column slot previously used for subtasks. Search for them:

```bash
grep -n "GRID\|gridTemplateColumns" app/src/screens/Travail.tsx | head -20
```

Remove one column from `GRID` that was the subtasks column. Verify the header row (`<th>` or grid header for subtasks column at ~line 137) and remove it too.

- [ ] **Step 4: Verify**

Open a project with tasks that have subtasks. Subtask count badge should appear inline after the title. Column header for subtasks should be gone. Layout should not be broken.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "feat(tasks): move subtask count inline with title, remove column"
```

---

### Task 4: Fix multi-select right-click move (moves all selected tasks, not just one)

**Files:**
- Modify: `app/src/screens/Travail.tsx` (~lines 346–379 `TaskContextMenu`, ~lines 1017–1333 `SectionBlock`, ~lines 1906–2100 main Travail component)

**Context:** When multiple tasks are selected (`multiSelIds` has 2+ entries) and the user right-clicks one of them → "Déplacer vers", only that single task moves. The bug is that `TaskRow.setShowMoveModal(true)` opens `MoveTaskModal` with `onMoveToSection` wired to only that one task. The `multiSelIds` set is in the parent's state, not passed down to the individual `TaskRow`'s move handler.

Fix: add a new callback prop to `SectionBlock` and `TaskRow` so that when a multi-select is active, right-click "Move" opens the parent-level `BulkMoveModal` (which moves all selected tasks) instead of the per-row `MoveTaskModal`.

- [ ] **Step 1: Add `onBulkMove` callback to TaskRow**

In `TaskRow`'s props (around line 411), add:

```tsx
  onBulkMove?: () => void;  // called when multi-select move is requested
```

In the `TaskContextMenu` call inside `TaskRow` (~line 756), replace the `onMove` callback:

```tsx
// Before:
onMove={allSections && allSections.length > 1 ? () => { setCtxPos(null); setShowMoveModal(true); } : undefined}

// After:
onMove={allSections && allSections.length > 1 ? () => {
  setCtxPos(null);
  if (onBulkMove) onBulkMove();  // multi-select: delegate to parent
  else setShowMoveModal(true);   // single: use local modal
} : undefined}
```

- [ ] **Step 2: Thread the callback through SectionBlock**

In `SectionBlock`'s props interface (~line 1017), add:

```tsx
  onBulkMoveTask?: () => void;
```

In `SectionBlock`'s render, where `TaskRow` is rendered (~line 1333 area), pass:

```tsx
onBulkMove={multiSelIds.has(task.id) && multiSelIds.size > 1 ? onBulkMoveTask : undefined}
```

In the parent Travail component where `SectionBlock` is rendered (~line 2370 area), pass:

```tsx
onBulkMoveTask={() => setBulkMoveOpen(true)}
```

- [ ] **Step 3: Wire BulkMoveModal to move all selected tasks**

Find where `bulkMoveOpen` triggers `BulkMoveModal` (~line 2500 area). When the modal confirms, currently it moves only the tasks that were passed to it. Ensure it uses `multiSelIds`:

```tsx
{bulkMoveOpen && (
  <BulkMoveModal
    title={t('board.moveTasksTitle', { count: multiSelIds.size })}
    mode="move"
    onMove={(toProjectId, toSectionLabel) => {
      moveTasks(projectId!, [...multiSelIds], toProjectId, toSectionLabel);
      setMultiSelIds(new Set());
      setBulkMoveOpen(false);
    }}
    onClose={() => setBulkMoveOpen(false)}
  />
)}
```

Search for the existing `bulkMoveOpen` handler to see what it currently does and update it if needed.

- [ ] **Step 4: Verify**

Select 3 tasks with Ctrl+click. Right-click one → "Déplacer vers". `BulkMoveModal` should open with title showing count = 3. Pick a destination. All 3 tasks should move.

Also verify: right-click a single task (not multi-selected) → "Déplacer vers" → `MoveTaskModal` (within-project sections only) still works as before.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "fix(tasks): right-click move respects multi-selection"
```

---

### Task 5: Section drag-and-drop auto-scroll when near screen edges

**Files:**
- Modify: `app/src/screens/Travail.tsx` (the `SectionBlock` drag handlers and/or the parent drag handler)

**Context:** Section D&D already works (drag handle at line 1163, `onDragStart`/`onDragEnd`, `SectionInsertZone`, `handleSectionInsertAt`). What's missing is auto-scroll when dragging near the top or bottom of the scrollable container, so the user can reorder sections that are off-screen.

- [ ] **Step 1: Find the scrollable container**

The list of sections renders inside a scrollable div. Search for where sections are rendered and identify the scroll container:

```bash
grep -n "overflow.*auto\|overflow.*scroll\|overflowY" app/src/screens/Travail.tsx | head -20
```

The scrollable container's ref will be used for auto-scroll.

- [ ] **Step 2: Add a ref to the scrollable container**

Add a ref near the other refs at the top of the Travail component:

```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);
```

Attach it to the scrollable container div that wraps the sections list.

- [ ] **Step 3: Add auto-scroll effect during drag**

Add a `useEffect` that sets up an interval while `draggedIdx !== null`:

```tsx
useEffect(() => {
  if (draggedIdx === null) return;
  const container = scrollContainerRef.current;
  if (!container) return;

  const EDGE = 80;   // px from top/bottom edge to start scrolling
  const SPEED = 8;   // px per tick
  let frame: number;

  const scroll = () => {
    const { top, bottom } = container.getBoundingClientRect();
    // Use mouse position stored in a ref (updated via pointermove)
    const y = pointerYRef.current;
    if (y < top + EDGE) {
      container.scrollTop -= SPEED;
    } else if (y > bottom - EDGE) {
      container.scrollTop += SPEED;
    }
    frame = requestAnimationFrame(scroll);
  };
  frame = requestAnimationFrame(scroll);
  return () => cancelAnimationFrame(frame);
}, [draggedIdx]);
```

Also add a `pointerYRef` to track the cursor's Y position:

```tsx
const pointerYRef = useRef(0);
// In the sections container (or window), add:
// onPointerMove={e => { pointerYRef.current = e.clientY; }}
```

Add `onPointerMove` to the outer scrollable container to keep `pointerYRef.current` updated.

- [ ] **Step 4: Verify**

Create 8+ sections so they overflow the screen. Grab the drag handle of a section and drag it toward the top or bottom edge. The list should auto-scroll.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "feat(tasks): auto-scroll when dragging sections near screen edges"
```

---

### Task 6: Save task text on blur (prevent losing typed text)

**Files:**
- Modify: `app/src/screens/Travail.tsx` (~line 829–835 `AddTaskRow.commitOnBlur`, and ~line 880–884 the input's `onBlur`)

**Context:** When a user types a task title in `AddTaskRow` and then clicks somewhere on the page (not a button inside the row), `commitOnBlur` is called. This should save the task and close the row. But two failure modes exist:

1. **Blur caused by clicking a dropdown button inside the same row** (assignee, priority, status, date). These buttons use `onMouseDown={e => e.preventDefault()}` to suppress the blur — this is correct, but verify it's actually working.

2. **Blur during React re-renders**: if the component re-renders and replaces the input while a user is typing, focus is lost and blur fires with stale state.

The main issue reported is more likely the `TaskRow` title edit (`editingTitle` in `TaskRow`): when the user double-clicks to edit an existing task title and then clicks elsewhere, `commitTitle` is called. If `rowProjectId` is undefined (e.g., on the Mes Tâches view where `useParams` doesn't have `projectId`), `updateTask` is never called and the edit is silently lost.

- [ ] **Step 1: Harden commitTitle to save even without rowProjectId**

In `TaskRow.commitTitle` (~line 480):

```tsx
const commitTitle = () => {
  const val = titleDraft.trim() || task.title;
  setTitleDraft(val);
  setEditingTitle(false);
  if (val !== task.title) {
    // Use task.projectId as fallback if useParams doesn't have the id
    const pid = rowProjectId ?? task.projectId;
    if (pid) updateTask(pid, task.id, { title: val });
  }
};
```

- [ ] **Step 2: Ensure AddTaskRow blur doesn't fire when clicking internal dropdowns**

In `AddTaskRow`, verify all dropdown buttons have `onMouseDown={e => e.preventDefault()}`. Check each button (assignee, priority, status, dueDate, the cancel X button at line 980). The cancel button at line 980 needs it:

```tsx
<button
  onMouseDown={e => e.preventDefault()}   // ← add this
  onClick={cancel}
  ...
>
```

Without it, clicking cancel fires blur first (saving an unwanted task) then click (cancelling). With `onMouseDown preventDefault`, blur is suppressed, click fires directly, and `cancel()` discards the row correctly.

- [ ] **Step 3: Verify**

1. Click "+ Ajouter une tâche" → type a title → click anywhere outside the row → task should be saved (appear in list).
2. Click "+ Ajouter une tâche" → type a title → click the X button → row should close WITHOUT saving the task.
3. Double-click an existing task title → edit it → click elsewhere → title should update.
4. Do step 3 from the "Mes tâches" view if applicable.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "fix(tasks): save task text on blur, prevent silent discard"
```
