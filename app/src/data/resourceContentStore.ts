import { loadPersisted, savePersisted } from './persist';

// ─────────────────────────────────────────────────────────────────────────────
// Store de CONTENU par ressource.
//
// Le type `Resource` (types/index.ts) ne porte que des métadonnées (titre,
// statut, …). Le contenu réel d'un éditeur — corps d'un document, commentaires
// d'une révision vidéo, items d'une checklist, etc. — est stocké ici, indexé par
// `resourceId`. Chaque éditeur connaît la forme de SON propre contenu ; le store
// reste volontairement générique (`unknown`).
//
// ⚠️  POINT DE BASCULE BACKEND : c'est le SEUL module à réécrire le jour où l'on
// branche un backend. Les éditeurs n'appellent que get/set/subscribe ci-dessous ;
// remplacer l'implémentation localStorage par des appels API ne touchera aucun
// composant d'UI. Garder cette frontière étanche.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sf_resource_content';

let _content: Record<string, unknown> = loadPersisted(STORAGE_KEY, {} as Record<string, unknown>);
const _listeners: Set<() => void> = new Set();

function persist() { savePersisted(STORAGE_KEY, _content); }

export function getResourceContent<T = unknown>(resourceId: string): T | undefined {
  return _content[resourceId] as T | undefined;
}

export function setResourceContent<T = unknown>(resourceId: string, content: T): void {
  _content = { ..._content, [resourceId]: content };
  persist();
  _listeners.forEach(fn => fn());
}

export function removeResourceContent(resourceId: string): void {
  if (!(resourceId in _content)) return;
  const next = { ..._content };
  delete next[resourceId];
  _content = next;
  persist();
  _listeners.forEach(fn => fn());
}

export function subscribeResourceContent(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
