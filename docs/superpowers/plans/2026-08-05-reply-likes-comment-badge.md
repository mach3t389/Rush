# Reply Likes & Task Comment Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let replies to comments be liked (not just top-level comments), and show a comment-count badge on every task row (list and Kanban) with a per-person unread state.

**Architecture:** Reply likes extend the existing comment-like pattern (a `likedBy?: string[]` field, a heart toggle, a `notifyLike` call on the liking transition) down one level to replies, across the same 5 screens the prior chantier wired for comment likes. The task badge is a new per-user store (`taskCommentReadsStore.ts`, modeled exactly on `notifPrefsStore.ts`/`pinnedStore.ts`) tracking each user's last-viewed timestamp per task, plus a small `CommentBadge` UI component wired into the 3 places tasks are listed (`Travail.tsx`, `Taches.tsx`, `TravailBoard.tsx`).

**Tech Stack:** React 19 + TypeScript, inline styles, i18next, Supabase (new `task_comment_reads` table for real sessions).

## Global Constraints

- No automated test suite exists in this project — verification is `npx tsc --noEmit -p tsconfig.app.json` (run from `app/`) returning 0 errors, plus live verification via the dev server preview.
- `TaskComment.replies: TaskComment[]` already reuses the same recursive type as top-level comments, so it **already has** `likedBy?: string[]` and `createdAt?: number` — no type change needed for the task-comment side of reply likes, only UI/handler wiring. `RevisionReply` (the separate type used by `RevisionComments.tsx` and the 4 resource-review screens) does **not** yet have `likedBy` — that's the one type that needs the new field.
- Reply likes follow the exact same synchronous-computation pattern established as correct by the prior chantier's whole-branch review: compute the toggled array with a plain `.map()`, call `setState`, then read the `liking` flag and look up the item from the post-update array — never from inside a `setState` updater callback.
- `notifyLike`'s existing no-op guards (missing author id, self-like) apply identically to reply likes — a reply's own `author.id` is the notify target, not the parent comment's author.
- The task comment badge counts a comment/reply as unread only if it has a `createdAt` **and** `createdAt > lastViewed`. Missing `createdAt` (pre-existing data from before the timestamps chantier) is always treated as already-read — never shows a false unread badge.
- Follow the migration convention in this repo: SQL migrations are specs, not proof of execution — write the file, but the user runs it manually in Supabase → SQL Editor. Every real-session store function must include a `grant ... to authenticated` in the migration (a rule this codebase has forgotten twice before per its own history) and every RLS policy must be scoped to `auth.uid()`.

---

### Task 1: `RevisionReply.likedBy` + reply like button in the shared `CommentCard`

**Files:**
- Modify: `app/src/components/RevisionComments.tsx`
- Modify: `app/src/data/commentNotify.ts`

**Interfaces:**
- Produces: `RevisionReply.likedBy?: string[]`; `RevisionCommentSidebar` gains `onToggleLikeReply?: (commentId: string, replyId: string) => void`; `CommentCard` gains `onToggleLikeReply?: (replyId: string) => void`; `notifyLike` gains an optional `isReply?: boolean` parameter.
- Consumes: nothing new.

- [ ] **Step 1: Add `likedBy` to `RevisionReply`**

In `app/src/components/RevisionComments.tsx`, change:

```ts
export interface RevisionReply {
  id: string;
  author: typeof USERS.lea;
  text: string;
  createdAt?: number;
}
```

to:

```ts
export interface RevisionReply {
  id: string;
  author: typeof USERS.lea;
  text: string;
  createdAt?: number;
  likedBy?: string[];
}
```

- [ ] **Step 2: Add the reply like button in `CommentCard`**

Change the `CommentCard` props (around line 167-189) from:

```ts
function CommentCard({
  comment,
  index,
  active,
  onActivate,
  onResolve,
  onReply,
  onDelete,
  onConvertToSubtask,
  onToggleLike,
  currentUserId,
}: {
  comment: RevisionComment;
  index: number;
  active: boolean;
  onActivate: () => void;
  onResolve: () => void;
  onReply: (text: string) => void;
  onDelete?: () => void;
  onConvertToSubtask?: () => void;
  onToggleLike?: () => void;
  currentUserId?: string;
}) {
```

to:

```ts
function CommentCard({
  comment,
  index,
  active,
  onActivate,
  onResolve,
  onReply,
  onDelete,
  onConvertToSubtask,
  onToggleLike,
  onToggleLikeReply,
  currentUserId,
}: {
  comment: RevisionComment;
  index: number;
  active: boolean;
  onActivate: () => void;
  onResolve: () => void;
  onReply: (text: string) => void;
  onDelete?: () => void;
  onConvertToSubtask?: () => void;
  onToggleLike?: () => void;
  onToggleLikeReply?: (replyId: string) => void;
  currentUserId?: string;
}) {
```

Then change the Replies block (around line 285-300) from:

```tsx
      {/* Replies */}
      {comment.replies.length > 0 && (
        <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {comment.replies.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <SFAvatar name={r.author.name} initials={r.author.initials} color={r.author.avatarColor} size={16} />
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{r.author.name} </span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{linkify(r.text)}</span>
                {formatCommentTime(r.createdAt, t) && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>{formatCommentTime(r.createdAt, t)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
```

to:

```tsx
      {/* Replies */}
      {comment.replies.length > 0 && (
        <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {comment.replies.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <SFAvatar name={r.author.name} initials={r.author.initials} color={r.author.avatarColor} size={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{r.author.name} </span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{linkify(r.text)}</span>
                {formatCommentTime(r.createdAt, t) && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>{formatCommentTime(r.createdAt, t)}</span>
                )}
                {onToggleLikeReply && (
                  <button
                    onClick={e => { e.stopPropagation(); onToggleLikeReply(r.id); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 6, fontSize: 10, color: (r.likedBy ?? []).includes(currentUserId ?? '') ? 'var(--danger)' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--ff-text)', verticalAlign: 'middle' }}
                  >
                    <SFIcon name="heart" size={10} />
                    {(r.likedBy ?? []).length > 0 && (r.likedBy ?? []).length}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 3: Thread `onToggleLikeReply` through `RevisionCommentSidebar`**

Change the `RevisionCommentSidebar` props (around line 374-405) from:

```ts
export function RevisionCommentSidebar({
  comments,
  activeId,
  onActivate,
  onAdd,
  onResolve,
  onReply,
  onDelete,
  onConvertToSubtask,
  onToggleLike,
  pendingAnnotation,
  onCancelPending,
  drawing,
  onToggleDrawing,
  contextLabel,
  embedded,
}: {
  comments: RevisionComment[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onAdd?: (text: string) => void;
  onResolve: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  onConvertToSubtask?: (id: string) => void;
  onToggleLike?: (id: string) => void;
  pendingAnnotation: boolean;
  onCancelPending: () => void;
  drawing?: boolean;
  onToggleDrawing?: () => void;
  contextLabel?: string;
  embedded?: boolean;
}) {
```

to:

```ts
export function RevisionCommentSidebar({
  comments,
  activeId,
  onActivate,
  onAdd,
  onResolve,
  onReply,
  onDelete,
  onConvertToSubtask,
  onToggleLike,
  onToggleLikeReply,
  pendingAnnotation,
  onCancelPending,
  drawing,
  onToggleDrawing,
  contextLabel,
  embedded,
}: {
  comments: RevisionComment[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onAdd?: (text: string) => void;
  onResolve: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  onConvertToSubtask?: (id: string) => void;
  onToggleLike?: (id: string) => void;
  onToggleLikeReply?: (commentId: string, replyId: string) => void;
  pendingAnnotation: boolean;
  onCancelPending: () => void;
  drawing?: boolean;
  onToggleDrawing?: () => void;
  contextLabel?: string;
  embedded?: boolean;
}) {
```

Then change the `CommentCard` invocation (around line 519-533) from:

```tsx
              <CommentCard
                key={c.id}
                comment={c}
                index={comments.indexOf(c)}
                active={c.id === activeId}
                onActivate={() => onActivate(c.id === activeId ? null : c.id)}
                onResolve={() => onResolve(c.id)}
                onReply={text => onReply(c.id, text)}
                onDelete={onDelete ? () => onDelete(c.id) : undefined}
                onConvertToSubtask={onConvertToSubtask ? () => onConvertToSubtask(c.id) : undefined}
                onToggleLike={onToggleLike ? () => onToggleLike(c.id) : undefined}
                currentUserId={currentUserId}
              />
```

to:

```tsx
              <CommentCard
                key={c.id}
                comment={c}
                index={comments.indexOf(c)}
                active={c.id === activeId}
                onActivate={() => onActivate(c.id === activeId ? null : c.id)}
                onResolve={() => onResolve(c.id)}
                onReply={text => onReply(c.id, text)}
                onDelete={onDelete ? () => onDelete(c.id) : undefined}
                onConvertToSubtask={onConvertToSubtask ? () => onConvertToSubtask(c.id) : undefined}
                onToggleLike={onToggleLike ? () => onToggleLike(c.id) : undefined}
                onToggleLikeReply={onToggleLikeReply ? (replyId) => onToggleLikeReply(c.id, replyId) : undefined}
                currentUserId={currentUserId}
              />
```

- [ ] **Step 4: Add `isReply` to `notifyLike`**

In `app/src/data/commentNotify.ts`, change:

```ts
interface NotifyLikeOpts {
  comment: { id: string; author: { id?: string } };
  itemLabel: string;
  resourceId?: string;
  taskId?: string;
  projectId?: string;
}

// Fires only on the transition to "liked" (call sites only call this when
// the like is being turned ON, never on unlike), and only notifies the
// comment's own author — never the full watcher list, since a like is a
// signal between the liker and the author, not a broadcast like a new
// comment. No-ops silently if the author has no resolvable user id (legacy
// demo comments authored before this feature, or comments whose author
// field was never a real team member id) — nothing to notify.
export function notifyLike({ comment, itemLabel, resourceId, taskId, projectId }: NotifyLikeOpts): void {
  const authorId = comment.author.id;
  const myId = actorId();
  if (!authorId || authorId === myId) return;

  addNotif({
    kind: 'like',
    actor: actorName(),
    text: `a aimé votre commentaire sur « ${itemLabel} »`,
    timestamp: Date.now(),
    resourceId,
    taskId,
    projectId,
    commentId: comment.id,
    recipientIds: [authorId],
    actorId: myId,
  });
}
```

to:

```ts
interface NotifyLikeOpts {
  comment: { id: string; author: { id?: string } };
  itemLabel: string;
  resourceId?: string;
  taskId?: string;
  projectId?: string;
  isReply?: boolean;
}

// Fires only on the transition to "liked" (call sites only call this when
// the like is being turned ON, never on unlike), and only notifies the
// comment's (or reply's) own author — never the full watcher list, since a
// like is a signal between the liker and the author, not a broadcast like a
// new comment. No-ops silently if the author has no resolvable user id
// (legacy demo comments authored before this feature, or comments whose
// author field was never a real team member id) — nothing to notify.
export function notifyLike({ comment, itemLabel, resourceId, taskId, projectId, isReply }: NotifyLikeOpts): void {
  const authorId = comment.author.id;
  const myId = actorId();
  if (!authorId || authorId === myId) return;

  addNotif({
    kind: 'like',
    actor: actorName(),
    text: isReply ? `a aimé votre réponse sur « ${itemLabel} »` : `a aimé votre commentaire sur « ${itemLabel} »`,
    timestamp: Date.now(),
    resourceId,
    taskId,
    projectId,
    commentId: comment.id,
    recipientIds: [authorId],
    actorId: myId,
  });
}
```

- [ ] **Step 5: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/RevisionComments.tsx app/src/data/commentNotify.ts
git commit -m "feat(comments): add like toggle to replies in the shared comment card"
```

---

### Task 2: Wire reply likes into `TaskPanel.tsx`

**Files:**
- Modify: `app/src/components/TaskPanel.tsx`

**Interfaces:**
- Consumes: `onToggleLikeReply` (Task 1), `notifyLike({ ..., isReply: true })` (Task 1).

- [ ] **Step 1: Add `toggleReplyLike` handler**

Add this function right after the existing `toggleCommentLike` (around line 858-874 today):

```ts
  const toggleReplyLike = (commentId: string, replyId: string) => {
    const myId = currentUser?.id ?? USERS.lea.id;
    let liking = false;
    const next = comments.map(c => {
      if (c.id !== commentId) return c;
      return {
        ...c,
        replies: c.replies.map(r => {
          if (r.id !== replyId) return r;
          const likedBy = r.likedBy ?? [];
          const already = likedBy.includes(myId);
          liking = !already;
          return { ...r, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
        }),
      };
    });
    setComments(next);
    onUpdate?.({ comments: next });
    if (liking) {
      const comment = next.find(c => c.id === commentId);
      const reply = comment?.replies.find(r => r.id === replyId);
      if (reply) notifyLike({ comment: { id: reply.id, author: reply.author }, itemLabel: task.title, taskId: task.id, projectId: breadProjectId, isReply: true });
    }
  };
```

- [ ] **Step 2: Wire it into the `RevisionCommentSidebar` call**

Find the `onToggleLike={toggleCommentLike}` line (around line 1619) and add `onToggleLikeReply` right after it:

```tsx
              onToggleLike={toggleCommentLike}
```

to:

```tsx
              onToggleLike={toggleCommentLike}
              onToggleLikeReply={toggleReplyLike}
```

- [ ] **Step 3: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/TaskPanel.tsx
git commit -m "feat(task-panel): wire reply likes"
```

---

### Task 3: Wire reply likes into `DocumentReview.tsx`

**Files:**
- Modify: `app/src/screens/DocumentReview.tsx`

**Interfaces:**
- Consumes: `onToggleLikeReply` (Task 1), `notifyLike({ ..., isReply: true })` (Task 1).

- [ ] **Step 1: Add `handleToggleLikeReply`**

Add this function right after the existing `handleToggleLike` (around line 311-326 today — the exact end line depends on the file's current state, insert immediately after that function's closing `};`):

```ts
  const handleToggleLikeReply = (commentId: string, replyId: string) => {
    const myId = getCurrentUser()?.id ?? USERS.lea.id;
    let liking = false;
    const next = comments.map(c => {
      if (c.id !== commentId) return c;
      return {
        ...c,
        replies: c.replies.map(r => {
          if (r.id !== replyId) return r;
          const likedBy = r.likedBy ?? [];
          const already = likedBy.includes(myId);
          liking = !already;
          return { ...r, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
        }),
      };
    });
    setComments(next);
    if (liking) {
      const comment = next.find(c => c.id === commentId);
      const reply = comment?.replies.find(r => r.id === replyId);
      if (reply) notifyLike({ comment: reply, itemLabel: resource?.title ?? '', resourceId, isReply: true });
    }
  };
```

- [ ] **Step 2: Wire it into the sidebar**

Find `onToggleLike={handleToggleLike}` (around line 825) and add the reply handler next to it:

```tsx
                onToggleLike={handleToggleLike}
```

to:

```tsx
                onToggleLike={handleToggleLike}
                onToggleLikeReply={handleToggleLikeReply}
```

- [ ] **Step 3: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/DocumentReview.tsx
git commit -m "feat(document-review): wire reply likes"
```

---

### Task 4: Wire reply likes into `ImageReview.tsx`

**Files:**
- Modify: `app/src/screens/ImageReview.tsx`

**Interfaces:**
- Consumes: `onToggleLikeReply` (Task 1), `notifyLike({ ..., isReply: true })` (Task 1).

**Note:** This file has TWO `RevisionCommentSidebar` instances (gallery/round view and single-image view) sharing the same handlers — same as the comment-like wiring from the prior chantier. Both need `onToggleLikeReply` wired.

- [ ] **Step 1: Add `handleToggleLikeReply`**

Add this function right after the existing `handleToggleLike` (around line 310-325 today):

```ts
  const handleToggleLikeReply = (commentId: string, replyId: string) => {
    const myId = getCurrentUser()?.id ?? USERS.lea.id;
    let liking = false;
    const next = comments.map(c => {
      if (c.id !== commentId) return c;
      return {
        ...c,
        replies: c.replies.map(r => {
          if (r.id !== replyId) return r;
          const likedBy = r.likedBy ?? [];
          const already = likedBy.includes(myId);
          liking = !already;
          return { ...r, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
        }),
      };
    });
    setComments(next);
    if (liking) {
      const comment = next.find(c => c.id === commentId);
      const reply = comment?.replies.find(r => r.id === replyId);
      if (reply) notifyLike({ comment: reply, itemLabel: resource?.title ?? '', resourceId, projectId, isReply: true });
    }
  };
```

- [ ] **Step 2: Wire it into BOTH `RevisionCommentSidebar` instances**

At the first instance (around line 599, `onToggleLike={handleToggleLike}` inside the gallery/round view):

```tsx
                onToggleLike={handleToggleLike}
                onDelete={handleDelete}
```

to:

```tsx
                onToggleLike={handleToggleLike}
                onToggleLikeReply={handleToggleLikeReply}
                onDelete={handleDelete}
```

At the second instance (around line 709, single-image view — same `onToggleLike={handleToggleLike}` / `onDelete={handleDelete}` pair):

```tsx
                onToggleLike={handleToggleLike}
                onDelete={handleDelete}
```

to:

```tsx
                onToggleLike={handleToggleLike}
                onToggleLikeReply={handleToggleLikeReply}
                onDelete={handleDelete}
```

(Both instances have this exact same two-line sequence — apply the change to both occurrences.)

- [ ] **Step 3: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/ImageReview.tsx
git commit -m "feat(image-review): wire reply likes"
```

---

### Task 5: Wire reply likes into `ResourceDetail.tsx`

**Files:**
- Modify: `app/src/screens/ResourceDetail.tsx`

**Interfaces:**
- Consumes: `onToggleLikeReply` (Task 1), `notifyLike({ ..., isReply: true })` (Task 1).

**Note:** Same scope boundary as the prior chantier — this file has a second, out-of-scope `RevisionCommentSidebar` usage backed by the separate `DocComment` type (DocumentView's own comment thread, around line 2623+ in the file, referencing `pendingAnchorId`/`scrollToAnchor`). Do NOT touch that one — only the `ResourceCommentSidebar` wrapper component and its `handleToggleLike`/`handleReply` handlers.

- [ ] **Step 1: Add `handleToggleLikeReply`**

Add this function right after the existing `handleToggleLike` inside `ResourceCommentSidebar` (around line 313-328 today):

```ts
  const handleToggleLikeReply = (commentId: string, replyId: string) => {
    const myId = getCurrentUser()?.id ?? USERS.lea.id;
    let liking = false;
    const next = comments.map(c => {
      if (c.id !== commentId) return c;
      return {
        ...c,
        replies: c.replies.map(r => {
          if (r.id !== replyId) return r;
          const likedBy = r.likedBy ?? [];
          const already = likedBy.includes(myId);
          liking = !already;
          return { ...r, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
        }),
      };
    });
    setComments(next);
    if (liking) {
      const comment = next.find(c => c.id === commentId);
      const reply = comment?.replies.find(r => r.id === replyId);
      if (reply) notifyLike({ comment: reply, itemLabel, resourceId, projectId, isReply: true });
    }
  };
```

- [ ] **Step 2: Wire it into the sidebar**

Find `onToggleLike={handleToggleLike}` inside `ResourceCommentSidebar`'s `RevisionCommentSidebar` call (around line 357) and add the reply handler:

```tsx
        onToggleLike={handleToggleLike}
        pendingAnnotation={false}
```

to:

```tsx
        onToggleLike={handleToggleLike}
        onToggleLikeReply={handleToggleLikeReply}
        pendingAnnotation={false}
```

- [ ] **Step 3: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/ResourceDetail.tsx
git commit -m "feat(resource-detail): wire reply likes in the shared comment sidebar"
```

---

### Task 6: Wire reply likes into `WebReview.tsx`

**Files:**
- Modify: `app/src/screens/WebReview.tsx`

**Interfaces:**
- Consumes: `onToggleLikeReply` (Task 1), `notifyLike({ ..., isReply: true })` (Task 1).

**Note:** Like the prior chantier's comment-like wiring in this file, this one operates on `annotations`/`setAnnotations`, not `comments`/`setComments` — the annotation's `replies` field is already typed `RevisionReply[]` (imported from `RevisionComments.tsx`), so it gains `likedBy` automatically from Task 1's type change with no local type edit needed here.

- [ ] **Step 1: Add `toggleLikeReplyAnnotation`**

Add this function right after the existing `toggleLikeAnnotation` (around line 257-272 today):

```ts
  const toggleLikeReplyAnnotation = (annId: string, replyId: string) => {
    const myId = getCurrentUser()?.id ?? 'moi';
    let liking = false;
    const next = annotations.map(a => {
      if (a.id !== annId) return a;
      return {
        ...a,
        replies: a.replies.map(r => {
          if (r.id !== replyId) return r;
          const likedBy = r.likedBy ?? [];
          const already = likedBy.includes(myId);
          liking = !already;
          return { ...r, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
        }),
      };
    });
    setAnnotations(next);
    if (liking) {
      const ann = next.find(a => a.id === annId);
      const reply = ann?.replies.find(r => r.id === replyId);
      if (reply) notifyLike({ comment: { id: reply.id, author: { id: reply.author.id } }, itemLabel: resource?.title ?? host, resourceId: resource?.id, projectId, isReply: true });
    }
  };
```

- [ ] **Step 2: Wire it into the sidebar**

Find `onToggleLike={toggleLikeAnnotation}` (around line 537) and add the reply handler:

```tsx
              onToggleLike={toggleLikeAnnotation}
              pendingAnnotation={false}
```

to:

```tsx
              onToggleLike={toggleLikeAnnotation}
              onToggleLikeReply={toggleLikeReplyAnnotation}
              pendingAnnotation={false}
```

- [ ] **Step 3: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/WebReview.tsx
git commit -m "feat(web-review): wire reply likes"
```

---

### Task 7: `taskCommentReadsStore.ts` + migration + mark-viewed wiring

**Files:**
- Create: `app/src/data/taskCommentReadsStore.ts`
- Create: `docs/superpowers/specs/2026-08-05-task-comment-reads-migration.sql`
- Modify: `app/src/components/TaskPanel.tsx`

**Interfaces:**
- Produces: `markTaskViewed(taskId: string): void`, `getLastViewed(taskId: string): number`, `subscribeTaskCommentReads(fn: () => void): () => void`, `countUnreadComments(comments: TaskComment[] | undefined, lastViewed: number): number`, `countTotalComments(comments: TaskComment[] | undefined): number` — all exported from `taskCommentReadsStore.ts`. Task 8 consumes all five.
- Consumes: `loadPersisted`/`savePersisted` (`app/src/data/persist.ts`), `isDemoSession`/`onLogout` (`app/src/data/authStore.ts`), `supabase` (`app/src/data/supabaseClient.ts`), `TaskComment` type (`app/src/types/index.ts`).

- [ ] **Step 1: Write the migration file**

Create `docs/superpowers/specs/2026-08-05-task-comment-reads-migration.sql`:

```sql
-- Per-user "last viewed" timestamp per task, for the task comment badge's
-- unread state. Personal preference data (like notif_prefs/sidebar_prefs),
-- scoped by auth.uid(), not by studio.

create table if not exists task_comment_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  last_viewed_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

alter table task_comment_reads enable row level security;

create policy "Users manage their own task comment reads"
  on task_comment_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on task_comment_reads to authenticated;
```

- [ ] **Step 2: Write `taskCommentReadsStore.ts`**

Create `app/src/data/taskCommentReadsStore.ts`:

```ts
// Per-user "last viewed" timestamp per task — powers the task comment
// badge's unread state (Travail.tsx/Taches.tsx/TravailBoard.tsx). Follows
// the same demo-vs-real-session split as notifPrefsStore.ts/pinnedStore.ts:
// personal preference data, scoped by the authenticated user's own id.

import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { supabase } from './supabaseClient';
import type { TaskComment } from '../types';

const STORAGE_KEY = 'sf_task_comment_reads';

// ── Demo-session state ──────────────────────────────────────────────────────
let _reads: Record<string, number> = loadPersisted<Record<string, number>>(STORAGE_KEY, {});

// ── Real-session in-memory cache ────────────────────────────────────────────
let _realReads: Record<string, number> = {};
let _fetchStarted = false;

async function fetchTaskCommentReads(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('task_comment_reads')
    .select('task_id, last_viewed_at')
    .eq('user_id', user.id);

  if (error) { console.error('fetchTaskCommentReads failed', error); return; }

  _realReads = Object.fromEntries((data ?? []).map(row => [row.task_id as string, new Date(row.last_viewed_at as string).getTime()]));
  notify();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchTaskCommentReads();
}

async function saveTaskCommentRead(taskId: string, viewedAt: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('task_comment_reads').upsert({
    user_id: user.id,
    task_id: taskId,
    last_viewed_at: new Date(viewedAt).toISOString(),
  });
  if (error) console.error('saveTaskCommentRead failed', error);
}

function resetTaskCommentReadsCache(): void {
  _realReads = {};
  _fetchStarted = false;
}
onLogout(resetTaskCommentReadsCache);

const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

export function getLastViewed(taskId: string): number {
  if (isDemoSession()) return _reads[taskId] ?? 0;
  ensureFetchStarted();
  return _realReads[taskId] ?? 0;
}

export function markTaskViewed(taskId: string): void {
  const now = Date.now();
  if (isDemoSession()) {
    _reads = { ..._reads, [taskId]: now };
    savePersisted(STORAGE_KEY, _reads);
    notify();
    return;
  }
  _realReads = { ..._realReads, [taskId]: now };
  notify();
  void saveTaskCommentRead(taskId, now);
}

export function subscribeTaskCommentReads(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Unread computation ──────────────────────────────────────────────────────
// A comment/reply with no createdAt (pre-existing data from before comments
// tracked timestamps) is never counted as unread — there's no way to know
// when it was written, so treating it as unread would show a false badge on
// every old task the first time this ships.

export function countTotalComments(comments: TaskComment[] | undefined): number {
  if (!comments) return 0;
  return comments.length + comments.reduce((sum, c) => sum + c.replies.length, 0);
}

export function countUnreadComments(comments: TaskComment[] | undefined, lastViewed: number): number {
  if (!comments) return 0;
  let count = 0;
  for (const c of comments) {
    if (c.createdAt && c.createdAt > lastViewed) count++;
    for (const r of c.replies) {
      if (r.createdAt && r.createdAt > lastViewed) count++;
    }
  }
  return count;
}
```

- [ ] **Step 3: Call `markTaskViewed` when the task panel opens**

In `app/src/components/TaskPanel.tsx`, add the import near the other `data/` imports:

```ts
import { markTaskViewed } from '../data/taskCommentReadsStore';
```

Add a `useEffect` right after the component's other top-level `useEffect`/state declarations (find where `const [comments, setComments] = useState<CommentObj[]>(task.comments ?? []);` is declared and add this immediately after it):

```ts
  useEffect(() => { markTaskViewed(task.id); }, [task.id]);
```

- [ ] **Step 4: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/taskCommentReadsStore.ts docs/superpowers/specs/2026-08-05-task-comment-reads-migration.sql app/src/components/TaskPanel.tsx
git commit -m "feat(tasks): per-user task-comment-read tracking store, mark-viewed on panel open"
```

---

### Task 8: `CommentBadge` component + wiring into list and Kanban views

**Files:**
- Create: `app/src/components/ui/CommentBadge.tsx`
- Modify: `app/src/components/ui/index.ts`
- Modify: `app/src/screens/Travail.tsx`
- Modify: `app/src/screens/Taches.tsx`
- Modify: `app/src/screens/TravailBoard.tsx`

**Interfaces:**
- Consumes: `getLastViewed`, `subscribeTaskCommentReads`, `countUnreadComments`, `countTotalComments` (Task 7).
- Produces: `CommentBadge` component, exported from `app/src/components/ui/index.ts`.

- [ ] **Step 1: Write `CommentBadge.tsx`**

Create `app/src/components/ui/CommentBadge.tsx`:

```tsx
// Small badge shown on task rows/cards when the task has comments — grey
// with the total count when everything's been read, accent-colored with
// just the unread count when it hasn't. Renders nothing for a task with no
// comments at all (no empty "0" badge).
import { useEffect, useState } from 'react';
import type { TaskComment } from '../../types';
import { getLastViewed, subscribeTaskCommentReads, countUnreadComments, countTotalComments } from '../../data/taskCommentReadsStore';
import { SFIcon } from './SFIcon';

export function CommentBadge({ taskId, comments }: { taskId: string; comments: TaskComment[] | undefined }) {
  const [lastViewed, setLastViewed] = useState(() => getLastViewed(taskId));
  useEffect(() => subscribeTaskCommentReads(() => setLastViewed(getLastViewed(taskId))), [taskId]);

  const total = countTotalComments(comments);
  if (total === 0) return null;
  const unread = countUnreadComments(comments, lastViewed);
  const isUnread = unread > 0;

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <SFIcon name="message-square" size={11} color={isUnread ? 'var(--accent)' : 'var(--text-3)'} />
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: isUnread ? 'var(--accent)' : 'var(--text-3)' }}>
        {isUnread ? unread : total}
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Export it**

In `app/src/components/ui/index.ts`, add this line alongside the other exports:

```ts
export { CommentBadge } from './CommentBadge';
```

- [ ] **Step 3: Wire it into `Travail.tsx`'s `TaskRow`**

In `app/src/screens/Travail.tsx`, find the subtasks indicator block (around line 575-582):

```tsx
        {!editingTitle && hasSubtasks && (
          <span style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {task.subtasks!.filter(s => s.checked).length}/{task.subtasks!.length}
            </span>
          </span>
        )}
      </div>
```

to:

```tsx
        {!editingTitle && hasSubtasks && (
          <span style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {task.subtasks!.filter(s => s.checked).length}/{task.subtasks!.length}
            </span>
          </span>
        )}
        {!editingTitle && <span style={{ flexShrink: 0, marginLeft: 2 }}><CommentBadge taskId={task.id} comments={task.comments} /></span>}
      </div>
```

Add `CommentBadge` to this file's import from `../components/ui` (find the existing `import { ... } from '../components/ui'` line and add `CommentBadge` to the named imports).

- [ ] **Step 4: Wire it into `Taches.tsx`'s `TaskRow`**

In `app/src/screens/Taches.tsx`, find the equivalent subtasks indicator block (around line 576-582):

```tsx
        {!editingTitle && !!task.subtasks?.length && (
          <span style={{ flexShrink: 0, marginLeft: 5, display: 'flex', alignItems: 'center', gap: 2 }}>
            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {task.subtasks.filter(s => s.checked).length}/{task.subtasks.length}
            </span>
          </span>
        )}
```

Add the badge immediately after this block (same sibling level, before whatever closes that div):

```tsx
        {!editingTitle && !!task.subtasks?.length && (
          <span style={{ flexShrink: 0, marginLeft: 5, display: 'flex', alignItems: 'center', gap: 2 }}>
            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {task.subtasks.filter(s => s.checked).length}/{task.subtasks.length}
            </span>
          </span>
        )}
        {!editingTitle && <span style={{ flexShrink: 0, marginLeft: 5 }}><CommentBadge taskId={task.id} comments={task.comments} /></span>}
```

Add `CommentBadge` to this file's import from `../components/ui`.

- [ ] **Step 5: Wire it into `TravailBoard.tsx`'s Kanban card**

In `app/src/screens/TravailBoard.tsx`, find the card's indicator row (around line 534-548):

```tsx
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            {task.description && (
                              <span title={task.description.slice(0, 120)} style={{ display: 'flex', alignItems: 'center' }}>
                                <SFIcon name="text-align-start" size={11} color="var(--text-3)" />
                              </span>
                            )}

                            {(task.subtasks?.length ?? 0) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <SFIcon name="git-branch" size={11} color="var(--text-3)" />
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                                  {task.subtasks!.filter(s => s.checked).length}/{task.subtasks!.length}
                                </span>
                              </div>
                            )}
```

to:

```tsx
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            {task.description && (
                              <span title={task.description.slice(0, 120)} style={{ display: 'flex', alignItems: 'center' }}>
                                <SFIcon name="text-align-start" size={11} color="var(--text-3)" />
                              </span>
                            )}

                            {(task.subtasks?.length ?? 0) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <SFIcon name="git-branch" size={11} color="var(--text-3)" />
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                                  {task.subtasks!.filter(s => s.checked).length}/{task.subtasks!.length}
                                </span>
                              </div>
                            )}

                            <CommentBadge taskId={task.id} comments={task.comments} />
```

Add `CommentBadge` to this file's import from `../components/ui`.

- [ ] **Step 6: Verify**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 7: Live-verify**

Start the dev server. Open a task with no comments in the list view — confirm no badge shows. Add a comment via the panel — close the panel, confirm the row now shows a grey badge with count "1" (since opening the panel just marked it as viewed, so it's not unread to you). Add a second comment via a different mechanism if possible, or manually adjust `localStorage.sf_task_comment_reads` for that task to an earlier timestamp and reload, to confirm the badge turns accent-colored with the unread count. Confirm the same behavior on the Kanban board view and in Mes tâches.

- [ ] **Step 8: Commit**

```bash
git add app/src/components/ui/CommentBadge.tsx app/src/components/ui/index.ts app/src/screens/Travail.tsx app/src/screens/Taches.tsx app/src/screens/TravailBoard.tsx
git commit -m "feat(tasks): comment count badge with per-person unread state on list and Kanban rows"
```

---

### Task 9: Whole-branch review and finishing

- [ ] **Step 1: Full typecheck**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Expected: 0 errors across the whole branch.

- [ ] **Step 2: Live walkthrough**

For each of the 5 comment surfaces (Task Panel, Document Review, Image Review, one `ResourceCommentSidebar`-backed resource type, Web Review): open an item with an existing comment, reply to it, like the reply, confirm the heart fills and shows "1", unlike, confirm it reverts. Confirm the task comment badge (Task 8, Step 7) still behaves correctly after these changes.

- [ ] **Step 3: Whole-branch code review**

Use superpowers:requesting-code-review's code-reviewer prompt against the full branch diff (`git merge-base master HEAD` as the base).

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch to merge/push per the user's chosen workflow. Remind the user in the completion message that the `task_comment_reads` migration (Task 7, Step 1) needs to be run manually in Supabase → SQL Editor before the per-person unread badge will work for real (non-demo) sessions — it degrades gracefully without it (every task always reads as fully unread for real users until the table exists and the migration runs), but nothing crashes.
