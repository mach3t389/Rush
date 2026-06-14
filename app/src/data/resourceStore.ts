import { RESOURCES } from './mock';
import type { Resource } from '../types';

// Mutable singleton store — starts from mock data, accepts runtime additions
let _resources: Resource[] = [...RESOURCES];
const _listeners: Set<() => void> = new Set();

export function getResources(): Resource[] {
  return _resources;
}

export function addResource(r: Resource): void {
  _resources = [..._resources, r];
  _listeners.forEach(fn => fn());
}

export function updateResource(id: string, patch: Partial<import('../types').Resource>): void {
  _resources = _resources.map(r => r.id === id ? { ...r, ...patch } : r);
  _listeners.forEach(fn => fn());
}

export function removeResource(id: string): void {
  _resources = _resources.filter(r => r.id !== id);
  _listeners.forEach(fn => fn());
}

export function subscribeResources(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
