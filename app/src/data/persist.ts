// Tiny localStorage persistence helper shared by all data stores.
// Centralizes the read/write + try/catch boilerplate so every store
// persists consistently (the pattern eventStore/eventTypeStore already use).

export function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch { /* corrupted or unavailable — fall back to seed */ }
  return fallback;
}

export function savePersisted<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota or unavailable — ignore */ }
}
