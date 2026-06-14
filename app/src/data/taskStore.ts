import { PROJECT_TASKS } from './mock';
import type { Task, SectionData } from '../types';

type ProjectStore = Record<string, SectionData[]>;

let _store: ProjectStore = Object.fromEntries(
  Object.entries(PROJECT_TASKS).map(([k, sections]) => [
    k,
    sections.map(s => ({ ...s, tasks: s.tasks.map(t => ({ ...t })) })),
  ])
);

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }

export function getSections(projectId: string): SectionData[] {
  return _store[projectId] ?? [];
}

export function setSections(projectId: string, sections: SectionData[]): void {
  _store = { ..._store, [projectId]: sections };
  notify();
}

export function addDeliverable(projectId: string, task: Task): void {
  const sections = getSections(projectId);
  const SECTION = 'Livraison';
  const idx = sections.findIndex(s => s.label === SECTION);
  let next: SectionData[];
  if (idx >= 0) {
    next = sections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, task] } : s);
  } else {
    next = [...sections, { label: SECTION, tasks: [task] }];
  }
  setSections(projectId, next);
}

export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t),
  }));
  setSections(projectId, next);
}

export function getDeliverables(projectId: string): Task[] {
  return getSections(projectId).flatMap(s => s.tasks).filter(t => t.deliverable);
}

export function moveTask(fromProjectId: string, taskId: string, toProjectId: string, toSectionLabel: string): void {
  let movedTask: Task | null = null;
  const fromSections = getSections(fromProjectId).map(s => {
    const found = s.tasks.find(t => t.id === taskId);
    if (found) movedTask = found;
    return { ...s, tasks: s.tasks.filter(t => t.id !== taskId) };
  });
  if (!movedTask) return;
  setSections(fromProjectId, fromSections);

  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  let nextTo: SectionData[];
  if (idx >= 0) {
    nextTo = toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, movedTask!] } : s);
  } else {
    nextTo = [...toSections, { label: toSectionLabel, progress: 0, tasks: [movedTask!] }];
  }
  setSections(toProjectId, nextTo);
}

export function subscribeStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
