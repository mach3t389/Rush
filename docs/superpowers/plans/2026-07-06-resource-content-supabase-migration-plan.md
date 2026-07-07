# Resource Content Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `resourceContentStore.ts` (the generic content blob behind every resource editor) from `localStorage`-only to a dual demo/real-session store backed by Supabase, with zero changes required in any of the 9 consumer files or the 2 generic hooks that read it.

**Architecture:** One new table (`resource_content`, one row per resource, `content` as JSONB) mirrors the existing `Record<resourceId, unknown>` shape exactly. `resourceContentStore.ts` is rewritten with the same dual demo/real pattern already proven in `resourceStore.ts`: real sessions bulk-fetch all of a studio's content into an in-memory cache, and all four exported functions read/write that cache synchronously while firing background Supabase calls. A new `preloadResourceContent()` export, awaited from the app's top-level `authLoader` in `main.tsx`, guarantees the cache is populated before any resource-detail screen can mount — closing a race that would otherwise exist because (unlike every other store in this app) the 9 consumers read the store exactly once at mount, with no subscription to pick up a late-arriving fetch.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + `supabase-js` client), existing `authStore.ts`/`studioStore.ts` session/studio resolution helpers, React Router v7 data-router loaders.

## Global Constraints

- Demo-session behavior in `resourceContentStore.ts` must stay byte-for-byte identical to today: same `localStorage` key (`sf_resource_content`), same `Record<resourceId, unknown>` shape, fully synchronous.
- All 4 existing exported functions keep their exact current signatures: `getResourceContent<T = unknown>(resourceId: string): T | undefined`, `setResourceContent<T = unknown>(resourceId: string, content: T): void`, `removeResourceContent(resourceId: string): void`, `subscribeResourceContent(fn: () => void): () => void`. None of the 9 consumer files (`DocumentReview.tsx`, `VideoReview.tsx`, `ImageReview.tsx`, `ResourceDetail.tsx` ×6 call sites, `FichiersGlobal.tsx` ×3 call sites) or the 2 hooks (`useResourceContent.ts`, `useResourceVersions.ts`) may be modified by this plan.
- `content` is always replaced wholesale on write — never a partial JSONB merge. This matches `setResourceContent`'s current semantics exactly (it always assigns a brand-new full value for a given `resourceId`).
- RLS policy must reuse the existing `my_studio_ids()` Postgres helper already used by every other table in this chantier — do not redefine studio-membership logic.
- `StoryboardView` (in `ResourceDetail.tsx`) is out of scope — confirmed it has no `persistKey` and never calls `resourceContentStore`.
- Resource archiving (an "archived" state for resources) is explicitly out of scope for this plan — deferred to a future chantier (see the design spec's "Deferred ideas" section).
- Baseline to compare against at the end: 185 typecheck errors, 339 lint problems (309 errors, 30 warnings) — this already includes the one accepted lint delta from the prior sub-project.

---

### Task 1: Supabase schema (manual, user runs it)

**Files:** None — this is a manual SQL step run by the user in the Supabase Dashboard's SQL Editor. No code in this repo changes.

**Interfaces:**
- Produces: the `resource_content` table and its RLS policy, which Task 2's code depends on (table name `resource_content`, columns `resource_id`, `studio_id`, `content`, `created_at`, `updated_at`).

- [ ] **Step 1: Run this SQL in the Supabase Dashboard → SQL Editor → New query**

```sql
create table resource_content (
  resource_id text primary key references resources(id) on delete cascade,
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

Note: `resource_id` is `text`, not `uuid` — `resources.id` (the referenced column) turned out to be `text` (app-generated string ids), not a real Postgres `uuid`, discovered when the first attempt with `uuid` failed with a `42804` foreign key type mismatch. This does not affect any TypeScript code in Task 2 — `resourceId` is already typed as `string` everywhere in the app.

Expected: "Success. No rows returned."

- [ ] **Step 2: Confirm the table appears in the Table Editor**

Navigate to Supabase Dashboard → Table Editor → confirm `resource_content` is listed with the 5 columns above.

---

### Task 2: `resourceContentStore.ts` full rewrite + `removeResource` wiring + `authLoader` preload

**Files:**
- Modify: `app/src/data/resourceContentStore.ts` (full rewrite)
- Modify: `app/src/data/resourceStore.ts:156-164` (`removeResource` — add one line)
- Modify: `app/src/main.tsx:41` (`authLoader` — await the new preload)

**Interfaces:**
- Consumes: `isDemoSession, onLogout` from `./authStore`; `getStudioId` from `./studioStore`; `supabase` from `./supabaseClient`; `loadPersisted, savePersisted` from `./persist` (all already used by `resourceStore.ts` in the exact same way).
- Produces: the same 4 exported functions as today, unchanged signatures, PLUS one new export `preloadResourceContent(): Promise<void>` — consumed only by `main.tsx`'s `authLoader`, not by any of the 9 screen-level consumers.

- [ ] **Step 1: Replace the full contents of `app/src/data/resourceContentStore.ts` with:**

```ts
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Store de CONTENU par ressource.
//
// Le type `Resource` (types/index.ts) ne porte que des métadonnées (titre,
// statut, …). Le contenu réel d'un éditeur — corps d'un document, commentaires
// d'une révision vidéo, items d'une checklist, etc. — est stocké ici, indexé par
// `resourceId`. Chaque éditeur connaît la forme de SON propre contenu ; le store
// reste volontairement générique (`unknown`).
//
// Demo sessions: unchanged localStorage behavior, exactly as before this
// migration. Real sessions: backed by the `resource_content` table, bulk-loaded
// into an in-memory cache (see `preloadResourceContent`) so every read stays
// synchronous — the 9 consumer screens read this store exactly once at mount,
// with no subscription, so the cache MUST already be populated by the time they
// mount (see `preloadResourceContent`'s wiring into `main.tsx`'s `authLoader`).
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sf_resource_content';

// ── Demo-session working set ─────────────────────────────────────────────────
let _demoContent: Record<string, unknown> = loadPersisted(STORAGE_KEY, {} as Record<string, unknown>);

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseContent: Record<string, unknown> = {};
let _preloadPromise: Promise<void> | null = null;

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }
function persistDemo() { savePersisted(STORAGE_KEY, _demoContent); }

interface ResourceContentRow {
  resource_id: string;
  content: unknown;
}

async function fetchSupabaseContent(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('resource_content')
    .select('resource_id, content')
    .eq('studio_id', studioId);

  if (error) { console.error('fetchSupabaseContent failed', error); return; }

  const next: Record<string, unknown> = {};
  for (const row of data as ResourceContentRow[]) next[row.resource_id] = row.content;
  _supabaseContent = next;
  notify();
}

export function preloadResourceContent(): Promise<void> {
  if (isDemoSession()) return Promise.resolve();
  if (!_preloadPromise) _preloadPromise = fetchSupabaseContent();
  return _preloadPromise;
}

export function resetResourceContentCache(): void {
  _supabaseContent = {};
  _preloadPromise = null;
}

onLogout(resetResourceContentCache);

async function setSupabaseContent(resourceId: string, content: unknown): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase
    .from('resource_content')
    .upsert({ resource_id: resourceId, studio_id: studioId, content, updated_at: new Date().toISOString() });
  if (error) console.error('setSupabaseContent failed', error);
}

async function removeSupabaseContent(resourceId: string): Promise<void> {
  const { error } = await supabase.from('resource_content').delete().eq('resource_id', resourceId);
  if (error) console.error('removeSupabaseContent failed', error);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getResourceContent<T = unknown>(resourceId: string): T | undefined {
  if (isDemoSession()) return _demoContent[resourceId] as T | undefined;
  return _supabaseContent[resourceId] as T | undefined;
}

export function setResourceContent<T = unknown>(resourceId: string, content: T): void {
  if (isDemoSession()) {
    _demoContent = { ..._demoContent, [resourceId]: content };
    persistDemo();
    notify();
    return;
  }
  _supabaseContent = { ..._supabaseContent, [resourceId]: content };
  notify();
  void setSupabaseContent(resourceId, content);
}

export function removeResourceContent(resourceId: string): void {
  if (isDemoSession()) {
    if (!(resourceId in _demoContent)) return;
    const next = { ..._demoContent };
    delete next[resourceId];
    _demoContent = next;
    persistDemo();
    notify();
    return;
  }
  if (!(resourceId in _supabaseContent)) return;
  const next = { ..._supabaseContent };
  delete next[resourceId];
  _supabaseContent = next;
  notify();
  void removeSupabaseContent(resourceId);
}

export function subscribeResourceContent(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
```

Note on the in-memory update happening synchronously before the background Supabase call in `setResourceContent`/`removeResourceContent`: this matches `resourceStore.ts`'s sibling stores in spirit (optimistic local update, fire-and-forget persistence) but is actually simpler here — unlike `resourceStore.ts`'s `addSupabaseResource`/`updateSupabaseResource`, which re-fetch the whole list after every write to stay in sync with server-computed fields (e.g. `created_at` ordering), `resource_content` has no server-computed fields consumers care about, so there is no need to re-fetch after every write — the synchronous in-memory update IS the source of truth for subsequent reads, exactly like the demo path.

- [ ] **Step 2: Wire `removeResource` to clean up its content (fixes a pre-existing dead-code bug — `removeResourceContent` is exported today but never called anywhere)**

In `app/src/data/resourceStore.ts`, add the import and one call:

Find the top of the file:
```ts
import { RESOURCES } from './mock';
import type { Resource } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
```

Replace with:
```ts
import { RESOURCES } from './mock';
import type { Resource } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { removeResourceContent } from './resourceContentStore';
```

Find `removeResource`:
```ts
export function removeResource(id: string): void {
  if (isDemoSession()) {
    _demoResources = _demoResources.filter(r => r.id !== id);
    persistDemo();
    notify();
    return;
  }
  void removeSupabaseResource(id);
}
```

Replace with:
```ts
export function removeResource(id: string): void {
  removeResourceContent(id);
  if (isDemoSession()) {
    _demoResources = _demoResources.filter(r => r.id !== id);
    persistDemo();
    notify();
    return;
  }
  void removeSupabaseResource(id);
}
```

(`removeResourceContent` is called unconditionally, before the demo/real branch, since it already branches on session type internally — this cleans up the content for both session types. For real sessions this is a secondary safety net alongside the `on delete cascade` FK from Task 1; for demo sessions it's the *only* mechanism, since `localStorage` has no cascade.)

- [ ] **Step 3: Await the new preload from the app's top-level `authLoader`**

In `app/src/main.tsx`, find:
```ts
import { isAuthenticated } from './data/authStore';
```

Replace with:
```ts
import { isAuthenticated } from './data/authStore';
import { preloadResourceContent } from './data/resourceContentStore';
```

Find:
```ts
const authLoader = async () => { if (!(await isAuthenticated())) return redirect('/login'); return null; };
```

Replace with:
```ts
const authLoader = async () => {
  if (!(await isAuthenticated())) return redirect('/login');
  await preloadResourceContent();
  return null;
};
```

This loader is attached to the `/` route (line 66, wrapping `<AppShell />` and all its children, including every resource-detail route). React Router re-runs this loader on every navigation within that subtree, but `preloadResourceContent()` only does real work once per session (the `_preloadPromise` memoization makes every call after the first resolve instantly), so this adds no perceptible latency beyond the very first authenticated page load.

- [ ] **Step 4: Run typecheck to confirm no consumer breaks**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "^src/"`
Expected: 185 (the confirmed baseline — this task must not introduce new errors)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/resourceContentStore.ts app/src/data/resourceStore.ts app/src/main.tsx
git commit -m "feat: resourceContentStore.ts real Supabase-backed content persistence"
```

---

### Task 3: End-to-end manual verification

**Files:** None — manual browser verification, no code changes expected unless a bug is found.

**Interfaces:**
- Consumes: everything built in Tasks 1-2.

- [ ] **Step 1: Demo-session regression check**

Log in as a demo account (Léa, Sarah, or Thomas). Open each of the 9 editor surfaces and confirm content persists across a page reload exactly as before this migration:
- `DocumentReview` (a document resource)
- `VideoReview` (a video resource)
- `ImageReview` (an image resource)
- Inside `ResourceDetail.tsx`: Checklist, Mindmap (Moodboard), Form, Inspirations, Screenplay/Script (with version switching) resources
No console errors on any of them.

- [ ] **Step 2: Real-session content round-trip, per editor type**

Log in as (or sign up) a real account. For at least 3 different editor types (e.g. a document, a checklist, and the versioned script editor):
- Create/edit content.
- Reload the page.
- Confirm the content reloads correctly (not empty, not stale) — this specifically exercises the `preloadResourceContent`/`authLoader` wiring from Task 2 Step 3, since a hard reload is the scenario where the race this plan closes would otherwise bite.
- For the versioned script editor specifically: create a second version, switch between versions, reload, confirm both versions and the active selection persist.

- [ ] **Step 3: Deletion cascade check**

Delete a resource that has content (e.g. the document from Step 2). Confirm:
- In the Supabase Table Editor, the corresponding row in `resource_content` is gone (via the `on delete cascade` FK).
- Re-creating a new resource and briefly checking `_supabaseContent` state indirectly (e.g. via the browser console: `(await import('/src/data/resourceContentStore.ts')).getResourceContent('<deleted-id>')` should return `undefined`) confirms the in-memory cache doesn't retain the stale entry either (the explicit `removeResourceContent` call from Task 2 Step 2 handles this synchronously, ahead of the DB round-trip).

- [ ] **Step 4: Cross-studio access denial check**

Using the browser console on a real, authenticated session, attempt to read another studio's resource content directly via Supabase (bypassing the app's own cache): `await supabase.from('resource_content').select('*').eq('resource_id', '<a resource_id belonging to a different studio>')` — confirm the RLS policy returns zero rows rather than leaking another studio's content.

- [ ] **Step 5: Final typecheck/lint diff against baseline**

Run:
```bash
cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "^src/"
npm run lint 2>&1 | tail -3
```
Expected: typecheck error count is 185, lint reports 339 problems (309 errors, 30 warnings) or fewer.

- [ ] **Step 6: Record final verification results in the progress ledger**
