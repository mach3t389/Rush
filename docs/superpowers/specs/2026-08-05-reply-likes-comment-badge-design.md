# Reply Likes & Task Comment Badge — Design

**Goal:** Two additions built on the comment-timestamps-and-likes chantier (2026-08-04):
1. Let replies (not just top-level comments) be liked.
2. Show a comment-count badge on every task row (list and Kanban), with a per-person "unread" visual state — currently there is no indicator at all that a task has comments.

**Scope:** Touches the shared comment component (`RevisionComments.tsx`), the same 5 comment-rendering screens as the prior chantier (`TaskPanel.tsx`, `DocumentReview.tsx`, `ImageReview.tsx`, `ResourceDetail.tsx`, `WebReview.tsx`) for reply likes, and a new store + the task list/Kanban row components (`Travail.tsx`, `Taches.tsx`, `TravailBoard.tsx`) for the badge. No new Supabase table for reply likes (rides the existing comment JSON blob); one new table for per-person unread tracking.

## Part 1: Reply likes

Extend `RevisionReply` (and the parallel `TaskComment`/`CommentObj` reply shape, and `Annotation`'s reply type in WebReview) with `likedBy?: string[]` — the exact same optional field already added to top-level comments in the prior chantier, just on the reply type too.

In `CommentCard`'s replies block (`RevisionComments.tsx`), add a heart toggle next to each reply, matching the top-level comment's heart button style but smaller (matching the reply row's existing smaller avatar/text sizing). `RevisionCommentSidebar` gains `onToggleLikeReply?: (commentId: string, replyId: string) => void`, threaded down to `CommentCard` and rendered per-reply.

`notifyLike` gains an optional `isReply?: boolean` parameter, changing its notification text from "a aimé votre commentaire sur « X »" to "a aimé votre réponse sur « X »". The recipient is the reply's own author (not the parent comment's author) — a reply is authored by whoever wrote it, and that's who should be notified when it's liked.

Each of the 5 screens gets a `handleToggleLikeReply` handler mirroring the existing `handleToggleLike`/`toggleCommentLike` pattern (synchronous array computation, established as the correct pattern by the prior chantier's whole-branch review) — locate the reply inside its parent comment's `replies` array, toggle the current user's id in its `likedBy`, and notify on the liking transition only.

## Part 2: Task comment badge

### Unread tracking

New store `app/src/data/taskCommentReadsStore.ts`, following the exact `notifPrefsStore.ts` pattern (per-user, not per-studio):

- Demo sessions: `Record<taskId, number>` (last-viewed timestamp) persisted via `loadPersisted`/`savePersisted` under a new localStorage key, `sf_task_comment_reads`.
- Real sessions: a new Supabase table `task_comment_reads` (`user_id uuid`, `task_id text`, `last_viewed_at timestamptz`, primary key `(user_id, task_id)`), scoped by `auth.uid()` via RLS — same migration pattern as `notif_prefs`/`sidebar_prefs`/`template_favorites`. In-memory cache populated by a background fetch on first read, exactly like `notifPrefsStore.ts`'s `ensureFetchStarted()`/`fetchSupabasePrefs()`.
- Exported functions: `markTaskViewed(taskId: string): void` (upserts `Date.now()` as the last-viewed time) and `getLastViewed(taskId: string): number` (returns 0 if never viewed — meaning every existing comment counts as unread the very first time a task is ever opened after this feature ships, which is correct: the user genuinely hasn't seen those comments yet through this feature).

`TaskPanel.tsx` calls `markTaskViewed(task.id)` once, in a `useEffect` that fires when the panel opens for a given task (mirrors how `resetCommentCount` is called for resources today).

### Unread count computation

A pure helper, `countUnreadComments(comments: TaskComment[], lastViewed: number): number`, colocated in `taskCommentReadsStore.ts`: walks each top-level comment and its replies, counts how many have `createdAt` both present and `> lastViewed`. A comment/reply with no `createdAt` (pre-existing data from before the timestamps chantier) is never counted as unread — it has no way to know when it was written, so treating it as unread would show a false badge on every old task the first time this ships. Total count (for the "all read" grey state) is just `comments.length + sum(comments.map(c => c.replies.length))`.

### Badge component

New small component, `app/src/components/ui/CommentBadge.tsx`: props `{ count: number; unread: number }`. Renders nothing if `count === 0`. Otherwise a small pill: `SFIcon name="message-square"` + a number, in `var(--text-3)` (grey) showing `count` when `unread === 0`, or in `var(--accent)` showing `unread` when `unread > 0`. Exported from `app/src/components/ui/index.ts` alongside the other small primitives.

### Wiring

- `Travail.tsx`'s `TaskRow` and `Taches.tsx`'s `TaskRow`: render `<CommentBadge count={...} unread={...} />` in the row, computed from `task.comments` and `getLastViewed(task.id)` via the new store's `subscribeTaskCommentReads`-style hook (a `useSyncExternalStore`-style subscription, same pattern `subscribeNotifs`/`subscribePinned` already use elsewhere) so the badge updates live when a comment is added or the task is viewed elsewhere.
- `TravailBoard.tsx`'s Kanban card: same badge, same computation, on the card face.

## What's explicitly out of scope

- No push/toast notification for "new unread comment" beyond the existing `notifyComment`/`notifyLike` in-app notifications — the badge is a passive visual indicator on the list/board, not an active alert.
- No "mark all as read" bulk action — viewing a task's panel is the only way to clear its badge, matching how resources already work.
- No unread tracking for resource-review comments (Document/Image/Web/etc.) in this chantier — those already have the simpler global `commentStore.ts` counter from before, untouched here. Only tasks get the new per-person system.
- No badge on the task detail panel's own comment tab header (e.g. no additional "2 new" label inside the panel itself) — the badge's whole purpose is to be visible from *outside* the panel, before opening it.
