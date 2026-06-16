// Reactive project store.
// Seeds from PROJECTS mock; user-created projects are persisted separately
// so mock updates (new seed projects) always appear without overwriting edits.

import { PROJECTS } from './mock';
import type { Project } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_added_projects';

let _added: Project[] = loadPersisted<Project[]>(STORAGE_KEY, []);
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }

export function getProjects(): Project[] {
  return [...PROJECTS, ..._added];
}

export function findProject(id: string): Project | undefined {
  return getProjects().find(p => p.id === id);
}

export function addProject(p: Project): void {
  _added = [p, ..._added];
  persist();
  notify();
}

export function subscribeProjects(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
