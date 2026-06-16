import { RESOURCES } from './mock';
import type { Resource } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_resources';

// Mutable singleton store — seeds from mock data, persists runtime additions/edits
let _resources: Resource[] = loadPersisted(STORAGE_KEY, [...RESOURCES]);
const _listeners: Set<() => void> = new Set();

function persist() { savePersisted(STORAGE_KEY, _resources); }

export function getResources(): Resource[] {
  return _resources;
}

export function addResource(r: Resource): void {
  _resources = [..._resources, r];
  persist();
  _listeners.forEach(fn => fn());
}

export function updateResource(id: string, patch: Partial<import('../types').Resource>): void {
  _resources = _resources.map(r => r.id === id ? { ...r, ...patch } : r);
  persist();
  _listeners.forEach(fn => fn());
}

export function removeResource(id: string): void {
  _resources = _resources.filter(r => r.id !== id);
  persist();
  _listeners.forEach(fn => fn());
}

export function subscribeResources(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
