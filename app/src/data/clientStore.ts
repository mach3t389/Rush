// Reactive client store.
// Seeds from CLIENTS mock; user-created clients are persisted separately.

import { CLIENTS } from './mock';
import type { Client } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_added_clients';

let _added: Client[] = loadPersisted<Client[]>(STORAGE_KEY, []);
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }

export function getClients(): Client[] {
  return [...CLIENTS, ..._added];
}

export function findClient(id: string): Client | undefined {
  return getClients().find(c => c.id === id);
}

export function addClient(c: Client): void {
  _added = [..._added, c];
  persist();
  notify();
}

export function subscribeClients(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
