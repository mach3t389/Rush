# Form Instances Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `formStore.ts` (submitted form responses, not the form templates themselves) from a single global `localStorage` list to a studio-scoped Supabase table, fixing a pre-existing bug where the store had no studio scoping at all.

**Architecture:** Same dual demo/real-session pattern proven across every prior Phase 2 chantier, matching `resourceStore.ts`'s exact shape (bulk-fetch-into-in-memory-cache, refetch-after-every-write for consistency).

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + `supabase-js`), existing `authStore.ts`/`studioStore.ts` session/studio resolution helpers.

## Global Constraints

- Demo-session behavior in `formStore.ts` must stay byte-for-byte identical to today: same `localStorage` key (`sf_form_instances`), same array shape, fully synchronous.
- All 5 existing exported functions keep their exact signatures: `getFormInstances(): FormInstance[]`, `getFormInstance(id: string): FormInstance | undefined`, `createFormInstance(instance: FormInstance): void`, `updateFormInstance(id: string, responses: FormResponse[], status: 'draft' | 'completed'): void`, `deleteFormInstance(id: string): void`, `subscribeFormStore(fn: () => void): () => void`. `Modeles.tsx` (the single consumer) needs zero changes.
- `id` is `text`, not `uuid` — every entity id in this codebase is client-generated, matching the established pattern from `resources.id`/`clients.id`/`client_contacts.id` in prior chantiers. Do not default the column to `gen_random_uuid()`.
- The `GRANT ... TO authenticated` statement must be included in Task 1's SQL text itself — this project has missed this step before (see the `supabase-rls-needs-grant` lesson) and it must not happen a third time.
- RLS reuses the existing `my_studio_ids()` helper.
- `templates.ts`, `templateFavoritesStore.ts`, and `financeStore.ts` are out of scope — do not touch them.
- Baseline to compare against at the end: 185 typecheck errors, 339 lint problems (309 errors, 30 warnings).

---

### Task 1: Supabase schema (manual, user runs it)

**Files:** None — manual SQL step run by the user in the Supabase Dashboard's SQL Editor.

**Interfaces:**
- Produces: the `form_instances` table, consumed by Task 2's code (columns: `id`, `studio_id`, `template_id`, `template_name`, `template_color`, `linked_project_id`, `linked_project_name`, `linked_client_id`, `linked_client_name`, `responses`, `status`, `created_at`, `updated_at`).

- [ ] **Step 1: Run this SQL in the Supabase Dashboard → SQL Editor → New query**

```sql
create table form_instances (
  id text primary key,
  studio_id uuid not null references studios(id),
  template_id text not null,
  template_name text not null,
  template_color text not null,
  linked_project_id text,
  linked_project_name text,
  linked_client_id text,
  linked_client_name text,
  responses jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table form_instances enable row level security;

create policy "studio members can manage their form instances"
  on form_instances for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on form_instances to authenticated;
```

Expected: "Success. No rows returned."

- [ ] **Step 2: Verify in the Table Editor**

Confirm `form_instances` appears as a new table with the 13 columns above.

---

### Task 2: `formStore.ts` full rewrite

**Files:**
- Modify: `app/src/data/formStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `isDemoSession, onLogout` from `./authStore`; `getStudioId` from `./studioStore`; `supabase` from `./supabaseClient`; `type FormInstance, FormResponse` from `./templates` (unchanged, read-only import).
- Produces: same 6 exported functions as today, unchanged signatures.

- [ ] **Step 1: Replace the full contents of `app/src/data/formStore.ts` with:**

```ts
import type { FormInstance, FormResponse } from './templates';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Store des INSTANCES de formulaire (réponses réellement soumises), à ne pas
// confondre avec les modèles de formulaire eux-mêmes (templates.ts, hors scope).
//
// Demo sessions: unchanged localStorage behavior, exactly as before this
// migration. Real sessions: backed by the `form_instances` table, bulk-loaded
// into an in-memory cache (same pattern as resourceStore.ts) so every read
// stays synchronous.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sf_form_instances';

// ── Demo-session working set ─────────────────────────────────────────────────
function loadFromStorage(): FormInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
let _demoInstances: FormInstance[] = loadFromStorage();
function persistDemo(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(_demoInstances)); }

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseInstances: FormInstance[] = [];
let _supabaseFetchStarted = false;

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }

interface FormInstanceRow {
  id: string;
  template_id: string;
  template_name: string;
  template_color: string;
  linked_project_id: string | null;
  linked_project_name: string | null;
  linked_client_id: string | null;
  linked_client_name: string | null;
  responses: FormResponse[];
  status: string;
  created_at: string;
  updated_at: string;
}

function toInstance(row: FormInstanceRow): FormInstance {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    templateColor: row.template_color,
    linkedProjectId: row.linked_project_id ?? undefined,
    linkedProjectName: row.linked_project_name ?? undefined,
    linkedClientId: row.linked_client_id ?? undefined,
    linkedClientName: row.linked_client_name ?? undefined,
    responses: row.responses,
    status: row.status as FormInstance['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(instance: FormInstance, studioId: string): FormInstanceRow & { studio_id: string } {
  return {
    id: instance.id,
    studio_id: studioId,
    template_id: instance.templateId,
    template_name: instance.templateName,
    template_color: instance.templateColor,
    linked_project_id: instance.linkedProjectId ?? null,
    linked_project_name: instance.linkedProjectName ?? null,
    linked_client_id: instance.linkedClientId ?? null,
    linked_client_name: instance.linkedClientName ?? null,
    responses: instance.responses,
    status: instance.status,
    created_at: instance.createdAt,
    updated_at: instance.updatedAt,
  };
}

async function fetchSupabaseInstances(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('form_instances')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false });

    if (error) { console.error('fetchSupabaseInstances failed', error); return; }

    _supabaseInstances = (data as FormInstanceRow[]).map(toInstance);
    notify();
  } catch (err) {
    console.error('fetchSupabaseInstances failed', err);
  }
}

function ensureFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseInstances();
}

export function resetFormInstancesCache(): void {
  _supabaseInstances = [];
  _supabaseFetchStarted = false;
}

onLogout(resetFormInstancesCache);

async function createSupabaseInstance(instance: FormInstance): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('form_instances').insert(toRow(instance, studioId));
  if (error) { console.error('createSupabaseInstance failed', error); return; }
  await fetchSupabaseInstances();
}

async function updateSupabaseInstance(id: string, responses: FormResponse[], status: 'draft' | 'completed'): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from('form_instances').update({ responses, status, updated_at: updatedAt }).eq('id', id);
  if (error) { console.error('updateSupabaseInstance failed', error); return; }
  await fetchSupabaseInstances();
}

async function deleteSupabaseInstance(id: string): Promise<void> {
  const { error } = await supabase.from('form_instances').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseInstance failed', error); return; }
  await fetchSupabaseInstances();
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getFormInstances(): FormInstance[] {
  if (isDemoSession()) return _demoInstances;
  ensureFetchStarted();
  return _supabaseInstances;
}

export function getFormInstance(id: string): FormInstance | undefined {
  return getFormInstances().find(i => i.id === id);
}

export function createFormInstance(instance: FormInstance): void {
  if (isDemoSession()) {
    _demoInstances = [instance, ..._demoInstances];
    persistDemo();
    notify();
    return;
  }
  _supabaseInstances = [instance, ..._supabaseInstances];
  notify();
  void createSupabaseInstance(instance);
}

export function updateFormInstance(id: string, responses: FormResponse[], status: 'draft' | 'completed'): void {
  if (isDemoSession()) {
    _demoInstances = _demoInstances.map(i =>
      i.id === id ? { ...i, responses, status, updatedAt: new Date().toISOString() } : i
    );
    persistDemo();
    notify();
    return;
  }
  _supabaseInstances = _supabaseInstances.map(i =>
    i.id === id ? { ...i, responses, status, updatedAt: new Date().toISOString() } : i
  );
  notify();
  void updateSupabaseInstance(id, responses, status);
}

export function deleteFormInstance(id: string): void {
  if (isDemoSession()) {
    _demoInstances = _demoInstances.filter(i => i.id !== id);
    persistDemo();
    notify();
    return;
  }
  _supabaseInstances = _supabaseInstances.filter(i => i.id !== id);
  notify();
  void deleteSupabaseInstance(id);
}

export function subscribeFormStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
```

Note on `getFormInstance`: the original implementation searched `_instances` directly; this rewrite routes it through the public `getFormInstances()` so it correctly branches on demo/real session and triggers the lazy fetch on first access in a real session, exactly like every other read path in this file.

- [ ] **Step 2: Run typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "^src/"`
Expected: 185 (baseline — `Modeles.tsx` needs no changes since signatures are unchanged)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/formStore.ts
git commit -m "feat: form_instances real per-studio Supabase persistence"
```

---

### Task 3: End-to-end manual verification

**Files:** None — manual browser verification, no code changes expected unless a bug is found.

**Interfaces:**
- Consumes: everything built in Tasks 1-2.

- [ ] **Step 1: Demo-session regression check**

Log in as a demo account. In the Modèles screen, create a new form instance from a form template, fill in some responses, save as draft, reload, confirm it persists. Mark it completed, reload, confirm the status persists. Delete it, confirm it's gone. No console errors.

- [ ] **Step 2: Real-session round-trip**

Log in as (or sign up) a real account. Create a form instance, fill in responses (test at least one string field and one number field, matching `FormFieldValue`'s union type), save as draft. Reload — confirm the instance and its responses persist. Mark it completed, reload, confirm the status change persists.

- [ ] **Step 3: Studio-scoping bug fix confirmed**

Sign up a second real account (a different studio). Confirm it does NOT see the first studio's form instances (proves the scoping bug is fixed — before this migration, both would have shared the same global localStorage key).

- [ ] **Step 4: Cross-studio RLS isolation**

Using the browser console on an authenticated real session, run `await supabase.from('form_instances').select('*')` with no filter — confirm it returns only this studio's own instances, never another studio's.

- [ ] **Step 5: Final typecheck/lint diff against baseline**

Run:
```bash
cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "^src/"
npm run lint 2>&1 | tail -3
```
Expected: typecheck error count is 185 and lint reports 339 problems (309 errors, 30 warnings) or fewer.

- [ ] **Step 6: Record final verification results in the progress ledger**
