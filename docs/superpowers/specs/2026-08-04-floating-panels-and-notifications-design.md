# Floating Panels Unification + Notification Fixes — Design

## Goal

Replace the task detail side panel with a centered, Trello-card-style floating window; converge every centered modal in the app (including the currently-inconsistent `SFModal`) onto one shared visual style; convert the three other hand-rolled side panels to the same floating style; and fix two notification bugs (unread state never clears on open, navigation doesn't land on the specific comment that triggered the notification).

## Architecture

Two independent workstreams, sequenced as: (1) style unification first, since the new TaskPanel modal depends on the final canonical style existing; (2) TaskPanel conversion + the other 3 side panels, built on top of (1); (3) notification fixes, which touch a different part of the codebase (`notificationStore.ts`, `Activite.tsx`, `Travail.tsx`/`Taches.tsx`/`Modeles.tsx`'s task-open flow) and don't depend on (1) or (2), so they can land in parallel or after.

## 1. Canonical modal style

**Decision:** the de facto majority style becomes canonical — border-radius `16`, backdrop `rgba(0,0,0,0.6)`, box-shadow `0 20px 60px rgba(0,0,0,0.5)`, title `fontSize:15, fontWeight:700`.

`components/ui/SFModal.tsx` is updated to these exact values (currently `14` / `rgba(0,0,0,0.5)` / `0 16px 48px rgba(0,0,0,0.6)` / `14/700`). Everything already using `<SFModal>` correctly (e.g. `Travail.tsx`'s move-task modal) picks up the new look automatically — no per-call-site changes needed there.

**Hand-rolled modals migrated to `<SFModal>`** (replacing their own `position:fixed` + backdrop + card divs with `<SFModal open onClose title width>...</SFModal>`, keeping their existing inner content/logic untouched):
- `screens/Taches.tsx` bulk move/copy modal (~line 202-243)
- `screens/Travail.tsx` move-section modal (~line 251-267)
- `screens/Travail.tsx` bulk-move modal (~line 295-341)
- `screens/Clients.tsx` new-client modal (~line 110-186)
- `screens/FicheClient.tsx` invite-person modal (~line 81-83)
- `screens/FicheClient.tsx` assign-members modal (~line 180-182)
- `screens/FicheClient.tsx` view-as project picker (~line 650-676) — already closest to canonical, still migrated for consistency
- `components/CommandPalette.tsx` (~line 88-181) — special case: no `<h3>` title (uses a search-input header instead). `SFModal`'s `title` prop is optional, so this can pass no title and render its own header inside `children`; only the outer backdrop/card chrome (radius/shadow/backdrop) needs to move to `SFModal`'s values. Width `560` and `zIndex 9999` are preserved via `SFModal`'s `width`/`zIndex` props.

**Anchored dropdowns/pickers are explicitly out of scope** — `components/ui/DatePicker.tsx`, `components/SubtaskTargetPicker.tsx`, and the various inline context menus (priority/status/assignee/right-click menus) in `Taches.tsx`/`Travail.tsx`/`TravailBoard.tsx` are a different UI family (small, anchored to a trigger element, no backdrop dim) and are not modals — left untouched.

## 2. TaskPanel → floating modal

`components/TaskPanel.tsx`'s outer chrome (currently `position:fixed, right:0, width:760`, no backdrop, no radius — see current code ~line 554-576) is replaced with the canonical modal chrome: centered, backdrop-dimmed, `radius:16`, `boxShadow: 0 20px 60px rgba(0,0,0,0.5)`. Given the amount of task-specific state and layout TaskPanel already owns, it keeps its own portal/backdrop implementation (built to the same style values as `SFModal`, not literally wrapped in `<SFModal>`) rather than being squeezed into `SFModal`'s generic `children` slot — this keeps room for the two-column layout below and its many anchored sub-pickers (date, priority, assignee, resource) which currently rely on the panel's own coordinate system.

**Layout:** two columns inside the modal card, roughly 60/40 width split:
- **Left column:** title, description, dates, priority/status/assignee, subtasks, livrable/deliverable settings, linked resources — everything currently in the single-column panel, unchanged in content and behavior.
- **Right column:** comments + activity, always visible (no tab switch needed) — this is the same comment list/input currently in the panel, just relocated to its own column instead of living below the details in one long scroll.

**Mount points unchanged:** `Taches.tsx`, `Travail.tsx`, `Modeles.tsx` all render `<TaskPanel>` the same way they do today (same props: `task`, `onClose`, `onUpdate`, `onMove`, `sectionLabel`, `autoFocusComments`, `inline`) — since it's one shared component, the visual change applies everywhere automatically. The `inline` prop (used in at least one embedded context) is preserved as an escape hatch to render without the modal chrome, if any existing caller needs that.

## 3. Other side panels → floating modal

Same chrome conversion (centered, radius 16, backdrop 0.6, shadow `0 20px 60px rgba(0,0,0,0.5)`) applied to:
- `components/ProjectCard.tsx`'s quick project-detail panel (~line 92-113)
- `screens/Clients.tsx`'s quick client-detail panel (~line 230-300)
- `screens/FicheClient.tsx`'s member-card panel (~line 399-401)

These are simpler than TaskPanel (no two-column layout requirement — single column content, just re-chromed and re-centered) and can likely use `<SFModal>` directly rather than a bespoke implementation, since they don't need TaskPanel's complex anchored-picker layout.

## 4. Notification fixes

Both root causes were confirmed by reading the actual code, not guessed:

**Bug A — opening a task from a notification never marks it read.** `markTaskRead(taskId)` (`data/notificationStore.ts`) is only ever called from `TaskActivityCell`'s own small unread-count badge click (`Travail.tsx` ~line 202) — never from the notification-driven open flow (`Travail.tsx` ~line 1796-1817, which reads `?openTask=`/`?focus=comments` from the URL and calls `setSelectedTask`). **Fix:** call `markTaskRead(taskId)` (or `markResourceRead(resourceId)` for resource-linked notifications) in that same effect, right where the task/resource is resolved and the panel is opened — mirrors what already happens on the manual badge-click path. Applies to all three mount points (`Travail.tsx`, `Taches.tsx`, `Modeles.tsx`) wherever each independently implements this open-from-notification effect.

**Bug B — navigation doesn't land on the specific comment.** `AppNotif` (`data/notificationStore.ts`) has no `commentId` field — only `taskId`/`resourceId`/`projectId`. So even though the right task opens and comments get focused (`autoFocusComments` scrolls to the comments *section*), there's no data to identify *which* comment among possibly several to scroll to/highlight. **Fix:**
- Add `commentId?: string` to `AppNotif`.
- Stamp it when comment/mention notifications are created (`data/commentNotify.ts`, wherever `addNotif({ kind: 'comment' | 'mention', ... })` is called with a known comment id).
- Pass it through the notification-click URL (`Activite.tsx`'s `handleClick`: `?openTask=${taskId}&focus=comments&commentId=${id}`).
- `TaskPanel` (or its host screen's open-from-notification effect) reads `commentId` and, once the comments list is rendered, scrolls to and flash-highlights that specific comment DOM node (same `highlight-flash` animation pattern already used elsewhere in the panel for consistency) instead of only scrolling to the comments section's top.

Both fixes are independent of the modal-style work in sections 1-3 and can be implemented against either the current side-panel TaskPanel or the new floating one — but naturally land better once TaskPanel's comments column is a stable, always-visible right column (section 2) rather than something the user has to scroll down to reach.

## Testing

No automated test suite in this project (per `CLAUDE.md`) — verification is manual via the dev server: open each converted modal/panel and confirm chrome matches the new canonical values; trigger a comment notification, click it, and confirm (a) the notification's unread state clears and (b) the exact comment is scrolled to and highlighted.
