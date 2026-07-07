# Resource Content Supabase Migration — Design

**Status:** Approved by user (2026-07-06). Sub-project 3 of 3 for the "Fichiers/Ressources" chantier (Phase 2 backend migration, 7th chantier overall) — final piece.

## Goal

Migrate `resourceContentStore.ts` (currently an opaque `Record<resourceId, unknown>` blob persisted to `localStorage`) to real, durable, studio-scoped storage on Supabase, while keeping the 3 hardcoded demo accounts (Léa, Sarah, Thomas) working unchanged.

## Scope

**In scope:** the generic content store (`resourceContentStore.ts`) that backs every resource editor's rich content — rich text documents, video/image review rounds and comments, checklists, mindmaps, forms, screenplay/script versions. This module is the sole read/write surface for that content; no consumer-side code changes are required by this migration.

**Explicitly out of scope:**
- Real-time collaborative editing (two people editing the same resource simultaneously with live merge). Confirmed unnecessary — the app has no real-time collaboration anywhere today. "Last write wins" (identical to current `localStorage` behavior) is preserved. A lighter middle ground — a Supabase Realtime notification ("Sarah a modifié ce document, recharger ?") — was discussed and explicitly deferred to a future chantier if the need becomes concrete.
- `StoryboardView` (in `ResourceDetail.tsx`) — confirmed via code inspection to have **no** `persistKey` and no call into `resourceContentStore` at all; it is currently mock-only/ephemeral (seeded from `MOCK_SB_SCENES`), unrelated to this migration.
- Any other store in `app/src/data/` not already covered by a prior sub-project (`financeStore.ts`, `eventStore.ts`, `teamStore.ts`, `commentStore.ts`, `notificationStore.ts`, `templates.ts`, etc.) — out of scope for this chantier, candidates for a future, separately-scoped audit.

## Current shape (confirmed via code exploration)

`resourceContentStore.ts` is a single generic key-value store:

```ts
export function getResourceContent<T = unknown>(resourceId: string): T | undefined
export function setResourceContent<T = unknown>(resourceId: string, content: T): void
export function removeResourceContent(resourceId: string): void
export function subscribeResourceContent(fn: () => void): () => void
```

Backed by one `localStorage` key (`sf_resource_content`) holding `Record<resourceId, unknown>`. The store is intentionally opaque — each of the 9 consumer files/hooks owns the shape of its own content (rich text HTML + comments, checklist items, mindmap items/arrows, form questions, script versions, etc.); the store never inspects or queries by content shape.

Two generic hooks are layered on top and used by some (not all) consumers:
- `useResourceContent<T>(resourceId, fallback, debounceMs=400)` — `useState` seeded synchronously from `getResourceContent` at mount, debounced writes, flush on unmount.
- `useResourceVersions<T>(resourceId, makeInitial, todayLabel, debounceMs=400)` — same pattern, wrapping content in a `{ versions: [...], activeId }` envelope for the version-history feature (used by the Script/Shotlist editor).

The remaining consumers (`DocumentReview.tsx`, `VideoReview.tsx`, `ImageReview.tsx`, and 6 call sites inside `ResourceDetail.tsx` for Checklist/Mindmap/Form/Inspirations) hand-roll the identical pattern directly (`getResourceContent` read once at mount to seed `useState`, a debounced `setTimeout` write, a flush-on-unmount effect) rather than using the hooks. This migration does not consolidate that duplication — out of scope, YAGNI, and not required for the backend swap to work.

**Confirmed dead code:** `removeResourceContent` is exported but never called anywhere in the app. Deleting a resource today (`resourceStore.removeResource`) leaves its content permanently orphaned in `localStorage`. This migration fixes it (see below).

## Preload vs. on-demand — decision

Two approaches were discussed with the user:

1. **Preload** (chosen): fetch all of a studio's `resource_content` rows into an in-memory cache once, at the same point `resourceStore`/`fileStore`/`projectStore`/`clientStore` already do their studio-wide fetch. `getResourceContent` then reads synchronously from that cache, exactly as it does today from `localStorage`. Zero code changes required in any of the 9 consumer files or the 2 hooks, because the synchronous-read contract is preserved.
2. **On-demand** (rejected): fetch content lazily per `resourceId` when a resource is opened. Rejected because every consumer reads `getResourceContent` synchronously inside a `useState` initializer to seed **editable** local state — an async fetch arriving after mount would require adding a loading/skeleton state to 5+ screens and guarding against overwriting in-progress edits with a late-arriving fetch result. Given this app's realistic scale (a small production studio, not an enterprise account with thousands of resources), the preload approach's larger initial payload is not expected to be perceptible, and it is far simpler and lower-risk than threading loading states through every editor.

## Supabase schema

```sql
create table resource_content (
  resource_id uuid primary key references resources(id) on delete cascade,
  studio_id uuid not null references studios(id),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table resource_content enable row level security;

create policy "studio members can manage their resource content"
  on resource_content for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));
```

- `resource_id` is the primary key (one row per resource, one-to-one — matches the current one-key-per-resourceId shape exactly).
- `on delete cascade` on the FK to `resources(id)` means deleting a resource automatically deletes its content row — fixing the dead-code/orphaned-content bug described above, at the database level, for real accounts.
- RLS policy reuses the `my_studio_ids()` helper already established for every other table in this Phase 2 migration (Projects, Clients, Tasks, Files, Resources).
- `content` defaults to `'{}'::jsonb` but in practice every write replaces it wholesale (the store's `setResourceContent` always writes a full new value, never a partial merge) — matching today's `localStorage` semantics exactly.

## `resourceContentStore.ts` — new shape

Rewritten with the same dual demo/real path pattern as `resourceStore.ts` and `fileStore.ts`:

- **Demo sessions** (`isDemoSession() === true`): unchanged — same `localStorage` key (`sf_resource_content`), same synchronous `Record<resourceId, unknown>` behavior, byte-for-byte identical to today.
- **Real sessions**: on studio resolution, one `select * from resource_content where studio_id = eq.<studioId>` populates an in-memory cache (`_supabaseContent: Record<string, unknown>`), mirroring the existing pattern from `resourceStore.ts`/`fileStore.ts`. All 4 exported functions keep their exact current signatures:
  - `getResourceContent<T>(resourceId)` — synchronous read from the in-memory cache (post-preload).
  - `setResourceContent<T>(resourceId, content)` — updates the in-memory cache synchronously, fires a background `upsert` (fire-and-forget, same "stay-sync-via-cache" pattern as every other store this chantier) to persist to Supabase.
  - `removeResourceContent(resourceId)` — removes from the in-memory cache synchronously, fires a background `delete` to Supabase (redundant with the `on delete cascade` when resource deletion is the trigger, but kept as the primary explicit mechanism since it also needs to work for demo sessions, which have no cascade).
  - `subscribeResourceContent(fn)` — unchanged pub-sub shape.

**Fixing the dead-code bug:** `resourceStore.ts`'s `removeResource(id)` is updated to call `removeResourceContent(id)` explicitly. This is the primary cleanup mechanism (works identically for demo and real sessions); the database `on delete cascade` is a secondary safety net for real accounts specifically (e.g., if a resource row is ever deleted through a path other than `removeResource`).

No changes are required to `useResourceContent.ts`, `useResourceVersions.ts`, or any of the 9 consumer files — the synchronous-read contract is preserved by the preload, so every existing call site keeps working unmodified.

## Deferred ideas (not in scope)

- **Resource archiving**: the user asked whether any resource type could have an "archived" state, similar to the `trashed`/`archived` fields already on `fileStore.ts`'s files. Confirmed via code inspection that `resourceStore.ts` has no such concept today — this would be a new feature, not a migration of existing behavior, and it would touch `resourceStore.ts` (resource metadata, already migrated in sub-project 1) plus new UI (archive/restore actions, possibly an "Archived resources" view), not `resourceContentStore.ts`. Deferred to a future, separately-scoped chantier so this sub-project stays focused on the content-storage backend swap.
- **Realtime conflict notification**: see "Explicitly out of scope" above — a lightweight "someone else edited this" notice via Supabase Realtime, deferred until a concrete need arises.

## Testing / verification plan

- Demo-session regression: all 9 editors (Document, Video, Image review; Checklist, Mindmap, Form, Inspirations, Screenplay/versions inside `ResourceDetail.tsx`) persist and reload content exactly as before, no console errors.
- Real-session content round-trip: create/edit content in each editor type, reload the page, confirm the content reloads correctly from Supabase (not just from the in-memory cache surviving a soft navigation).
- Deletion: delete a resource, confirm its `resource_content` row disappears (via the FK cascade) and no trace remains in the in-memory cache.
- Cross-studio isolation: confirm a studio cannot read or write another studio's resource content (RLS).
- Final typecheck/lint diff against the current baseline (185 typecheck errors / 339 lint problems — the baseline established at the end of sub-project 2, which already includes the one accepted plan-mandated lint delta from that sub-project's Task 4).
