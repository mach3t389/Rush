# Notification History Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `notificationStore.ts` (notification history + read/unread state) from a single global `localStorage` list to Supabase, with notifications shared studio-wide but read/unread state tracked per-user for real accounts.

**Architecture:** Same dual demo/real-session pattern as every prior Phase 2 chantier. Two tables: `notifications` (studio-scoped shared events) and `notification_reads` (per-user join table — presence of a row means "this user has read this notification"). Real sessions bulk-fetch both into an in-memory cache and merge them into the existing `AppNotif[]` shape so every consumer keeps working unmodified.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + `supabase-js`), existing `authStore.ts`/`studioStore.ts` session/studio resolution helpers.

## Global Constraints

- Demo-session behavior in `notificationStore.ts` must stay byte-for-byte identical to today: same `localStorage` key (`sf_notifs`), same `seedNotifs()` demo seeding, same shared (not per-user) read state, fully synchronous.
- All 13 exported functions/types keep their exact current signatures: `NotifKind`, `AppNotif`, `subscribeNotifs(fn): () => void`, `getUnreadForTask(taskId): AppNotif[]`, `getUnreadForResource(resourceId): AppNotif[]`, `getUnreadForProject(projectId): AppNotif[]`, `getUnreadTaskCountForProject(projectId): number`, `getUnreadResourceCountForProject(projectId): number`, `markTaskRead(taskId): void`, `markResourceRead(resourceId): void`, `markAllProjectRead(projectId): void`, `markAllRead(): void`, `addNotif(notif): void`, `getNotifHistory(taskId?, resourceId?): AppNotif[]`. No consumer file needs any changes.
- `id` is `text`, client-generated — `addNotif`'s existing `` `user-${Date.now()}-${...}` `` id scheme is preserved as-is.
- Every table's `GRANT ... TO authenticated` statement must be included in Task 1's SQL text itself — this project has missed this step before and must not miss it again.
- RLS for `notifications` reuses `my_studio_ids()`. RLS for `notification_reads` uses `user_id = auth.uid()` directly.
- Do not touch `financeStore.ts` or `commentStore.ts` — both remain explicitly deferred/out of scope.
- **Avoid the stale-cache diff bug found twice in prior chantiers**: whenever a function computes "which ids need X" from the in-memory cache, that computation must happen BEFORE any optimistic write to that same cache variable, never after.
- Baseline to compare against at the end: 185 typecheck errors, 339 lint problems (309 errors, 30 warnings).

---

### Task 1: Supabase schema (manual, user runs it)

**Files:** None — manual SQL step run by the user in the Supabase Dashboard's SQL Editor.

**Interfaces:**
- Produces: `notifications`, `notification_reads` tables, consumed by Task 2.

- [ ] **Step 1: Run this SQL in the Supabase Dashboard → SQL Editor → New query**

```sql
create table notifications (
  id text primary key,
  studio_id uuid not null references studios(id),
  kind text not null,
  actor text not null,
  text text not null,
  timestamp bigint not null,
  task_id text,
  resource_id text,
  project_id text,
  client_id text,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "studio members can manage their notifications"
  on notifications for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on notifications to authenticated;

create table notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null references notifications(id) on delete cascade,
  primary key (user_id, notification_id)
);

alter table notification_reads enable row level security;

create policy "users manage their own notification read state"
  on notification_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on notification_reads to authenticated;
```

Expected: "Success. No rows returned."

- [ ] **Step 2: Verify in the Table Editor**

Confirm `notifications` and `notification_reads` both appear as new tables.

---

### Task 2: `notificationStore.ts` full rewrite

**Files:**
- Modify: `app/src/data/notificationStore.ts` (full rewrite)

**Interfaces:**
- Consumes: `isDemoSession, onLogout` from `./authStore`; `getStudioId` from `./studioStore`; `supabase` from `./supabaseClient`; `PROJECT_TASKS` from `./mock`; `loadPersisted, savePersisted` from `./persist`.
- Produces: same 13 exports as today, unchanged signatures.

- [ ] **Step 1: Replace the full contents of `app/src/data/notificationStore.ts` with:**

```ts
// Session notification store.
// Tracks unread counts per task and per resource.
// Components subscribe for reactive updates.
//
// Demo sessions: unchanged localStorage behavior — a single shared list,
// exactly as before this migration.
// Real sessions: notifications are shared studio-wide (everyone sees the
// same feed), but read/unread state is tracked PER USER via the
// `notification_reads` join table — one person marking something read does
// not affect anyone else's unread count.

import { PROJECT_TASKS } from './mock';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'sf_notifs';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version' | 'approval' | 'invitation' | 'deliverableApproved';

export interface AppNotif {
  id: string;
  kind: NotifKind;
  actor: string;
  text: string;
  timestamp: number;
  read: boolean;
  taskId?: string;
  resourceId?: string;
  projectId?: string;
  clientId?: string;
}

// ── Seed data (demo sessions only) ──────────────────────────────────────────────

function seedNotifs(): AppNotif[] {
  const notifs: AppNotif[] = [];
  let idx = 0;

  // Seed from task activityCount values in mock data
  const allTasks = Object.values(PROJECT_TASKS).flat().flatMap(g => g.tasks);
  const taskMessages: Record<NotifKind, string[]> = {
    comment:    ['a laissé un commentaire', 'a répondu à votre message', 'a posé une question'],
    mention:    ['vous a mentionné', 'a mentionné l\'équipe'],
    status:     ['a changé le statut', 'a mis à jour la priorité'],
    annotation: ['a ajouté une annotation'],
    version:    ['a uploadé une nouvelle version'],
    approval:   ['a demandé une approbation'],
    invitation: [], // jamais généré par ce seed — les notifs d'invitation viennent d'InvitationAccept.tsx
    deliverableApproved: [], // jamais généré par ce seed — vient de Portail.tsx handleApprove
  };
  const actors = ['Sarah Martin', 'Thomas Robert', 'Julie Bernard', 'Marc Dufour'];

  for (const task of allTasks) {
    const count = (task as any).activityCount ?? 0;
    for (let i = 0; i < count; i++) {
      const kind: NotifKind = i % 3 === 0 ? 'comment' : i % 3 === 1 ? 'mention' : 'status';
      const msgs = taskMessages[kind];
      notifs.push({
        id: `tn-${idx++}`,
        kind,
        actor: actors[i % actors.length],
        text: msgs[i % msgs.length],
        timestamp: Date.now() - i * 3_600_000,
        read: false,
        taskId: task.id,
        projectId: task.projectId,
      });
    }
  }

  // Seed some resource notifications — projectId must match the project the resource belongs to
  const resourceNotifs: { resourceId: string; projectId: string; count: number }[] = [
    { resourceId: 'r2', projectId: 'pj1', count: 3 }, // Rough Cut vidéo → 3 annotations
    { resourceId: 'r1', projectId: 'pj1', count: 2 }, // Scénario → 2 commentaires
    { resourceId: 'r5', projectId: 'pj1', count: 1 }, // Checklist → 1 mise à jour
  ];
  for (const { resourceId, projectId, count } of resourceNotifs) {
    for (let i = 0; i < count; i++) {
      const kind: NotifKind = i % 2 === 0 ? 'annotation' : 'comment';
      notifs.push({
        id: `rn-${idx++}`,
        kind,
        actor: actors[i % actors.length],
        text: kind === 'annotation' ? 'a ajouté une annotation' : 'a commenté la ressource',
        timestamp: Date.now() - i * 7_200_000,
        read: false,
        resourceId,
        projectId,
      });
    }
  }

  return notifs;
}

// ── Demo-session working set ─────────────────────────────────────────────────
let _demoNotifs: AppNotif[] = loadPersisted(STORAGE_KEY, seedNotifs());
function persistDemo(): void { savePersisted(STORAGE_KEY, _demoNotifs); }

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseNotifs: AppNotif[] = [];
let _supabaseFetchStarted = false;

const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(fn => fn()); }

interface NotificationRow {
  id: string;
  kind: NotifKind;
  actor: string;
  text: string;
  timestamp: number;
  task_id: string | null;
  resource_id: string | null;
  project_id: string | null;
  client_id: string | null;
}

function toNotif(row: NotificationRow, read: boolean): AppNotif {
  return {
    id: row.id,
    kind: row.kind,
    actor: row.actor,
    text: row.text,
    timestamp: row.timestamp,
    read,
    taskId: row.task_id ?? undefined,
    resourceId: row.resource_id ?? undefined,
    projectId: row.project_id ?? undefined,
    clientId: row.client_id ?? undefined,
  };
}

function toRow(n: AppNotif, studioId: string): NotificationRow & { studio_id: string } {
  return {
    id: n.id,
    studio_id: studioId,
    kind: n.kind,
    actor: n.actor,
    text: n.text,
    timestamp: n.timestamp,
    task_id: n.taskId ?? null,
    resource_id: n.resourceId ?? null,
    project_id: n.projectId ?? null,
    client_id: n.clientId ?? null,
  };
}

async function fetchSupabaseNotifs(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: notifRows, error: notifError } = await supabase
      .from('notifications')
      .select('id, kind, actor, text, timestamp, task_id, resource_id, project_id, client_id')
      .eq('studio_id', studioId)
      .order('timestamp', { ascending: false });

    if (notifError) { console.error('fetchSupabaseNotifs failed', notifError); return; }

    let readIds = new Set<string>();
    if (user) {
      const { data: readRows, error: readError } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', user.id);
      if (readError) { console.error('fetchSupabaseNotifs (reads) failed', readError); return; }
      readIds = new Set((readRows as { notification_id: string }[]).map(r => r.notification_id));
    }

    _supabaseNotifs = (notifRows as NotificationRow[]).map(row => toNotif(row, readIds.has(row.id)));
    notify();
  } catch (err) {
    console.error('fetchSupabaseNotifs failed', err);
  }
}

function ensureFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseNotifs();
}

export function resetNotificationsCache(): void {
  _supabaseNotifs = [];
  _supabaseFetchStarted = false;
}

onLogout(resetNotificationsCache);

function getNotifs(): AppNotif[] {
  if (isDemoSession()) return _demoNotifs;
  ensureFetchStarted();
  return _supabaseNotifs;
}

async function addSupabaseNotif(notif: AppNotif): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('notifications').insert(toRow(notif, studioId));
  if (error) { console.error('addSupabaseNotif failed', error); return; }
  await fetchSupabaseNotifs();
}

async function markSupabaseRead(ids: string[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('notification_reads').upsert(
    ids.map(id => ({ user_id: user.id, notification_id: id }))
  );
  if (error) { console.error('markSupabaseRead failed', error); return; }
  await fetchSupabaseNotifs();
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function subscribeNotifs(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getUnreadForTask(taskId: string): AppNotif[] {
  return getNotifs().filter(n => n.taskId === taskId && !n.read);
}

export function getUnreadForResource(resourceId: string): AppNotif[] {
  return getNotifs().filter(n => n.resourceId === resourceId && !n.read);
}

export function getUnreadForProject(projectId: string): AppNotif[] {
  return getNotifs().filter(n => n.projectId === projectId && !n.read);
}

export function getUnreadTaskCountForProject(projectId: string): number {
  return getNotifs().filter(n => n.taskId && n.projectId === projectId && !n.read).length;
}

export function getUnreadResourceCountForProject(projectId: string): number {
  return getNotifs().filter(n => n.resourceId && n.projectId === projectId && !n.read).length;
}

export function markTaskRead(taskId: string): void {
  if (isDemoSession()) {
    _demoNotifs = _demoNotifs.map(n => n.taskId === taskId ? { ...n, read: true } : n);
    persistDemo();
    notify();
    return;
  }
  const idsToMark = _supabaseNotifs.filter(n => n.taskId === taskId && !n.read).map(n => n.id);
  if (idsToMark.length === 0) return;
  _supabaseNotifs = _supabaseNotifs.map(n => idsToMark.includes(n.id) ? { ...n, read: true } : n);
  notify();
  void markSupabaseRead(idsToMark);
}

export function markResourceRead(resourceId: string): void {
  if (isDemoSession()) {
    _demoNotifs = _demoNotifs.map(n => n.resourceId === resourceId ? { ...n, read: true } : n);
    persistDemo();
    notify();
    return;
  }
  const idsToMark = _supabaseNotifs.filter(n => n.resourceId === resourceId && !n.read).map(n => n.id);
  if (idsToMark.length === 0) return;
  _supabaseNotifs = _supabaseNotifs.map(n => idsToMark.includes(n.id) ? { ...n, read: true } : n);
  notify();
  void markSupabaseRead(idsToMark);
}

export function markAllProjectRead(projectId: string): void {
  if (isDemoSession()) {
    _demoNotifs = _demoNotifs.map(n => n.projectId === projectId ? { ...n, read: true } : n);
    persistDemo();
    notify();
    return;
  }
  const idsToMark = _supabaseNotifs.filter(n => n.projectId === projectId && !n.read).map(n => n.id);
  if (idsToMark.length === 0) return;
  _supabaseNotifs = _supabaseNotifs.map(n => idsToMark.includes(n.id) ? { ...n, read: true } : n);
  notify();
  void markSupabaseRead(idsToMark);
}

export function markAllRead(): void {
  if (isDemoSession()) {
    _demoNotifs = _demoNotifs.map(n => ({ ...n, read: true }));
    persistDemo();
    notify();
    return;
  }
  const idsToMark = _supabaseNotifs.filter(n => !n.read).map(n => n.id);
  if (idsToMark.length === 0) return;
  _supabaseNotifs = _supabaseNotifs.map(n => ({ ...n, read: true }));
  notify();
  void markSupabaseRead(idsToMark);
}

export function addNotif(notif: Omit<AppNotif, 'id' | 'read'>): void {
  if (isDemoSession()) {
    const id = `user-${Date.now()}-${_demoNotifs.length}`;
    _demoNotifs = [{ ...notif, id, read: false }, ..._demoNotifs];
    persistDemo();
    notify();
    return;
  }
  const id = `user-${Date.now()}-${_supabaseNotifs.length}`;
  const newNotif: AppNotif = { ...notif, id, read: false };
  _supabaseNotifs = [newNotif, ..._supabaseNotifs];
  notify();
  void addSupabaseNotif(newNotif);
}

export function getNotifHistory(taskId?: string, resourceId?: string): AppNotif[] {
  return getNotifs().filter(n =>
    (taskId ? n.taskId === taskId : true) &&
    (resourceId ? n.resourceId === resourceId : true)
  ).sort((a, b) => b.timestamp - a.timestamp);
}
```

Note on the `markTaskRead`/`markResourceRead`/`markAllProjectRead`/`markAllRead` real-session branches: `idsToMark` is always computed from `_supabaseNotifs` BEFORE that variable is reassigned — this is the exact ordering that avoids the stale-cache diff bug found twice in prior chantiers. Each of these 4 functions also short-circuits (`if (idsToMark.length === 0) return;`) when there's nothing new to mark, avoiding a pointless empty `upsert` call.

- [ ] **Step 2: Run typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "^src/"`
Expected: 185 (baseline — none of the 13 consumer files need changes since signatures are unchanged)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/notificationStore.ts
git commit -m "feat: notifications real Supabase persistence with per-user read state"
```

---

### Task 3: End-to-end manual verification

**Files:** None — manual browser verification, no code changes expected unless a bug is found.

**Interfaces:**
- Consumes: everything built in Tasks 1-2.

- [ ] **Step 1: Demo-session regression check**

Log in as a demo account. Confirm the notification bell (GlobalTopBar) shows the seeded demo notifications, mark a task/resource/project/all as read via the existing UI flows, reload, confirm read state persists exactly as before this migration. Check the Activité screen still shows notification history correctly. No console errors.

- [ ] **Step 2: Real-session round-trip**

Log in as (or sign up) a real account. Trigger a real notification (e.g. accept a team or client invitation, or approve a deliverable via the Portail flow) and confirm it appears in the notification bell. Mark it read, reload, confirm it stays read.

- [ ] **Step 3: Per-user read-state isolation**

With two real users in the same studio (reuse test accounts/invitation flow from a prior chantier if available), confirm one user marking a notification read does NOT mark it read for the other user — each has their own independent unread count for the same shared notification feed.

- [ ] **Step 4: Cross-studio RLS isolation**

Using the browser console on an authenticated real session, run `await supabase.from('notifications').select('*')` and `await supabase.from('notification_reads').select('*')` with no filter — confirm each returns only this studio's/user's own rows.

- [ ] **Step 5: Final typecheck/lint diff against baseline**

Run:
```bash
cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "^src/"
npm run lint 2>&1 | tail -3
```
Expected: typecheck error count is 185 and lint reports 339 problems (309 errors, 30 warnings) or fewer.

- [ ] **Step 6: Record final verification results in the progress ledger**
