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
import { loadNotifPrefs } from './notifPrefsStore';

const STORAGE_KEY = 'sf_notifs';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version' | 'approval' | 'invitation' | 'deliverableApproved' | 'storageLimit' | 'taskCompleted';

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
  recipientIds: string[];
  /** Nom de l'item affiché entre guillemets dans le texte (ex. le titre
   * d'une ressource) — séparé du texte final pour pouvoir régénérer la
   * phrase quand plusieurs événements se fusionnent en une notification. */
  itemLabel?: string;
  /** Noms distincts des personnes impliquées, la plus récente activité
   * en premier — sert à composer "Sarah et 2 autres ont commenté". */
  actorNames?: string[];
  /** Nombre d'événements fusionnés dans cette notification (1 = simple). */
  count?: number;
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
    storageLimit: [], // jamais généré par ce seed — vient de storageStore.checkStorageThreshold
    taskCompleted: [], // jamais généré par ce seed — vient de taskStore.updateTask
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
        recipientIds: [],
        count: 1,
      });
    }
  }

  // Seed some resource notifications — projectId must match the project the resource belongs to
  const resourceNotifs: { resourceId: string; projectId: string; count: number }[] = [
    { resourceId: 'r2', projectId: 'pj1', count: 3 }, // Rough Cut vidéo → 3 annotations
    { resourceId: 'r1', projectId: 'pj1', count: 2 }, // Scénario → 2 commentaires
    { resourceId: 'r5', projectId: 'pj1', count: 1 }, // Notes tournage J1 → 1 mise à jour
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
        recipientIds: [],
        count: 1,
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
  recipient_ids: string[];
  item_label: string | null;
  actor_names: string[];
  count: number;
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
    recipientIds: row.recipient_ids ?? [],
    itemLabel: row.item_label ?? undefined,
    actorNames: row.actor_names ?? [],
    count: row.count ?? 1,
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
    recipient_ids: n.recipientIds,
    item_label: n.itemLabel ?? null,
    actor_names: n.actorNames ?? [],
    count: n.count ?? 1,
  };
}

async function fetchSupabaseNotifs(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: notifRows, error: notifError } = await supabase
      .from('notifications')
      .select('id, kind, actor, text, timestamp, task_id, resource_id, project_id, client_id, recipient_ids, item_label, actor_names, count')
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

    _supabaseNotifs = (notifRows as NotificationRow[])
      .filter(row => !user || row.recipient_ids.includes(user.id))
      .map(row => toNotif(row, readIds.has(row.id)));
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
  const raw = (() => {
    if (isDemoSession()) return _demoNotifs;
    ensureFetchStarted();
    return _supabaseNotifs;
  })();
  // Le bouton "en-app" des préférences (Paramètres → Notifications) était
  // stocké mais jamais consulté — activer/désactiver ce canal ne changeait
  // rien. Filtrer ici, au point de lecture unique, couvre tous les
  // getters publics d'un coup sans dupliquer le filtre partout.
  const prefs = loadNotifPrefs();
  return raw.filter(n => prefs[n.kind as string]?.inapp !== false);
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

// Every real notification for a single project, newest first — backs the
// real (non-demo) "Activité récente" feed (see activityAdapter.ts), which
// used to return an empty array for every real account.
export function getNotifHistoryForProject(projectId: string): AppNotif[] {
  return getNotifs().filter(n => n.projectId === projectId).sort((a, b) => b.timestamp - a.timestamp);
}
