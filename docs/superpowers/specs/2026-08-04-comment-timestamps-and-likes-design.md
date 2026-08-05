# Comment Timestamps & Likes — Design

**Goal:** Comments (and their replies) currently carry no creation time at all, and have no way to react to them. Add a tiered relative/absolute timestamp, a per-person toggleable like (shown as a heart + count), and a notification preference so a comment's author can opt in/out of being notified when their comment is liked.

**Scope:** This touches the single shared comment shape used everywhere comments render — `RevisionComment`/`RevisionReply` in `app/src/components/RevisionComments.tsx` and the parallel `CommentObj` in `app/src/components/TaskPanel.tsx` (kept in sync by hand today, not literally shared — both get the same three new fields). Because `RevisionCommentSidebar` is reused by the task panel and all 7+ resource-review editors (Document, Image, Video, WebReview, Storyboard/Scénario, etc.), this one change applies everywhere comments already exist. No new screens.

## Data model

Add to `RevisionComment`, `RevisionReply`, and `CommentObj` (three call sites for the same two fields — replies do **not** get likes, only top-level comments):

```ts
// RevisionComment / CommentObj (top-level comments only)
createdAt: number;      // Date.now() at creation, stamped once, never rewritten
likedBy: string[];      // user ids who currently like this comment (toggle membership)

// RevisionReply (replies)
createdAt: number;      // same stamping rule; no likedBy — replies are not likeable
```

No new Supabase table or column. Comments already live embedded as JSON inside `task.comments` (via `taskStore.updateTask`) and `resource.comments` (via `resourceStore.updateResource`) — both new fields ride the existing `onUpdate({ comments: next })` patch path used for every other comment mutation (add/reply/resolve/delete) today. Existing comments in already-created tasks/resources simply won't have `createdAt`/`likedBy` until they're next touched; the UI treats a missing `createdAt` as "no timestamp shown" and a missing `likedBy` as `[]` — no backfill migration needed.

## Timestamp format

A new pure function, `formatCommentTime(createdAt: number): string`, colocated in `RevisionComments.tsx` (the one file every comment surface already imports from) and used by both the top-level comment row and the reply row:

| Age | Format | Example |
|---|---|---|
| < 1 min | "À l'instant" | — |
| < 60 min | "Il y a X min" | "Il y a 35 min" |
| < 24h, same calendar day | "Il y a Xh" | "Il y a 5h" |
| Yesterday (calendar day − 1) | "Hier à HH:mm" | "Hier à 14:32" |
| Day before yesterday | "Avant-hier à HH:mm" | "Avant-hier à 14:32" |
| Older, same year | "D MMM à HH:mm" | "4 août à 14:32" |
| Older, different year | "D MMM AAAA à HH:mm" | "4 août 2025 à 14:32" |

"Calendar day" boundaries (yesterday/avant-hier) compare local midnight-to-midnight, not a rolling 24h/48h window — matches how every other app in this genre does it (a comment from 11:58pm yesterday reads "Hier", not "Il y a 14h"). Uses `toLocaleDateString('fr-CA', ...)`-style formatting already used elsewhere in the codebase (e.g. `SubTaskRow.fmtDate` in `TaskPanel.tsx`) for the month/day pieces, not a new date library.

This is a static, non-live string — it's computed once at render and does not tick/update on its own while the panel stays open (no `setInterval`). Reopening the comment thread (or any re-render triggered by other state) recomputes it, which is enough for this use case — nobody expects "il y a 35 min" to tick to "il y a 36 min" while they're mid-typing a reply.

## Likes UI

In `RevisionCommentSidebar`'s comment row (not reply rows), next to the existing reply/resolve/delete action icons: a heart-shaped toggle button.

- Filled/accent-colored heart when the current user's id is in `likedBy`, outline otherwise.
- A count next to it, shown only when `likedBy.length > 0` (an unliked comment shows just the outline heart, no "0").
- Clicking toggles the current user's id in/out of `likedBy` and calls the existing `onUpdate`-style callback the sidebar already uses for other mutations (same plumbing as resolve/delete — no new callback prop shape, just a new one: `onToggleLike(commentId: string)`).
- No list of *who* liked it (no avatars, no tooltip) — just the number, per the simplified scope agreed on.

## Notifications

- Add one entry to `NOTIF_EVENTS` in `app/src/data/notifPrefsStore.ts`:
  ```ts
  { key: 'like', label: 'J\'aime', desc: 'Quand quelqu\'un aime votre commentaire', icon: 'heart' }
  ```
  Defaulted to `{ inapp: true, email: false }` in `DEFAULTS`, reusing the existing `ChannelPrefs` shape rather than inventing a boolean-only variant.
- `Parametres.tsx`'s notification list (`app/src/screens/Parametres.tsx:2198`) renders one row per `NOTIF_EVENTS` entry with **both** an in-app and an email checkbox, generically, for every event. Since `like` has no email channel, its row needs the email cell replaced with a disabled/empty placeholder (small per-row conditional: `ev.key === 'like' ? null : <checkbox/>`) instead of a live checkbox that silently does nothing when toggled.
- New function in `app/src/data/commentNotify.ts`, `notifyLike(comment, ctx)`, called from the toggle-like handler **only on the transition to liked** (not on unlike), and only when the liker is not the comment's own author (no self-notify). It resolves the comment author's user id, checks their `like` in-app notif_prefs (same per-recipient gating pattern `commentNotify.ts` already uses for other events via `notif_prefs`/RLS), and calls `addNotif` targeted at just that one author — not the full watcher list (liking is between the liker and the author, unlike a new comment which notifies everyone watching).
- No email is sent for likes (matches the `email: false`, permanently-off default above).

## What's explicitly out of scope

- No live-updating "ticking" timestamp.
- No likes on replies.
- No "who liked this" avatar list or hover card.
- No email notification channel for likes.
- No backfill of `createdAt`/`likedBy` on existing comments — they gain the fields the next time they're mutated (a reply, a resolve, etc. triggers a full `comments` array rewrite already).
