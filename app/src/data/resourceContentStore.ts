import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Store de CONTENU par ressource.
//
// Le type `Resource` (types/index.ts) ne porte que des métadonnées (titre,
// statut, …). Le contenu réel d'un éditeur — corps d'un document, commentaires
// d'une révision vidéo, items d'une checklist, etc. — est stocké ici, indexé par
// `resourceId`. Chaque éditeur connaît la forme de SON propre contenu ; le store
// reste volontairement générique (`unknown`).
//
// Demo sessions: unchanged localStorage behavior, exactly as before this
// migration. Real sessions: backed by the `resource_content` table, bulk-loaded
// into an in-memory cache (see `preloadResourceContent`) so every read stays
// synchronous — the 9 consumer screens read this store exactly once at mount,
// with no subscription, so the cache MUST already be populated by the time they
// mount (see `preloadResourceContent`'s wiring into `main.tsx`'s `authLoader`).
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sf_resource_content';

// ── Demo-session working set ─────────────────────────────────────────────────
let _demoContent: Record<string, unknown> = loadPersisted(STORAGE_KEY, {} as Record<string, unknown>);

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseContent: Record<string, unknown> = {};
let _preloadPromise: Promise<void> | null = null;

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }
function persistDemo() { savePersisted(STORAGE_KEY, _demoContent); }

interface ResourceContentRow {
  resource_id: string;
  content: unknown;
}

async function fetchSupabaseContent(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('resource_content')
      .select('resource_id, content')
      .eq('studio_id', studioId);

    if (error) { console.error('fetchSupabaseContent failed', error); return; }

    const next: Record<string, unknown> = {};
    for (const row of data as ResourceContentRow[]) next[row.resource_id] = row.content;
    _supabaseContent = next;
    notify();
  } catch (err) {
    console.error('fetchSupabaseContent failed', err);
  }
}

export function preloadResourceContent(): Promise<void> {
  if (isDemoSession()) return Promise.resolve();
  if (!_preloadPromise) _preloadPromise = fetchSupabaseContent();
  return _preloadPromise;
}

export function resetResourceContentCache(): void {
  _supabaseContent = {};
  _preloadPromise = null;
}

onLogout(resetResourceContentCache);

async function setSupabaseContent(resourceId: string, content: unknown): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase
    .from('resource_content')
    .upsert({ resource_id: resourceId, studio_id: studioId, content, updated_at: new Date().toISOString() });
  if (error) console.error('setSupabaseContent failed', error);
}

async function removeSupabaseContent(resourceId: string): Promise<void> {
  const { error } = await supabase.from('resource_content').delete().eq('resource_id', resourceId);
  if (error) console.error('removeSupabaseContent failed', error);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getResourceContent<T = unknown>(resourceId: string): T | undefined {
  if (isDemoSession()) return _demoContent[resourceId] as T | undefined;
  return _supabaseContent[resourceId] as T | undefined;
}

export function setResourceContent<T = unknown>(resourceId: string, content: T): void {
  if (isDemoSession()) {
    _demoContent = { ..._demoContent, [resourceId]: content };
    persistDemo();
    notify();
    return;
  }
  _supabaseContent = { ..._supabaseContent, [resourceId]: content };
  notify();
  void setSupabaseContent(resourceId, content);
}

export function removeResourceContent(resourceId: string): void {
  if (isDemoSession()) {
    if (!(resourceId in _demoContent)) return;
    const next = { ..._demoContent };
    delete next[resourceId];
    _demoContent = next;
    persistDemo();
    notify();
    return;
  }
  if (!(resourceId in _supabaseContent)) return;
  const next = { ..._supabaseContent };
  delete next[resourceId];
  _supabaseContent = next;
  notify();
  void removeSupabaseContent(resourceId);
}

export function subscribeResourceContent(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// Estimation en octets de tout le contenu ressource du studio (corps de
// document, commentaires de révision, items de checklist, etc.) — utilisé par
// la barre de stockage globale aux côtés de fileStore.getStorageUsedBytes().
// Approximation via la taille UTF-8 du JSON ; suffisant, ce contenu est
// presque toujours du texte/petites structures, pas des médias volumineux
// (ceux-ci passent par fileStore/R2).
export function getResourceContentSizeBytes(): number {
  const map = isDemoSession() ? _demoContent : _supabaseContent;
  let total = 0;
  for (const value of Object.values(map)) {
    try { total += new Blob([JSON.stringify(value)]).size; } catch { /* noop */ }
  }
  return total;
}
