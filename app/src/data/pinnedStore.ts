// --- Pinned projects ---
let _pinnedIds: string[] = ['pj1', 'pj4', 'pj2'];
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

export const getPinnedIds = (): string[] => [..._pinnedIds];
export const isPinned = (id: string): boolean => _pinnedIds.includes(id);

export function togglePin(id: string): void {
  _pinnedIds = _pinnedIds.includes(id)
    ? _pinnedIds.filter(x => x !== id)
    : [..._pinnedIds, id];
  notify();
}

export function movePinned(fromIdx: number, toIdx: number): void {
  if (fromIdx === toIdx) return;
  const next = [..._pinnedIds];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  _pinnedIds = next;
  notify();
}

export function subscribePinned(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// --- Project color overrides (per-project color shown in sidebar) ---
const _projectColors: Record<string, string> = {};

export const getProjectColor = (id: string, fallback: string): string =>
  _projectColors[id] ?? fallback;

export function setProjectColor(id: string, color: string): void {
  _projectColors[id] = color;
  notify();
}

// --- Pinned clients ---
let _pinnedClientIds: string[] = [];
const _clientListeners = new Set<() => void>();
const notifyClients = () => _clientListeners.forEach(fn => fn());

export const getPinnedClientIds = (): string[] => [..._pinnedClientIds];
export const isPinnedClient = (id: string): boolean => _pinnedClientIds.includes(id);

export function togglePinClient(id: string): void {
  _pinnedClientIds = _pinnedClientIds.includes(id)
    ? _pinnedClientIds.filter(x => x !== id)
    : [..._pinnedClientIds, id];
  notifyClients();
}

export function movePinnedClient(fromIdx: number, toIdx: number): void {
  if (fromIdx === toIdx) return;
  const next = [..._pinnedClientIds];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  _pinnedClientIds = next;
  notifyClients();
}

export function subscribePinnedClients(fn: () => void): () => void {
  _clientListeners.add(fn);
  return () => _clientListeners.delete(fn);
}
