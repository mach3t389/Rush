# Comment Timestamps & Likes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every comment (task comments + resource-review comments) an absolute, tiered-format timestamp and a per-person toggleable like (heart + count), and let a comment's author opt in/out of an in-app notification when their comment gets liked.

**Architecture:** Two optional fields (`createdAt: number`, `likedBy: string[]`) ride the existing comment-shape types (`RevisionComment` in `RevisionComments.tsx`, `TaskComment`/`CommentObj` in `types/index.ts`/`TaskPanel.tsx`, and `Annotation` in `WebReview.tsx`) and persist through each screen's existing `setComments`/`onUpdate` patch path — no new Supabase table. A new pure `formatCommentTime()` helper and a heart-toggle button live in the one shared `RevisionCommentSidebar`/`CommentCard` component every comment surface already renders through. Likes notify via the existing generic `addNotif`/`getNotifs()` in-app-preference filter — no new gating logic needed, just a new `NOTIF_EVENTS` entry.

**Tech Stack:** React 19 + TypeScript, inline styles, i18next (no new user-facing strings needed beyond static labels already covered by existing translation keys — the two new pieces of UI, "À l'instant"/"Il y a Xh"/etc. and the like count, use plain French strings matching this component's existing untranslated inline patterns like `t('review.reply')`... actually those ARE translated; see Task 1 note on i18n).

## Global Constraints

- No automated test suite exists in this project (`app/`) — verification is `npx tsc --noEmit -p tsconfig.app.json` (must return 0 errors) plus live verification via the dev server preview, per `CLAUDE.md`. Every task's "Step: Verify" below uses this pattern instead of a test runner.
- `createdAt` and `likedBy` are **optional** on every type they're added to (`createdAt?: number`, `likedBy?: string[]`). This is required, not just a nicety: `ResourceDetail.tsx`'s separate `DocComment`-based comment system (DocumentView's own comment thread, `interface DocComment` at `ResourceDetail.tsx:1920`) feeds comments into the same `RevisionCommentSidebar` but is explicitly **out of scope** for this chantier (it already has its own ad-hoc `time: string` field and is a structurally different, pre-existing system). Making the new fields optional means that call site keeps compiling and simply renders without a timestamp/like button (missing `createdAt` → no timestamp shown; missing `likedBy` → treated as `[]`) — no code change needed there at all.
- Comment **replies** never get a like button — only top-level comments. Replies do get `createdAt` (same optional/tiered display).
- No email channel for the `like` notification event — in-app only.
- `RevisionComment.author`/`RevisionReply.author` (type `typeof USERS.lea`, i.e. `{ id, name, initials, avatarColor, role }`) already carries a real user `id` everywhere except two places patched in this plan: `TaskComment.author` (task-panel comments, currently `{ initials, bg, name }`, no `id`) and `WebReview.tsx`'s newly-created annotations (currently a bare `'Moi'` string, no id at all). Both get an `id` field added as part of this plan so "is this my own comment" and "who do I notify" resolve correctly for new comments going forward. Pre-existing comments/demo data without a valid author id simply never trigger a like-notification (the notify function no-ops if it can't resolve a real author id) — this is an accepted, silent degradation matching the "no backfill" stance on old data, not a bug to chase down.
- Every task below that touches a `.tsx` screen must run the typecheck (Step "Verify") before its commit step. Don't batch typechecks across tasks.

---

### Task 1: Shared comment type, timestamp formatter, and like UI

**Files:**
- Modify: `app/src/components/RevisionComments.tsx`

**Interfaces:**
- Produces: `RevisionComment.createdAt?: number`, `RevisionComment.likedBy?: string[]`, `RevisionReply.createdAt?: number`; `formatCommentTime(createdAt: number | undefined): string | null` (exported); `RevisionCommentSidebar` gains an optional prop `onToggleLike?: (id: string) => void`; `CommentCard` gains `currentUserId: string | undefined` and `onToggleLike?: () => void` props.
- Consumes: nothing new (self-contained within this file).

- [ ] **Step 1: Add the two fields to the shared types**

In `app/src/components/RevisionComments.tsx`, change:

```ts
export interface RevisionReply {
  id: string;
  author: typeof USERS.lea;
  text: string;
}

export interface RevisionComment {
  id: string;
  author: typeof USERS.lea;
  text: string;
  status: 'open' | 'resolved';
  annotation?: RevisionAnnotation;
  replies: RevisionReply[];
  contextLabel?: string; // e.g. "Page 2" or "Photo 3"
  excerpt?: string; // quoted source text the comment is anchored to (e.g. a text selection)
}
```

to:

```ts
export interface RevisionReply {
  id: string;
  author: typeof USERS.lea;
  text: string;
  createdAt?: number;
}

export interface RevisionComment {
  id: string;
  author: typeof USERS.lea;
  text: string;
  status: 'open' | 'resolved';
  annotation?: RevisionAnnotation;
  replies: RevisionReply[];
  contextLabel?: string; // e.g. "Page 2" or "Photo 3"
  excerpt?: string; // quoted source text the comment is anchored to (e.g. a text selection)
  createdAt?: number;   // Date.now() at creation; optional — older comments and the
                        // separate DocComment system in ResourceDetail.tsx never set it
  likedBy?: string[];   // user ids currently liking this comment; replies are never likeable
}
```

- [ ] **Step 2: Add the `formatCommentTime` helper**

Add this new exported function right after the `annoColor` function (after line 40, before the `AnnotationLayer` section comment):

```ts
// ── Timestamp formatting ─────────────────────────────────────────────────────
// Tiered format: seconds/minutes/hours for anything from today, "Hier"/
// "Avant-hier" for the two days before, exact date+time beyond that.
// Calendar-day boundaries (local midnight), not a rolling 24h/48h window —
// a comment from 11:58pm yesterday reads "Hier", not "Il y a 14h".

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatCommentTime(createdAt: number | undefined): string | null {
  if (!createdAt) return null;
  const now = Date.now();
  const diffMs = now - createdAt;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;

  const created = new Date(createdAt);
  const today = startOfDay(new Date(now));
  const createdDay = startOfDay(created);
  const dayDiff = Math.round((today - createdDay) / 86400000);

  const hh = String(created.getHours()).padStart(2, '0');
  const mm = String(created.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  if (dayDiff === 0) {
    const diffHour = Math.floor(diffMin / 60);
    return `Il y a ${diffHour}h`;
  }
  if (dayDiff === 1) return `Hier à ${time}`;
  if (dayDiff === 2) return `Avant-hier à ${time}`;

  const day = created.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  const sameYear = created.getFullYear() === new Date(now).getFullYear();
  const datePart = sameYear ? day : created.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${datePart} à ${time}`;
}
```

- [ ] **Step 3: Add the timestamp and like button to `CommentCard`**

Change the `CommentCard` function signature (around line 121) from:

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
}: {
  comment: RevisionComment;
  index: number;
  active: boolean;
  onActivate: () => void;
  onResolve: () => void;
  onReply: (text: string) => void;
  onDelete?: () => void;
  onConvertToSubtask?: () => void;
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

Then, in the Header block (around line 201-222), add the timestamp right after the author name span. Change:

```tsx
        <SFAvatar name={comment.author.name} initials={comment.author.initials} color={comment.author.avatarColor} size={20} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{comment.author.name}</span>
        {comment.contextLabel && (
```

to:

```tsx
        <SFAvatar name={comment.author.name} initials={comment.author.initials} color={comment.author.avatarColor} size={20} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{comment.author.name}</span>
        {formatCommentTime(comment.createdAt) && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatCommentTime(comment.createdAt)}</span>
        )}
        {comment.contextLabel && (
```

Then, in the Actions row (around line 247-272), add the like button before the reply button. Change:

```tsx
      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          onClick={e => { e.stopPropagation(); setShowReply(v => !v); }}
```

to:

```tsx
      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {onToggleLike && (
          <>
            <button
              onClick={e => { e.stopPropagation(); onToggleLike(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: (comment.likedBy ?? []).includes(currentUserId ?? '') ? 'var(--danger)' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--ff-text)' }}
            >
              <SFIcon name="heart" size={12} />
              {(comment.likedBy ?? []).length > 0 && (comment.likedBy ?? []).length}
            </button>
            <span style={{ color: 'var(--border-2)', fontSize: 11 }}>·</span>
          </>
        )}
        <button
          onClick={e => { e.stopPropagation(); setShowReply(v => !v); }}
```

- [ ] **Step 4: Add the reply timestamp**

In the Replies block (around line 232-244), change:

```tsx
          {comment.replies.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <SFAvatar name={r.author.name} initials={r.author.initials} color={r.author.avatarColor} size={16} />
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{r.author.name} </span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{linkify(r.text)}</span>
              </div>
            </div>
          ))}
```

to:

```tsx
          {comment.replies.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <SFAvatar name={r.author.name} initials={r.author.initials} color={r.author.avatarColor} size={16} />
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{r.author.name} </span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{linkify(r.text)}</span>
                {formatCommentTime(r.createdAt) && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>{formatCommentTime(r.createdAt)}</span>
                )}
              </div>
            </div>
          ))}
```

- [ ] **Step 5: Thread `onToggleLike`/`currentUserId` through `RevisionCommentSidebar`**

Add `getCurrentUser` import at the top of the file (after the existing `getTeam` import):

```ts
import { getCurrentUser } from '../data/authStore';
```

Add `onToggleLike` to the `RevisionCommentSidebar` props (around line 306-336). Change:

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

Then, inside the component body, add a `currentUserId` constant right after the existing `const { t } = useTranslation();` line:

```ts
  const currentUserId = getCurrentUser()?.id;
```

Finally, pass the two new props down to `CommentCard` in the map (around line 448-459). Change:

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
                currentUserId={currentUserId}
              />
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit -p app/tsconfig.app.json
```
Expected: 0 errors. (Every caller of `RevisionCommentSidebar` still compiles because `onToggleLike` is optional and every existing `comments` array element is structurally still a valid `RevisionComment` — the two new fields are optional.)

- [ ] **Step 7: Commit**

```bash
git add app/src/components/RevisionComments.tsx
git commit -m "feat(comments): add timestamp display and like toggle to the shared comment card"
```

---

### Task 2: Like notification preference + event wiring

**Files:**
- Modify: `app/src/data/notifPrefsStore.ts`
- Modify: `app/src/data/notificationStore.ts`
- Modify: `app/src/screens/Parametres.tsx`
- Modify: `app/src/data/commentNotify.ts`

**Interfaces:**
- Consumes: `RevisionComment` (Task 1, for the `notifyLike` parameter type).
- Produces: `notifyLike(comment: { id: string; author: { id: string }; likedBy?: string[] }, ctx: { itemLabel: string; resourceId?: string; taskId?: string; projectId?: string }): void` (exported from `commentNotify.ts`) — later tasks call this after toggling a like on.

- [ ] **Step 1: Add the `like` event to `NOTIF_EVENTS`**

In `app/src/data/notifPrefsStore.ts`, change:

```ts
export const NOTIF_EVENTS: { key: string; label: string; desc: string; icon: string }[] = [
  { key: 'comment',  label: 'Commentaires',            desc: "Quand quelqu'un commente une ressource ou une tâche", icon: 'message-square' },
  { key: 'mention',  label: 'Mentions',                desc: 'Quand on vous mentionne directement',                 icon: 'at-sign' },
  { key: 'approval', label: "Demandes d'approbation",  desc: "Quand une approbation vous est demandée",              icon: 'shield-check' },
];
```

to:

```ts
export const NOTIF_EVENTS: { key: string; label: string; desc: string; icon: string }[] = [
  { key: 'comment',  label: 'Commentaires',            desc: "Quand quelqu'un commente une ressource ou une tâche", icon: 'message-square' },
  { key: 'mention',  label: 'Mentions',                desc: 'Quand on vous mentionne directement',                 icon: 'at-sign' },
  { key: 'approval', label: "Demandes d'approbation",  desc: "Quand une approbation vous est demandée",              icon: 'shield-check' },
  { key: 'like',     label: "J'aime",                  desc: "Quand quelqu'un aime votre commentaire",               icon: 'heart' },
];
```

`DEFAULTS` (a few lines below) is built with `Object.fromEntries(NOTIF_EVENTS.map(...))` so `like` automatically gets a default entry — no change needed there, and it inherits `{ inapp: true, email: false }` since `like` matches neither `'mention'` nor `'approval'` in that ternary.

- [ ] **Step 2: Add `'like'` to `NotifKind`**

In `app/src/data/notificationStore.ts`, change:

```ts
export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version' | 'approval' | 'invitation' | 'deliverableApproved' | 'storageLimit' | 'taskCompleted';
```

to:

```ts
export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version' | 'approval' | 'invitation' | 'deliverableApproved' | 'storageLimit' | 'taskCompleted' | 'like';
```

No other change needed in this file — `getNotifs()` already filters generically by `prefs[n.kind as string]?.inapp !== false` (see `notificationStore.ts:242-243`), so the new `like` preference is respected automatically the moment `NOTIF_EVENTS`/`DEFAULTS` know about it.

- [ ] **Step 3: Hide the (non-functional) email column for the `like` row in Settings**

In `app/src/screens/Parametres.tsx`, find the notification event row (around line 2198-2213) and change the email cell:

```tsx
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Toggle on={!!notifPrefs[ev.key]?.email} onChange={v => setChannel(ev.key, 'email', v)} />
                  </div>
```

to:

```tsx
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {ev.key !== 'like' && (
                      <Toggle on={!!notifPrefs[ev.key]?.email} onChange={v => setChannel(ev.key, 'email', v)} />
                    )}
                  </div>
```

(The `like` event has no email channel per the design's simplified scope — leaving the checkbox out entirely avoids a toggle that silently does nothing.)

- [ ] **Step 4: Add `notifyLike` to `commentNotify.ts`**

In `app/src/data/commentNotify.ts`, add this new exported function after `notifyComment` (at the end of the file):

```ts
interface NotifyLikeOpts {
  comment: { id: string; author: { id?: string }; likedBy?: string[] };
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

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p app/tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/data/notifPrefsStore.ts app/src/data/notificationStore.ts app/src/screens/Parametres.tsx app/src/data/commentNotify.ts
git commit -m "feat(notifications): add like event, preference row, and notifyLike"
```

---

### Task 3: Task-comment likes (TaskPanel.tsx)

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/components/TaskPanel.tsx`

**Interfaces:**
- Consumes: `formatCommentTime`, `RevisionComment.likedBy`/`createdAt` (Task 1); `notifyLike` (Task 2).
- Produces: nothing new consumed by later tasks — this is a leaf wiring task.

- [ ] **Step 1: Widen `TaskComment`**

In `app/src/types/index.ts`, change:

```ts
export interface TaskComment {
  id: string;
  text: string;
  author: { initials: string; bg: string; name: string };
  replies: TaskComment[];
  status?: 'open' | 'resolved';
}
```

to:

```ts
export interface TaskComment {
  id: string;
  text: string;
  author: { id?: string; initials: string; bg: string; name: string };
  replies: TaskComment[];
  status?: 'open' | 'resolved';
  createdAt?: number;
  likedBy?: string[];
}
```

(`author.id` is added optionally so existing persisted comments — which never had an id on the author — keep compiling; `replies: TaskComment[]` reuses the same interface for replies, so a reply also gets `createdAt`/`likedBy` in its type even though the UI never shows a like button on a reply, per Task 1's `RevisionReply` mapping which drops `likedBy` for replies anyway.)

- [ ] **Step 2: Stamp the current user's id on `ME`**

In `app/src/components/TaskPanel.tsx`, find the `ME` object (around line 805-808) and change:

```ts
  const currentUser = getCurrentUser();
  const ME = currentUser
    ? { initials: currentUser.initials, bg: currentUser.avatarColor, name: currentUser.name }
    : { initials: USERS.lea.initials, bg: USERS.lea.avatarColor, name: USERS.lea.name };
```

to:

```ts
  const currentUser = getCurrentUser();
  const ME = currentUser
    ? { id: currentUser.id, initials: currentUser.initials, bg: currentUser.avatarColor, name: currentUser.name }
    : { id: USERS.lea.id, initials: USERS.lea.initials, bg: USERS.lea.avatarColor, name: USERS.lea.name };
```

- [ ] **Step 3: Stamp `createdAt` on new comments and replies, carry `likedBy` through `toRevisionComment`**

Change `submitComment` (around line 826-833):

```ts
  const submitComment = (text: string) => {
    if (!text.trim()) return;
    const newComment = { id: `c-${Date.now()}`, text: text.trim(), author: ME, replies: [], status: 'open' as const };
    const next = [...comments, newComment];
    setComments(next);
    onUpdate?.({ comments: next });
    notifyComment({ kind: 'add', text: text.trim(), itemLabel: task.title, taskId: task.id, projectId: breadProjectId, commentId: newComment.id });
  };
```

to:

```ts
  const submitComment = (text: string) => {
    if (!text.trim()) return;
    const newComment = { id: `c-${Date.now()}`, text: text.trim(), author: ME, replies: [], status: 'open' as const, createdAt: Date.now(), likedBy: [] as string[] };
    const next = [...comments, newComment];
    setComments(next);
    onUpdate?.({ comments: next });
    notifyComment({ kind: 'add', text: text.trim(), itemLabel: task.title, taskId: task.id, projectId: breadProjectId, commentId: newComment.id });
  };
```

Change `submitReply` (around line 835-847):

```ts
  const submitReply = (commentId: string, text: string) => {
    if (!text.trim()) return;
    const next = comments.map(c => c.id === commentId
      ? { ...c, replies: [...c.replies, { id: `r-${Date.now()}`, text: text.trim(), author: ME, replies: [] }] }
      : c
    );
```

to:

```ts
  const submitReply = (commentId: string, text: string) => {
    if (!text.trim()) return;
    const next = comments.map(c => c.id === commentId
      ? { ...c, replies: [...c.replies, { id: `r-${Date.now()}`, text: text.trim(), author: ME, replies: [], createdAt: Date.now() }] }
      : c
    );
```

Change `toRevisionComment` (around line 814-824) to carry the new fields through to the display shape:

```ts
  const toRevisionComment = (c: CommentObj): RevisionComment => ({
    id: c.id,
    author: { id: c.author.name, name: c.author.name, initials: c.author.initials, avatarColor: c.author.bg, role: '' },
    text: c.text,
    status: c.status ?? 'open',
    replies: c.replies.map(r => ({
      id: r.id,
      author: { id: r.author.name, name: r.author.name, initials: r.author.initials, avatarColor: r.author.bg, role: '' },
      text: r.text,
    })),
  });
```

to:

```ts
  const toRevisionComment = (c: CommentObj): RevisionComment => ({
    id: c.id,
    author: { id: c.author.id ?? c.author.name, name: c.author.name, initials: c.author.initials, avatarColor: c.author.bg, role: '' },
    text: c.text,
    status: c.status ?? 'open',
    createdAt: c.createdAt,
    likedBy: c.likedBy,
    replies: c.replies.map(r => ({
      id: r.id,
      author: { id: r.author.id ?? r.author.name, name: r.author.name, initials: r.author.initials, avatarColor: r.author.bg, role: '' },
      text: r.text,
      createdAt: r.createdAt,
    })),
  });
```

(The `?? c.author.name` fallback keeps the display `author.id` from ever being `undefined` — matches the existing pattern this line already used before `author.id` existed at all — while `notifyLike`'s author-id check in Task 4 below reads the *raw* `CommentObj.author.id`, not this display fallback, so legacy comments without a real author id still correctly no-op the notification.)

- [ ] **Step 4: Add the toggle-like handler and wire it into the sidebar**

Add this function right after `toggleCommentResolved` (around line 849-853):

```ts
  const toggleCommentLike = (id: string) => {
    const myId = currentUser?.id ?? USERS.lea.id;
    let liking = false;
    const next = comments.map(c => {
      if (c.id !== id) return c;
      const likedBy = c.likedBy ?? [];
      const already = likedBy.includes(myId);
      liking = !already;
      return { ...c, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
    });
    setComments(next);
    onUpdate?.({ comments: next });
    if (liking) {
      const comment = next.find(c => c.id === id);
      if (comment) notifyLike({ comment: { id: comment.id, author: comment.author, likedBy: comment.likedBy }, itemLabel: task.title, taskId: task.id, projectId: breadProjectId });
    }
  };
```

`TaskPanel.tsx` imports `notifyComment` alone (line 17). Change:

```ts
import { notifyComment } from '../data/commentNotify';
```

to:

```ts
import { notifyComment, notifyLike } from '../data/commentNotify';
```

Finally, wire `onToggleLike` into the `RevisionCommentSidebar` call (around line 1590-1597):

```tsx
              comments={comments.map(toRevisionComment)}
              activeId={activeCommentId}
              onActivate={setActiveCommentId}
              onAdd={submitComment}
              onResolve={toggleCommentResolved}
              onReply={submitReply}
              onDelete={deleteTaskComment}
              onConvertToSubtask={id => { const c = comments.find(x => x.id === id); if (c) convertToSubtask(c); }}
```

to:

```tsx
              comments={comments.map(toRevisionComment)}
              activeId={activeCommentId}
              onActivate={setActiveCommentId}
              onAdd={submitComment}
              onResolve={toggleCommentResolved}
              onReply={submitReply}
              onDelete={deleteTaskComment}
              onConvertToSubtask={id => { const c = comments.find(x => x.id === id); if (c) convertToSubtask(c); }}
              onToggleLike={toggleCommentLike}
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p app/tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 6: Live-verify**

Start the dev server (`npm run dev --prefix app`), open a task with the task panel, add a comment, confirm a timestamp ("À l'instant") and an outline heart with no count appear. Click the heart: it should turn filled/red and show "1". Click again: it un-fills and the count disappears. Reload the page (or close/reopen the panel) and confirm the like state persisted.

- [ ] **Step 7: Commit**

```bash
git add app/src/types/index.ts app/src/components/TaskPanel.tsx
git commit -m "feat(task-panel): like toggle and timestamps on task comments"
```

---

### Task 4: DocumentReview.tsx wiring

**Files:**
- Modify: `app/src/screens/DocumentReview.tsx`

**Interfaces:**
- Consumes: `RevisionComment.createdAt`/`likedBy` (Task 1), `notifyLike` (Task 2).

- [ ] **Step 1: Stamp `createdAt`/`likedBy` on new comments and replies**

In `app/src/screens/DocumentReview.tsx`, change `handleAddComment` (around line 295-305):

```ts
  const handleAddComment = (text: string) => {
    const nc: RevisionComment = {
      id: `c${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [],
      ...(pendingAnno ? { annotation: pendingAnno } : { contextLabel: activeRound }),
    };
```

to:

```ts
  const handleAddComment = (text: string) => {
    const nc: RevisionComment = {
      id: `c${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [], createdAt: Date.now(), likedBy: [],
      ...(pendingAnno ? { annotation: pendingAnno } : { contextLabel: activeRound }),
    };
```

Change `handleReply` (around line 308-311):

```ts
  const handleReply = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, replies: [...c.replies, { id: `r${Date.now()}`, author: USERS.lea, text }] } : c));
    notifyComment({ kind: 'reply', text, itemLabel: resource?.title ?? '', resourceId });
  };
```

to:

```ts
  const handleReply = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, replies: [...c.replies, { id: `r${Date.now()}`, author: USERS.lea, text, createdAt: Date.now() }] } : c));
    notifyComment({ kind: 'reply', text, itemLabel: resource?.title ?? '', resourceId });
  };
```

- [ ] **Step 2: Add the toggle-like handler**

Add this function right after `handleResolve` (around line 307):

```ts
  const handleToggleLike = (id: string) => {
    const myId = getCurrentUser()?.id ?? USERS.lea.id;
    let liking = false;
    setComments(prev => prev.map(c => {
      if (c.id !== id) return c;
      const likedBy = c.likedBy ?? [];
      const already = likedBy.includes(myId);
      liking = !already;
      return { ...c, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
    }));
    if (liking) {
      const comment = comments.find(c => c.id === id);
      if (comment) notifyLike({ comment, itemLabel: resource?.title ?? '', resourceId });
    }
  };
```

`DocumentReview.tsx` has no existing import from `../data/authStore` and imports `notifyComment` alone from `../data/commentNotify` (line 13). Add a new import line for `getCurrentUser`, and change the existing `commentNotify` import:

```ts
import { notifyComment } from '../data/commentNotify';
```

to:

```ts
import { getCurrentUser } from '../data/authStore';
import { notifyComment, notifyLike } from '../data/commentNotify';
```

- [ ] **Step 3: Wire `onToggleLike` into the sidebar**

Around line 786-803, add `onToggleLike={handleToggleLike}` next to the other handler props:

```tsx
                onAdd={handleAddComment}
                onResolve={handleResolve}
                onReply={handleReply}
                onDelete={handleDeleteComment}
```

to:

```tsx
                onAdd={handleAddComment}
                onResolve={handleResolve}
                onReply={handleReply}
                onDelete={handleDeleteComment}
                onToggleLike={handleToggleLike}
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p app/tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/DocumentReview.tsx
git commit -m "feat(document-review): wire comment likes and timestamps"
```

---

### Task 5: ImageReview.tsx wiring

**Files:**
- Modify: `app/src/screens/ImageReview.tsx`

**Interfaces:**
- Consumes: `RevisionComment.createdAt`/`likedBy` (Task 1), `notifyLike` (Task 2).

- [ ] **Step 1: Stamp `createdAt`/`likedBy` at both comment-creation sites**

Change `handleAddComment` (around line 285-293):

```ts
  const handleAddComment = (text: string) => {
    const newComment: RevisionComment = {
      id: `c${Date.now()}`,
      author: USERS.lea,
      text,
      status: 'open',
      replies: [],
      ...(pendingAnno ? { annotation: pendingAnno } : { contextLabel: round.v }),
    };
```

to:

```ts
  const handleAddComment = (text: string) => {
    const newComment: RevisionComment = {
      id: `c${Date.now()}`,
      author: USERS.lea,
      text,
      status: 'open',
      replies: [],
      createdAt: Date.now(),
      likedBy: [],
      ...(pendingAnno ? { annotation: pendingAnno } : { contextLabel: round.v }),
    };
```

Change the inline `onAdd` at line 572:

```tsx
                onAdd={text => { const nc: RevisionComment = { id: `c${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [], contextLabel: round.v }; setComments(prev => [...prev, nc]); setActiveCommentId(nc.id); if (resourceId) incrementCommentCount(resourceId); notifyComment({ kind: 'add', text, itemLabel: resource?.title ?? '', resourceId, projectId }); }}
```

to:

```tsx
                onAdd={text => { const nc: RevisionComment = { id: `c${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [], createdAt: Date.now(), likedBy: [], contextLabel: round.v }; setComments(prev => [...prev, nc]); setActiveCommentId(nc.id); if (resourceId) incrementCommentCount(resourceId); notifyComment({ kind: 'add', text, itemLabel: resource?.title ?? '', resourceId, projectId }); }}
```

Change `handleReply` (around line 305-310), which is shared by both sidebar instances:

```ts
  const handleReply = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? {
      ...c, replies: [...c.replies, { id: `r${Date.now()}`, author: USERS.lea, text }],
    } : c));
    notifyComment({ kind: 'reply', text, itemLabel: resource?.title ?? '', resourceId, projectId });
  };
```

to:

```ts
  const handleReply = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? {
      ...c, replies: [...c.replies, { id: `r${Date.now()}`, author: USERS.lea, text, createdAt: Date.now() }],
    } : c));
    notifyComment({ kind: 'reply', text, itemLabel: resource?.title ?? '', resourceId, projectId });
  };
```

- [ ] **Step 2: Add the shared toggle-like handler**

Add this function right after `handleResolve` (around line 303):

```ts
  const handleToggleLike = (id: string) => {
    const myId = getCurrentUser()?.id ?? USERS.lea.id;
    let liking = false;
    setComments(prev => prev.map(c => {
      if (c.id !== id) return c;
      const likedBy = c.likedBy ?? [];
      const already = likedBy.includes(myId);
      liking = !already;
      return { ...c, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
    }));
    if (liking) {
      const comment = comments.find(c => c.id === id);
      if (comment) notifyLike({ comment, itemLabel: resource?.title ?? '', resourceId, projectId });
    }
  };
```

Like `DocumentReview.tsx`, `ImageReview.tsx` has no existing import from `../data/authStore` and imports `notifyComment` alone from `../data/commentNotify` (line 13). Change:

```ts
import { notifyComment } from '../data/commentNotify';
```

to:

```ts
import { getCurrentUser } from '../data/authStore';
import { notifyComment, notifyLike } from '../data/commentNotify';
```

- [ ] **Step 3: Wire `onToggleLike` into both `RevisionCommentSidebar` instances**

At the first instance (around line 567-574):

```tsx
                onAdd={text => { const nc: RevisionComment = { id: `c${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [], createdAt: Date.now(), likedBy: [], contextLabel: round.v }; setComments(prev => [...prev, nc]); setActiveCommentId(nc.id); if (resourceId) incrementCommentCount(resourceId); notifyComment({ kind: 'add', text, itemLabel: resource?.title ?? '', resourceId, projectId }); }}
                onResolve={handleResolve}
                onReply={handleReply}
```

to:

```tsx
                onAdd={text => { const nc: RevisionComment = { id: `c${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [], createdAt: Date.now(), likedBy: [], contextLabel: round.v }; setComments(prev => [...prev, nc]); setActiveCommentId(nc.id); if (resourceId) incrementCommentCount(resourceId); notifyComment({ kind: 'add', text, itemLabel: resource?.title ?? '', resourceId, projectId }); }}
                onResolve={handleResolve}
                onReply={handleReply}
                onToggleLike={handleToggleLike}
```

At the second instance (around line 676-683):

```tsx
                onAdd={handleAddComment}
                onResolve={handleResolve}
                onReply={handleReply}
```

to:

```tsx
                onAdd={handleAddComment}
                onResolve={handleResolve}
                onReply={handleReply}
                onToggleLike={handleToggleLike}
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p app/tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/ImageReview.tsx
git commit -m "feat(image-review): wire comment likes and timestamps"
```

---

### Task 6: ResourceDetail.tsx wiring (shared `ResourceCommentSidebar` wrapper)

**Files:**
- Modify: `app/src/screens/ResourceDetail.tsx`

**Interfaces:**
- Consumes: `RevisionComment.createdAt`/`likedBy` (Task 1), `notifyLike` (Task 2).

**Note:** `ResourceCommentSidebar` (around `ResourceDetail.tsx:294`) is one shared component used by every resource type that isn't Video/Web/Document/Image Review (Moodboard, Storyboard, Inspirations, Formulaire, etc. — see the comment at `ResourceDetail.tsx:286-293`). Fixing it here covers all of them at once. This task does **not** touch the separate `DocComment`-based sidebar at `ResourceDetail.tsx:2623` (DocumentView's own comment thread) — that's the out-of-scope system called out in Global Constraints.

- [ ] **Step 1: Stamp `createdAt`/`likedBy` on new comments and replies**

Change `handleAdd` (around line 304-307):

```ts
  const handleAdd = (text: string) => {
    setComments(prev => [...prev, { id: `sc-${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [] }]);
    notifyComment({ kind: 'add', text, itemLabel, resourceId, projectId });
  };
```

to:

```ts
  const handleAdd = (text: string) => {
    setComments(prev => [...prev, { id: `sc-${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [], createdAt: Date.now(), likedBy: [] }]);
    notifyComment({ kind: 'add', text, itemLabel, resourceId, projectId });
  };
```

Change `handleReply` (around line 311-314):

```ts
  const handleReply = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, replies: [...c.replies, { id: `sr-${Date.now()}`, author: USERS.lea, text }] } : c));
    notifyComment({ kind: 'reply', text, itemLabel, resourceId, projectId });
  };
```

to:

```ts
  const handleReply = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, replies: [...c.replies, { id: `sr-${Date.now()}`, author: USERS.lea, text, createdAt: Date.now() }] } : c));
    notifyComment({ kind: 'reply', text, itemLabel, resourceId, projectId });
  };
```

- [ ] **Step 2: Add the toggle-like handler**

Add this function right after `handleResolve` (around line 310):

```ts
  const handleToggleLike = (id: string) => {
    const myId = getCurrentUser()?.id ?? USERS.lea.id;
    let liking = false;
    setComments(prev => prev.map(c => {
      if (c.id !== id) return c;
      const likedBy = c.likedBy ?? [];
      const already = likedBy.includes(myId);
      liking = !already;
      return { ...c, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
    }));
    if (liking) {
      const comment = comments.find(c => c.id === id);
      if (comment) notifyLike({ comment, itemLabel, resourceId, projectId });
    }
  };
```

`ResourceDetail.tsx` already imports `isDemoSession` from `../data/authStore` (line 11) and `notifyComment` alone from `../data/commentNotify` (line 18). Change:

```ts
import { isDemoSession } from '../data/authStore';
```

to:

```ts
import { isDemoSession, getCurrentUser } from '../data/authStore';
```

and change:

```ts
import { notifyComment } from '../data/commentNotify';
```

to:

```ts
import { notifyComment, notifyLike } from '../data/commentNotify';
```

- [ ] **Step 3: Wire `onToggleLike` into the sidebar**

Around line 329-339:

```tsx
      <RevisionCommentSidebar
        comments={comments}
        activeId={activeId}
        onActivate={setActiveId}
        onAdd={handleAdd}
        onResolve={handleResolve}
        onReply={handleReply}
        onDelete={handleDelete}
        pendingAnnotation={false}
        onCancelPending={() => {}}
        embedded
```

to:

```tsx
      <RevisionCommentSidebar
        comments={comments}
        activeId={activeId}
        onActivate={setActiveId}
        onAdd={handleAdd}
        onResolve={handleResolve}
        onReply={handleReply}
        onDelete={handleDelete}
        onToggleLike={handleToggleLike}
        pendingAnnotation={false}
        onCancelPending={() => {}}
        embedded
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p app/tsconfig.app.json
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/ResourceDetail.tsx
git commit -m "feat(resource-detail): wire comment likes and timestamps in the shared comment sidebar"
```

---

### Task 7: WebReview.tsx wiring

**Files:**
- Modify: `app/src/screens/WebReview.tsx`

**Interfaces:**
- Consumes: `RevisionComment.createdAt`/`likedBy` (Task 1), `notifyLike` (Task 2).

**Note:** WebReview's own `Annotation` type already has a `createdAt` field — but it's a `string` holding a hand-written mock label (e.g. `'Il y a 2h'`), never actually computed, and it's silently dropped by `toRevisionComment` today (which is the concrete bug behind "les dates n'apparaissent pas" the user originally reported for this screen). This task converts it to a real `number` timestamp and threads it through — this is the one file in this plan where the field isn't purely additive, it's a type change on an existing field.

- [ ] **Step 1: Change `Annotation.createdAt` to a real timestamp, add `likedBy`**

Change the `Annotation` interface (around line 13-25):

```ts
interface Annotation {
  id: string;
  // Page-absolute pixel coordinates (from top-left of the scrollable page, not the viewport)
  x: number;
  y: number;
  text: string;
  author: string;
  authorInitials: string;
  authorColor: string;
  resolved: boolean;
  createdAt: string;
  replies: RevisionReply[];
}
```

to:

```ts
interface Annotation {
  id: string;
  // Page-absolute pixel coordinates (from top-left of the scrollable page, not the viewport)
  x: number;
  y: number;
  text: string;
  author: string;
  authorId?: string;
  authorInitials: string;
  authorColor: string;
  resolved: boolean;
  createdAt: number;
  likedBy?: string[];
  replies: RevisionReply[];
}
```

- [ ] **Step 2: Fix the mock data to use real numeric timestamps**

Change `DEMO_ANNOTATIONS` (around line 28-32):

```ts
const DEMO_ANNOTATIONS: Annotation[] = [
  { id: 'a1', x: 300, y: 150, text: 'Le logo est trop petit sur mobile. Agrandir à 48px minimum.', author: 'Léa Marchand', authorInitials: 'LM', authorColor: '#3b4f8f', resolved: false, createdAt: 'Il y a 2h', replies: [] },
  { id: 'a2', x: 650, y: 380, text: 'Cette section manque de contraste. Tester avec un fond plus foncé.', author: 'Marc Dupont', authorInitials: 'MD', authorColor: '#1a6b4a', resolved: false, createdAt: 'Il y a 45 min', replies: [] },
  { id: 'a3', x: 420, y: 620, text: 'CTA bien placé, approuvé.', author: 'Léa Marchand', authorInitials: 'LM', authorColor: '#3b4f8f', resolved: true, createdAt: 'Hier', replies: [] },
];
```

to:

```ts
const DEMO_ANNOTATIONS: Annotation[] = [
  { id: 'a1', x: 300, y: 150, text: 'Le logo est trop petit sur mobile. Agrandir à 48px minimum.', author: 'Léa Marchand', authorId: USERS.lea.id, authorInitials: 'LM', authorColor: '#3b4f8f', resolved: false, createdAt: Date.now() - 2 * 60 * 60 * 1000, likedBy: [], replies: [] },
  { id: 'a2', x: 650, y: 380, text: 'Cette section manque de contraste. Tester avec un fond plus foncé.', author: 'Marc Dupont', authorInitials: 'MD', authorColor: '#1a6b4a', resolved: false, createdAt: Date.now() - 45 * 60 * 1000, likedBy: [], replies: [] },
  { id: 'a3', x: 420, y: 620, text: 'CTA bien placé, approuvé.', author: 'Léa Marchand', authorId: USERS.lea.id, authorInitials: 'LM', authorColor: '#3b4f8f', resolved: true, createdAt: Date.now() - 24 * 60 * 60 * 1000, likedBy: [], replies: [] },
];
```

`WebReview.tsx` has no existing import of `USERS` or `getCurrentUser`. Add both, alongside the existing `isDemoSession` import (line 8). Change:

```ts
import { isDemoSession } from '../data/authStore';
```

to:

```ts
import { isDemoSession, getCurrentUser } from '../data/authStore';
```

and add, right after the `getResources`/`updateResource` import line:

```ts
import { USERS } from '../data/mock';
```

(`'a2'`'s author, Marc Dupont, has no `authorId` here since there's no `USERS.marc` entry in the mock data to reference — leaving it `undefined` is correct and matches the "no resolvable author id → like-notify no-ops" stance from Global Constraints.)

- [ ] **Step 3: Stamp real values when a new annotation/reply is created, and use the real current user as author**

Change `commitAnnotation` (around line 214-234):

```ts
  const commitAnnotation = () => {
    if (!pendingPos || !draftText.trim()) return;
    const ann: Annotation = {
      id: `a${Date.now()}`,
      x: pendingPos.x,
      y: pendingPos.y,
      text: draftText.trim(),
      author: 'Moi',
      authorInitials: 'MO',
      authorColor: '#5b3ea8',
      resolved: false,
      createdAt: 'À l\'instant',
      replies: [],
    };
```

to:

```ts
  const commitAnnotation = () => {
    if (!pendingPos || !draftText.trim()) return;
    const me = getCurrentUser();
    const ann: Annotation = {
      id: `a${Date.now()}`,
      x: pendingPos.x,
      y: pendingPos.y,
      text: draftText.trim(),
      author: me?.name ?? 'Moi',
      authorId: me?.id,
      authorInitials: me?.initials ?? 'MO',
      authorColor: me?.avatarColor ?? '#5b3ea8',
      resolved: false,
      createdAt: Date.now(),
      likedBy: [],
      replies: [],
    };
```

(`getCurrentUser` is now imported per Step 2's import change above.)

Change `replyToAnnotation` (around line 245-248) to stamp `createdAt` on the reply:

```ts
  const replyToAnnotation = (id: string, text: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, replies: [...a.replies, { id: `wr${Date.now()}`, author: { id: 'moi', name: 'Moi', initials: 'MO', avatarColor: '#5b3ea8', role: '' }, text }] } : a));
    notifyComment({ kind: 'reply', text, itemLabel: resource?.title ?? host, resourceId: resource?.id, projectId });
  };
```

to:

```ts
  const replyToAnnotation = (id: string, text: string) => {
    const me = getCurrentUser();
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, replies: [...a.replies, { id: `wr${Date.now()}`, author: { id: me?.id ?? 'moi', name: me?.name ?? 'Moi', initials: me?.initials ?? 'MO', avatarColor: me?.avatarColor ?? '#5b3ea8', role: '' }, text, createdAt: Date.now() }] } : a));
    notifyComment({ kind: 'reply', text, itemLabel: resource?.title ?? host, resourceId: resource?.id, projectId });
  };
```

- [ ] **Step 4: Add the toggle-like handler**

Add this function right after `toggleResolved` (around line 236-238):

```ts
  const toggleLikeAnnotation = (id: string) => {
    const myId = getCurrentUser()?.id ?? 'moi';
    let liking = false;
    setAnnotations(prev => prev.map(a => {
      if (a.id !== id) return a;
      const likedBy = a.likedBy ?? [];
      const already = likedBy.includes(myId);
      liking = !already;
      return { ...a, likedBy: already ? likedBy.filter(u => u !== myId) : [...likedBy, myId] };
    }));
    if (liking) {
      const ann = annotations.find(a => a.id === id);
      if (ann) notifyLike({ comment: { id: ann.id, author: { id: ann.authorId }, likedBy: ann.likedBy }, itemLabel: resource?.title ?? host, resourceId: resource?.id, projectId });
    }
  };
```

Add `notifyLike` to the existing `notifyComment` import line — change:

```ts
import { notifyComment } from '../data/commentNotify';
```

to:

```ts
import { notifyComment, notifyLike } from '../data/commentNotify';
```

- [ ] **Step 5: Pass `createdAt`/`likedBy` through `toRevisionComment` and wire `onToggleLike` into the sidebar**

Change `toRevisionComment` (around line 250-257):

```ts
  const toRevisionComment = (ann: Annotation, index: number): RevisionComment => ({
    id: ann.id,
    author: { id: `wa-${index}`, name: ann.author, initials: ann.authorInitials, avatarColor: ann.authorColor, role: '' },
    text: ann.text,
    status: ann.resolved ? 'resolved' : 'open',
    annotation: { x: ann.x, y: ann.y },
    replies: ann.replies,
  });
```

to:

```ts
  const toRevisionComment = (ann: Annotation, index: number): RevisionComment => ({
    id: ann.id,
    author: { id: ann.authorId ?? `wa-${index}`, name: ann.author, initials: ann.authorInitials, avatarColor: ann.authorColor, role: '' },
    text: ann.text,
    status: ann.resolved ? 'resolved' : 'open',
    annotation: { x: ann.x, y: ann.y },
    createdAt: ann.createdAt,
    likedBy: ann.likedBy,
    replies: ann.replies,
  });
```

Find the `RevisionCommentSidebar` usage (around line 504-514) and change:

```tsx
            <RevisionCommentSidebar
              comments={visible.map((ann, i) => toRevisionComment(ann, i))}
              activeId={selectedId}
              onActivate={setSelectedId}
              onResolve={toggleResolved}
              onReply={replyToAnnotation}
              onDelete={deleteAnnotation}
              pendingAnnotation={false}
              onCancelPending={() => {}}
              embedded
            />
```

to:

```tsx
            <RevisionCommentSidebar
              comments={visible.map((ann, i) => toRevisionComment(ann, i))}
              activeId={selectedId}
              onActivate={setSelectedId}
              onResolve={toggleResolved}
              onReply={replyToAnnotation}
              onDelete={deleteAnnotation}
              onToggleLike={toggleLikeAnnotation}
              pendingAnnotation={false}
              onCancelPending={() => {}}
              embedded
            />
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit -p app/tsconfig.app.json
```
Expected: 0 errors. Pay particular attention to any error mentioning `Annotation.createdAt` — it means a leftover string literal (e.g. `createdAt: 'À l\'instant'`) from Step 3 wasn't fully replaced.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/WebReview.tsx
git commit -m "feat(web-review): real numeric timestamps (fixing the never-shown mock dates), likes"
```

---

### Task 8: Whole-branch review and finishing

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit -p app/tsconfig.app.json
```
Expected: 0 errors across the whole branch.

- [ ] **Step 2: Live walkthrough**

Start the dev server and, for each of the four screens touched (Task Panel, Document Review, Image Review, and one `ResourceCommentSidebar`-backed resource type like Moodboard or Storyboard, and Web Review): open a resource/task with existing comments, confirm timestamps render in the tiered format, add a new comment and confirm it shows "À l'instant", like it and confirm the heart fills and shows "1", unlike and confirm it reverts. In Paramètres → Notifications, confirm the new "J'aime" row appears with only an in-app toggle (no email checkbox).

- [ ] **Step 3: Whole-branch code review**

Use superpowers:requesting-code-review's code-reviewer prompt against the full branch diff (`git merge-base master HEAD` as the base) before merging, per the subagent-driven-development flow if that execution path was chosen.

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch to merge/push per the user's chosen workflow.
