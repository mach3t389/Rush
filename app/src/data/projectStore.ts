// Reactive project store.
// Seeds from PROJECTS mock; user-created projects are persisted separately
// so mock updates (new seed projects) always appear without overwriting edits.

import { PROJECTS } from './mock';
import type { Project } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_added_projects';
const OVERRIDES_KEY = 'sf_project_overrides';

let _added: Project[] = loadPersisted<Project[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Project>> = loadPersisted<Record<string, Partial<Project>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

export function getProjects(): Project[] {
  return [...PROJECTS, ..._added].map(p =>
    _overrides[p.id] ? { ...p, ..._overrides[p.id] } : p
  );
}

export function findProject(id: string): Project | undefined {
  return getProjects().find(p => p.id === id);
}

export function addProject(p: Project): void {
  _added = [p, ..._added];
  persist();
  notify();
}

export function updateProject(id: string, updates: Partial<Project>): void {
  _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...updates } };
  persistOverrides();
  notify();
}

export function subscribeProjects(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
