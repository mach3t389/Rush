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

// One-time migration: Remove legacy global preference keys
// (sf_ui_fonts, sf_portal_accent) since they are now per-studio in Supabase
export function migrateLegacyStorageKeys(): void {
  const keysToRemove = ['sf_ui_fonts', 'sf_portal_accent'];
  keysToRemove.forEach(key => {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  });
}
