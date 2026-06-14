// Session notification store.
// Tracks unread counts per task and per resource.
// Components subscribe for reactive updates.

import { PROJECT_TASKS } from './mock';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version';

export interface AppNotif {
  id: string;
  kind: NotifKind;
  actor: string;
  text: string;
  timestamp: number;
  read: boolean;
  taskId?: string;
  resourceId?: string;
  projectId: string;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

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

// ── Store ─────────────────────────────────────────────────────────────────────

let _notifs: AppNotif[] = seedNotifs();
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }

export function subscribeNotifs(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getUnreadForTask(taskId: string): AppNotif[] {
  return _notifs.filter(n => n.taskId === taskId && !n.read);
}

export function getUnreadForResource(resourceId: string): AppNotif[] {
  return _notifs.filter(n => n.resourceId === resourceId && !n.read);
}

export function getUnreadForProject(projectId: string): AppNotif[] {
  return _notifs.filter(n => n.projectId === projectId && !n.read);
}

export function getUnreadTaskCountForProject(projectId: string): number {
  return _notifs.filter(n => n.taskId && n.projectId === projectId && !n.read).length;
}

export function getUnreadResourceCountForProject(projectId: string): number {
  return _notifs.filter(n => n.resourceId && n.projectId === projectId && !n.read).length;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function markTaskRead(taskId: string): void {
  _notifs = _notifs.map(n => n.taskId === taskId ? { ...n, read: true } : n);
  notify();
}

export function markResourceRead(resourceId: string): void {
  _notifs = _notifs.map(n => n.resourceId === resourceId ? { ...n, read: true } : n);
  notify();
}

export function markAllProjectRead(projectId: string): void {
  _notifs = _notifs.map(n => n.projectId === projectId ? { ...n, read: true } : n);
  notify();
}

export function getNotifHistory(taskId?: string, resourceId?: string): AppNotif[] {
  return _notifs.filter(n =>
    (taskId ? n.taskId === taskId : true) &&
    (resourceId ? n.resourceId === resourceId : true)
  ).sort((a, b) => b.timestamp - a.timestamp);
}
