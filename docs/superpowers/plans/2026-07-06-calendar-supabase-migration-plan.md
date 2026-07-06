# Calendar Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `eventStore.ts` and `eventTypeStore.ts` from localStorage/mock to real Supabase persistence for real (non-demo) studios, and fix the calendar participant picker to source real team members instead of the hardcoded demo `USERS` list.

**Architecture:** Both stores get the exact dual demo/real rewrite already shipped for `clientStore.ts` — `isDemoSession()` branching, a synchronous in-memory cache backed by a background Supabase fetch, and `onLogout` cache-reset registration. Two flat `studio_id`-scoped tables (`events`, `event_types`) reuse the RLS helper (`my_studio_ids()`) and grant pattern already created during the Team Invitations chantier. No new architectural pattern is introduced.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS), existing `data/authStore.ts` / `data/studioStore.ts` / `data/teamStore.ts` (unmodified, reused as-is).

## Global Constraints

- Demo sessions (`isDemoSession() === true`) behave byte-for-byte unchanged — same seed data, same localStorage keys (`sf_calendar_events`, `sf_event_types`), same synchronous return shape.
- Every store function that touches Supabase must check `isDemoSession()` first, exactly like `clientStore.ts`.
- `getEvents()` and `getEventTypes()` must stay fully synchronous for both demo and real sessions — no call site anywhere in the app may become async.
- `onLogout(resetXCache)` must be registered at module scope in both new store files, from the moment the file is written (the very first Projects chantier missed this and needed a follow-up fix — do not repeat that).
- No write-queue is needed: every write in this chantier is a single-row insert/update/delete against `events` or `event_types`, never a delete-then-recreate batch like `taskStore.ts`'s `setSections`.
- Do not modify `data/studioStore.ts`, `data/teamStore.ts`, or `data/authStore.ts` — only call their existing exports (`getStudioId()`, `getTeamMembers()`, `isDemoSession()`, `getCurrentUser()`, `onLogout()`).
- Client-generated ids follow the existing conventions verbatim: `ev_${Date.now()}` for events (already used by the demo path), `et_${Date.now()}` for event types (already used by the demo path) — reuse the exact same id generation for the real path so ids look identical regardless of session type.

---

### Task 1: Supabase schema (manual — user runs it)

**Files:**
- None (SQL run directly in the Supabase SQL editor by the user; not a code change)

**Interfaces:**
- Produces: `events` table, `event_types` table, RLS policies and grants that Task 2 and Task 3's Supabase calls depend on. Both tables use the `my_studio_ids()` helper function already created during the Team Invitations chantier (`docs/superpowers/plans/2026-07-05-team-invitations-plan.md` Task 1) — do not redefine it.

- [ ] **Step 1: Hand the user this SQL to run in the Supabase SQL editor**

```sql
create table if not exists events (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  title text not null,
  event_type_id text not null,
  project_id text,
  start text not null,
  "end" text not null,
  all_day boolean,
  description text,
  location text,
  meeting_url text,
  member_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table events enable row level security;

create policy "events_select_own_studio" on events for select
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "events_insert_own_studio" on events for insert
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "events_update_own_studio" on events for update
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()))
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "events_delete_own_studio" on events for delete
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, update, delete on events to authenticated;

create table if not exists event_types (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  label text not null,
  color text not null,
  icon text not null,
  built_in boolean,
  created_at timestamptz not null default now()
);
alter table event_types enable row level security;

create policy "event_types_select_own_studio" on event_types for select
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "event_types_insert_own_studio" on event_types for insert
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "event_types_update_own_studio" on event_types for update
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()))
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "event_types_delete_own_studio" on event_types for delete
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, update, delete on event_types to authenticated;
```

- [ ] **Step 2: Confirm with the user that both tables now appear in the Supabase Table Editor, and that running the SQL produced no errors**

- [ ] **Step 3: Record in the progress ledger that Task 1 is done, quoting the user's confirmation**

---

### Task 2: `eventStore.ts` dual demo/real rewrite

**Files:**
- Modify: `app/src/data/eventStore.ts` (full rewrite, same public API)

**Interfaces:**
- Consumes: `isDemoSession, onLogout` from `../data/authStore`; `getStudioId` from `../data/studioStore`; `supabase` from `../data/supabaseClient` — none of these files are modified by this task.
- Produces (unchanged from the current file, callers require zero changes): `CalendarEvent` interface, `getEvents(): CalendarEvent[]`, `addEvent(ev: Omit<CalendarEvent, 'id'>): CalendarEvent`, `updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): void`, `deleteEvent(id: string): void`, `subscribeEvents(fn: () => void): () => void`. Additionally exports `resetEventsCache(): void` (new, for `onLogout` registration — not consumed by any UI code, just needed so the registration exists).

- [ ] **Step 1: Replace the full contents of `app/src/data/eventStore.ts` with:**

```ts
// Reactive calendar-events store.
//
// Demo sessions (isDemoSession() === true): unchanged localStorage-backed
// behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio (see
// studioStore.ts). getEvents() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern clientStore.ts uses.

import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

export interface CalendarEvent {
  id: string;
  title: string;
  eventTypeId: string;
  projectId?: string;
  start: string; // ISO string
  end: string;   // ISO string
  allDay?: boolean;
  description?: string;
  location?: string;
  meetingUrl?: string;
  memberIds?: string[];
}

const STORAGE_KEY = 'sf_calendar_events';

const INITIAL_EVENTS: CalendarEvent[] = [
  { id:'ev1',  title:'Réunion équipe — Campagne Été',     eventTypeId:'reunion',   projectId:'pj1', start:'2026-06-10T10:00', end:'2026-06-10T11:30', memberIds:['lea','sarah','thomas'] },
  { id:'ev2',  title:'Appel client Nova Films',            eventTypeId:'reunion',   projectId:'pj1', start:'2026-06-12T14:00', end:'2026-06-12T15:00', memberIds:['lea','thomas'] },
  { id:'ev3',  title:'Tournage J1 — Collection Été',       eventTypeId:'tournage',  projectId:'pj1', start:'2026-06-15T09:00', end:'2026-06-15T18:00', location:'Loft Paris 10e', memberIds:['lea','sarah','thomas','julie'] },
  { id:'ev4',  title:'Tournage J2 — Portraits',            eventTypeId:'tournage',  projectId:'pj1', start:'2026-06-16T08:00', end:'2026-06-16T17:00', location:'Studio Bastille', memberIds:['lea','sarah','thomas','julie','marc'] },
  { id:'ev5',  title:'Livraison draft vidéo — Bâtisseurs', eventTypeId:'livraison', projectId:'pj2', start:'2026-06-18T10:00', end:'2026-06-18T11:00', memberIds:['julie','marc'] },
  { id:'ev6',  title:'Présentation client',                eventTypeId:'reunion',   projectId:'pj3', start:'2026-06-20T14:00', end:'2026-06-20T16:00', memberIds:['lea','sarah'] },
  { id:'ev7',  title:'Réunion post-production',            eventTypeId:'reunion',   projectId:'pj2', start:'2026-06-22T11:00', end:'2026-06-22T12:30', memberIds:['julie','marc','lea'] },
  { id:'ev8',  title:'Shooting Clip Horizon',              eventTypeId:'tournage',  projectId:'pj4', start:'2026-06-24T08:00', end:'2026-06-24T16:00', location:'Rooftop 11e',   memberIds:['marc','sarah','lea'] },
  { id:'ev9',  title:'Kick-off nouveau projet',            eventTypeId:'reunion',   projectId:'pj4', start:'2026-06-25T11:00', end:'2026-06-25T12:00', memberIds:['lea','marc'] },
  { id:'ev10', title:'Deadline montage final',             eventTypeId:'deadline',  projectId:'pj1', start:'2026-06-28', end:'2026-06-28', allDay:true, memberIds:['julie'] },
  { id:'ev11', title:'Revue budget Q3',                    eventTypeId:'reunion',   projectId:'pj1', start:'2026-06-11T09:00', end:'2026-06-11T09:45', memberIds:['lea','thomas'] },
  { id:'ev12', title:'Session montage v2',                 eventTypeId:'montage',   projectId:'pj2', start:'2026-06-13T13:00', end:'2026-06-13T17:00', memberIds:['julie'] },
];

type Listener = () => void;
const listeners: Listener[] = [];

function notify() { listeners.forEach(l => l()); }

export function subscribeEvents(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

// ── Demo (localStorage) path ────────────────────────────────────────────────

function getDemoEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CalendarEvent[];
  } catch { /* noop */ }
  return INITIAL_EVENTS;
}

function saveDemoEvents(events: CalendarEvent[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* noop */ }
}

// ── Real (Supabase-backed) session state ────────────────────────────────────

let _supabaseEvents: CalendarEvent[] = [];
let _supabaseFetchStarted = false;

interface EventRow {
  id: string;
  studio_id: string;
  title: string;
  event_type_id: string;
  project_id: string | null;
  start: string;
  end: string;
  all_day: boolean | null;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  member_ids: string[];
}

function toEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    eventTypeId: row.event_type_id,
    projectId: row.project_id ?? undefined,
    start: row.start,
    end: row.end,
    allDay: row.all_day ?? undefined,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    meetingUrl: row.meeting_url ?? undefined,
    memberIds: row.member_ids ?? undefined,
  };
}

function toRow(e: CalendarEvent, studioId: string): Omit<EventRow, 'end'> & { end: string } {
  return {
    id: e.id,
    studio_id: studioId,
    title: e.title,
    event_type_id: e.eventTypeId,
    project_id: e.projectId ?? null,
    start: e.start,
    end: e.end,
    all_day: e.allDay ?? null,
    description: e.description ?? null,
    location: e.location ?? null,
    meeting_url: e.meetingUrl ?? null,
    member_ids: e.memberIds ?? [],
  };
}

async function fetchSupabaseEvents(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchSupabaseEvents failed', error); return; }

  _supabaseEvents = (data as EventRow[]).map(toEvent);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseEvents();
}

export function resetEventsCache(): void {
  _supabaseEvents = [];
  _supabaseFetchStarted = false;
}

onLogout(resetEventsCache);

async function addSupabaseEvent(ev: CalendarEvent): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('events').insert(toRow(ev, studioId));
  if (error) { console.error('addSupabaseEvent failed', error); return; }
  await fetchSupabaseEvents();
}

async function updateSupabaseEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseEvents.find(e => e.id === id);
  if (!current) { console.error('updateSupabaseEvent: event not found in cache', id); return; }
  const merged = { ...current, ...patch };
  const { error } = await supabase.from('events').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseEvent failed', error); return; }
  await fetchSupabaseEvents();
}

async function deleteSupabaseEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseEvent failed', error); return; }
  await fetchSupabaseEvents();
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getEvents(): CalendarEvent[] {
  if (isDemoSession()) return getDemoEvents();
  ensureSupabaseFetchStarted();
  return _supabaseEvents;
}

export function addEvent(ev: Omit<CalendarEvent, 'id'>): CalendarEvent {
  const newEv: CalendarEvent = { ...ev, id: `ev_${Date.now()}` };
  if (isDemoSession()) {
    saveDemoEvents([...getDemoEvents(), newEv]);
    notify();
    return newEv;
  }
  void addSupabaseEvent(newEv);
  return newEv;
}

export function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) {
  if (isDemoSession()) {
    saveDemoEvents(getDemoEvents().map(e => e.id === id ? { ...e, ...patch } : e));
    notify();
    return;
  }
  void updateSupabaseEvent(id, patch);
}

export function deleteEvent(id: string) {
  if (isDemoSession()) {
    saveDemoEvents(getDemoEvents().filter(e => e.id !== id));
    notify();
    return;
  }
  void deleteSupabaseEvent(id);
}
```

- [ ] **Step 2: Run the app's typecheck to confirm no consumer breaks**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors introduced by this file (the pre-existing baseline is 185 errors elsewhere in the repo — none of them in `eventStore.ts`)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/eventStore.ts
git commit -m "feat: eventStore.ts dual demo/real Supabase path"
```

---

### Task 3: `eventTypeStore.ts` dual demo/real rewrite

**Files:**
- Modify: `app/src/data/eventTypeStore.ts` (full rewrite, same public API)
- Modify: `app/src/data/studioStore.ts:72-84` (the "brand-new user" branch of `getStudioId()`) — seed the 6 built-in event types for every newly-created real studio

**Interfaces:**
- Consumes: `isDemoSession, onLogout` from `../data/authStore`; `supabase` from `../data/supabaseClient` — `getStudioId` is NOT needed inside `eventTypeStore.ts` itself for reads/writes triggered by the UI (those receive the studio id the same way `eventStore.ts` does, via its own `getStudioId()` call), but Task 3 also needs a plain, synchronous, exported seeding helper that `studioStore.ts`'s own code can call directly.
- Produces (unchanged from the current file, callers require zero changes): `EventType` interface, `getEventTypes(): EventType[]`, `addEventType(type: Omit<EventType, 'id'>): EventType`, `updateEventType(id: string, patch: Partial<Omit<EventType, 'id' | 'builtIn'>>): void`, `deleteEventType(id: string): void`, `getEventTypeById(id: string): EventType | undefined`, `subscribeEventTypes(fn: () => void): () => void`. Additionally exports `resetEventTypesCache(): void` and `seedBuiltInEventTypes(studioId: string): Promise<void>` (new — the second is consumed by Task 3's own edit to `studioStore.ts`).

- [ ] **Step 1: Replace the full contents of `app/src/data/eventTypeStore.ts` with:**

```ts
// Reactive event-type taxonomy store.
//
// Demo sessions (isDemoSession() === true): unchanged localStorage-backed
// behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio. Every new
// real studio gets the 6 built-in types seeded once (see
// seedBuiltInEventTypes, called from studioStore.ts's brand-new-studio
// branch). getEventTypes() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern clientStore.ts uses.

import { isDemoSession, onLogout } from './authStore';
import { supabase } from './supabaseClient';

export interface EventType {
  id: string;
  label: string;
  color: string;
  icon: string;
  builtIn?: boolean; // built-in types can't be deleted
}

const STORAGE_KEY = 'sf_event_types';

const DEFAULT_TYPES: EventType[] = [
  { id: 'tournage',  label: 'Tournage',   color: '#e85b7a', icon: 'video',          builtIn: true },
  { id: 'livraison', label: 'Livraison',  color: '#f5975b', icon: 'package',        builtIn: true },
  { id: 'reunion',   label: 'Réunion',    color: '#5b8af5', icon: 'users',          builtIn: true },
  { id: 'deadline',  label: 'Échéance',   color: '#c45be8', icon: 'alert-circle',   builtIn: true },
  { id: 'montage',   label: 'Montage',    color: '#34c98a', icon: 'scissors',       builtIn: true },
  { id: 'autre',     label: 'Autre',      color: '#888',    icon: 'circle',         builtIn: true },
];

type Listener = () => void;
const listeners: Listener[] = [];

function notify() { listeners.forEach(l => l()); }

export function subscribeEventTypes(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

// ── Demo (localStorage) path ────────────────────────────────────────────────

function getDemoEventTypes(): EventType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EventType[];
  } catch { /* noop */ }
  return DEFAULT_TYPES;
}

function saveDemoEventTypes(types: EventType[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(types)); } catch { /* noop */ }
}

// ── Real (Supabase-backed) session state ────────────────────────────────────

let _supabaseTypes: EventType[] = [];
let _supabaseFetchStarted = false;

interface EventTypeRow {
  id: string;
  studio_id: string;
  label: string;
  color: string;
  icon: string;
  built_in: boolean | null;
}

function toEventType(row: EventTypeRow): EventType {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    icon: row.icon,
    builtIn: row.built_in ?? undefined,
  };
}

async function fetchSupabaseEventTypes(studioId: string): Promise<void> {
  const { data, error } = await supabase
    .from('event_types')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchSupabaseEventTypes failed', error); return; }

  _supabaseTypes = (data as EventTypeRow[]).map(toEventType);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await fetchSupabaseEventTypes(studioId);
  })();
}

export function resetEventTypesCache(): void {
  _supabaseTypes = [];
  _supabaseFetchStarted = false;
}

onLogout(resetEventTypesCache);

/**
 * Inserts the 6 built-in event types for a newly-created real studio.
 * Called once from studioStore.ts's getStudioId() brand-new-studio branch —
 * never called for demo sessions or for studios that already have types.
 */
export async function seedBuiltInEventTypes(studioId: string): Promise<void> {
  const rows: EventTypeRow[] = DEFAULT_TYPES.map(t => ({
    id: t.id,
    studio_id: studioId,
    label: t.label,
    color: t.color,
    icon: t.icon,
    built_in: t.builtIn ?? null,
  }));
  const { error } = await supabase.from('event_types').insert(rows);
  if (error) console.error('seedBuiltInEventTypes failed', error);
}

async function addSupabaseEventType(type: EventType, studioId: string): Promise<void> {
  const { error } = await supabase.from('event_types').insert({
    id: type.id,
    studio_id: studioId,
    label: type.label,
    color: type.color,
    icon: type.icon,
    built_in: type.builtIn ?? null,
  });
  if (error) { console.error('addSupabaseEventType failed', error); return; }
  await fetchSupabaseEventTypes(studioId);
}

async function updateSupabaseEventType(id: string, patch: Partial<Omit<EventType, 'id' | 'builtIn'>>, studioId: string): Promise<void> {
  const { error } = await supabase.from('event_types').update(patch).eq('id', id);
  if (error) { console.error('updateSupabaseEventType failed', error); return; }
  await fetchSupabaseEventTypes(studioId);
}

async function deleteSupabaseEventType(id: string, studioId: string): Promise<void> {
  const { error } = await supabase.from('event_types').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseEventType failed', error); return; }
  await fetchSupabaseEventTypes(studioId);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getEventTypes(): EventType[] {
  if (isDemoSession()) return getDemoEventTypes();
  ensureSupabaseFetchStarted();
  return _supabaseTypes;
}

export function addEventType(type: Omit<EventType, 'id'>): EventType {
  const newType: EventType = { ...type, id: `et_${Date.now()}` };
  if (isDemoSession()) {
    saveDemoEventTypes([...getDemoEventTypes(), newType]);
    notify();
    return newType;
  }
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await addSupabaseEventType(newType, studioId);
  })();
  return newType;
}

export function updateEventType(id: string, patch: Partial<Omit<EventType, 'id' | 'builtIn'>>) {
  if (isDemoSession()) {
    saveDemoEventTypes(getDemoEventTypes().map(t => t.id === id ? { ...t, ...patch } : t));
    notify();
    return;
  }
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await updateSupabaseEventType(id, patch, studioId);
  })();
}

export function deleteEventType(id: string) {
  if (isDemoSession()) {
    saveDemoEventTypes(getDemoEventTypes().filter(t => t.id !== id || t.builtIn));
    notify();
    return;
  }
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await deleteSupabaseEventType(id, studioId);
  })();
}

export function getEventTypeById(id: string): EventType | undefined {
  return getEventTypes().find(t => t.id === id);
}
```

Note on the dynamic `import('./studioStore')` calls: `studioStore.ts`'s brand-new-studio branch (edited in Step 3 below) calls `seedBuiltInEventTypes`, which lives in this file — a static top-level `import { getStudioId } from './studioStore'` here would create a circular import between the two files. The dynamic `import()` inside each async function body breaks that cycle safely (both modules are already loaded by the time either function runs, since `getStudioId()` itself has already been called once by whatever screen triggered this code path).

- [ ] **Step 2: Edit `app/src/data/studioStore.ts` — add the built-in event type seeding call**

Read the current brand-new-studio branch first:

```bash
grep -n "Brand-new user" -A 12 "D:/Vibe Coding/Rush/app/src/data/studioStore.ts"
```

Expected output shows this block (lines 72-84 in the file as of the Team Invitations chantier):

```ts
  // 3. Brand-new user: create the studio and its owner membership row together.
  const studioName = (user.user_metadata?.studio_name as string) || 'Mon studio';
  const { data: created, error: insertError } = await supabase
    .from('studios')
    .insert({ owner_user_id: user.id, name: studioName })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await insertOwnerMembership(created.id, user);
  cachedStudioId = created.id;
  return created.id;
}
```

Replace the `await insertOwnerMembership(created.id, user);` line with:

```ts
  await insertOwnerMembership(created.id, user);
  const { seedBuiltInEventTypes } = await import('./eventTypeStore');
  await seedBuiltInEventTypes(created.id);
```

(Same dynamic-import reasoning as Step 1 — `eventTypeStore.ts` cannot be statically imported at the top of `studioStore.ts` without creating the same circular dependency in reverse.)

- [ ] **Step 3: Run the app's typecheck to confirm no consumer breaks**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors introduced by either file

- [ ] **Step 4: Commit**

```bash
git add app/src/data/eventTypeStore.ts app/src/data/studioStore.ts
git commit -m "feat: eventTypeStore.ts dual demo/real Supabase path, seed built-in types for new studios"
```

---

### Task 4: Participant picker real-team fix

**Files:**
- Modify: `app/src/screens/CalendrierGlobal.tsx` (2 call sites: `CreateEventModal`, `EventDetail`)
- Modify: `app/src/screens/ProjetCalendrier.tsx` (2 call sites: `CreateEventModal`, `EventDetail`)

**Interfaces:**
- Consumes: `getTeamMembers` from `../data/teamStore` (already shipped, unmodified); `isDemoSession, getCurrentUser` from `../data/authStore` (already shipped, unmodified); `User` type from `../types`.
- Produces: nothing new consumed by later tasks — this is a leaf UI fix.

- [ ] **Step 1: In `app/src/screens/CalendrierGlobal.tsx`, add the imports**

Change line 5 from:
```ts
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';
```
to:
```ts
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';
import type { User } from '../types';
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getTeamMembers } from '../data/teamStore';
```

- [ ] **Step 2: In `app/src/screens/CalendrierGlobal.tsx`, add a local `getTeam()` helper near the top of the file (after the imports, before the first component)**

```ts
function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS).filter(u => u.role !== 'Cliente');
  const members = getTeamMembers();
  if (members.length > 0) return members;
  const self = getCurrentUser();
  if (self) return [{ id: self.id, name: self.name, initials: self.initials, avatarColor: self.avatarColor, role: self.role }];
  return [USERS.lea];
}
```

- [ ] **Step 3: In `app/src/screens/CalendrierGlobal.tsx`'s `CreateEventModal`, replace the default participant and the team lookup**

Change (around line 259):
```ts
  const [participants, setParticipants] = useState<string[]>(['lea']);
```
to:
```ts
  const [participants, setParticipants] = useState<string[]>(() => {
    if (isDemoSession()) return ['lea'];
    const self = getCurrentUser();
    return self ? [self.id] : ['lea'];
  });
```

Change (around line 350):
```ts
          const team = Object.values(USERS).filter(u=>u.role!=='Cliente');
```
to:
```ts
          const team = getTeam();
```

- [ ] **Step 4: In `app/src/screens/CalendrierGlobal.tsx`'s `EventDetail`, replace the team lookup**

Change (around line 533):
```ts
          const team=Object.values(USERS).filter(u=>u.role!=='Cliente');
```
to:
```ts
          const team = getTeam();
```

(`EventDetail`'s `participants` state already initializes from `ev.participantIds ?? []` — no default-value change needed there, since it's editing an existing event's real attendee list.)

- [ ] **Step 5: Repeat Steps 1-4 for `app/src/screens/ProjetCalendrier.tsx`**

Same import addition after its existing `import { PROJECTS, MY_TASKS, USERS } from '../data/mock';` line (line 6), the same local `getTeam()` helper, the same default-participant fix in `CreateEventModal` (around line 71: `const [participants, setParticipants] = useState<string[]>(['lea']);`), the same team-lookup replacement in `CreateEventModal` (around line 232: `const team = Object.values(USERS).filter(u=>u.role!=='Cliente');`), and the same team-lookup replacement in `EventDetail` (find the equivalent line via `grep -n "Object.values(USERS)" app/src/screens/ProjetCalendrier.tsx` — it appears twice, once per modal, both replaced with `getTeam()`).

- [ ] **Step 6: Run typecheck and lint**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: no new errors/warnings introduced in either file (check for unused imports — `USERS` is still used elsewhere in both files for the demo branch inside `getTeam()`, so its import must NOT be removed)

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/CalendrierGlobal.tsx app/src/screens/ProjetCalendrier.tsx
git commit -m "fix: calendar participant picker sources the real studio team"
```

---

### Task 5: End-to-end manual verification

**Files:**
- None (manual browser verification, no code changes expected unless a bug is found)

**Interfaces:**
- Consumes: everything built in Tasks 1-4.

- [ ] **Step 1: Demo-session regression check**

Log in as a demo account (Léa). Open both `/calendrier` (global) and a project's `/projets/:id/calendrier`. Confirm:
- Existing seed events still render with correct titles/dates/colors.
- Creating a new event still defaults the participant picker to the 5 demo `USERS`, with Léa pre-selected.
- No console errors.

- [ ] **Step 2: Real-session event + event-type creation**

Log in as (or sign up) a real account already used in the Team Invitations chantier's E2E testing. Open `/calendrier`. Create a new event with a custom event type. Confirm:
- The event and the new event type appear immediately in the UI.
- Reload the page — both survive (fetched from Supabase, not lost).
- Check the Supabase Table Editor: rows exist in `events` and `event_types` scoped to the correct `studio_id`.

- [ ] **Step 3: Built-in type seeding for a brand-new studio**

Sign up a second, brand-new real account (fresh studio, never logged in before). Open `/calendrier`. Confirm the 6 built-in event types (Tournage, Livraison, Réunion, Échéance, Montage, Autre) appear in the event-type picker without the user creating anything — this proves `seedBuiltInEventTypes` fired correctly from `studioStore.ts`.

- [ ] **Step 4: Participant picker shows real team**

Using a real studio that has at least 2 team members (owner + 1 invited, from the Team Invitations chantier's test data if still present, or invite a second member now), open the create-event modal in both `/calendrier` and a project's calendar. Confirm both real members appear as selectable participants (not the 5 demo names).

- [ ] **Step 5: Final typecheck/lint diff against baseline**

Run:
```bash
cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "^src/"
npm run lint 2>&1 | tail -3
```
Expected: typecheck error count is 185 (identical to the Team Invitations chantier's confirmed baseline) and lint reports 338 problems (308 errors, 30 warnings) or fewer — any increase in either number means this chantier introduced a regression and must be fixed before considering Task 5 done.

- [ ] **Step 6: Record final verification results in the progress ledger**
