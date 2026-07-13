// app/src/data/storageStore.ts
// Aggregates real disk/bucket usage across every storage pool in the app —
// currently fileStore (Fichiers/R2, the vast majority of real bytes) and
// resourceContentStore (document bodies, review comments, checklists, etc.).
// Single place to extend if a new storage pool is ever added, so the sidebar
// bar and the billing page's bar never drift apart.

import { getStorageUsedBytes, subscribeFileStore } from './fileStore';
import { getResourceContentSizeBytes, subscribeResourceContent } from './resourceContentStore';
import { addNotif } from './notificationStore';

export function getTotalStorageUsedBytes(): number {
  return getStorageUsedBytes() + getResourceContentSizeBytes();
}

export function subscribeStorageUsage(fn: () => void): () => void {
  const unsubFiles = subscribeFileStore(fn);
  const unsubContent = subscribeResourceContent(fn);
  return () => { unsubFiles(); unsubContent(); };
}

// ── Alerte d'approche de limite ─────────────────────────────────────────────
// Un seul palier (90%) : au-delà, on prévient une fois via une notification
// persistante (cloche/Activité) plutôt qu'un toast éphémère qu'on peut
// manquer. Un flag localStorage évite de reprévenir à chaque rechargement ;
// il se réarme automatiquement si l'usage redescend sous 80% (l'utilisateur
// a libéré de l'espace ou augmenté son quota) puis remonte au-delà de 90%.
const ALERT_FLAG_KEY = 'sf_storage_alerted_90';
const ALERT_THRESHOLD_PCT = 90;
const ALERT_REARM_PCT = 80;

export function checkStorageThreshold(usedGB: number, limitGB: number): void {
  if (limitGB <= 0) return;
  const pct = (usedGB / limitGB) * 100;

  if (pct < ALERT_REARM_PCT) {
    try { localStorage.removeItem(ALERT_FLAG_KEY); } catch { /* noop */ }
    return;
  }

  if (pct < ALERT_THRESHOLD_PCT) return;

  try {
    if (localStorage.getItem(ALERT_FLAG_KEY)) return;
    localStorage.setItem(ALERT_FLAG_KEY, '1');
  } catch { /* noop — pas de localStorage disponible, on tente quand même une fois */ }

  addNotif({ kind: 'storageLimit', actor: 'Rush', text: `Stockage à ${Math.round(pct)}% de la limite du plan`, timestamp: Date.now() });
}
