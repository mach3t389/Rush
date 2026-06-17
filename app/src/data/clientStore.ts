// Reactive client store.
// Seeds from CLIENTS mock; user-created clients are persisted separately.
// Edits are stored in _overrides (also persisted) so mock + added clients can both be edited.

import { CLIENTS } from './mock';
import type { Client } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_added_clients';
const OVERRIDES_KEY = 'sf_client_overrides';

let _added: Client[] = loadPersisted<Client[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Client>> = loadPersisted<Record<string, Partial<Client>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

export function getClients(): Client[] {
  return [...CLIENTS, ..._added].map(c =>
    _overrides[c.id] ? { ...c, ..._overrides[c.id] } : c
  );
}

export function findClient(id: string): Client | undefined {
  return getClients().find(c => c.id === id);
}

export function addClient(c: Client): void {
  _added = [..._added, c];
  persist();
  notify();
}

export function updateClient(id: string, updates: Partial<Client>): void {
  _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...updates } };
  persistOverrides();
  notify();
}

export function subscribeClients(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
