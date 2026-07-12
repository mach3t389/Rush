// Sidebar preferences: pinned projects, pinned clients, per-project color
// overrides.
//
// Demo sessions (isDemoSession() === true): unchanged localStorage behavior,
// exactly as before this migration.
//
// Real sessions: backed by the `sidebar_prefs` table, scoped by the
// authenticated user's own id (auth.uid()) — these are per-user preferences
// (each teammate can pin their own projects), not per-studio data, so they
// follow the same pattern as notifPrefsStore.ts rather than clientStore.ts.
// Every exported function keeps its exact existing signature and stays
// synchronous — a background fetch populates an in-memory cache, and
// subscribers are notified once it resolves.

import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { supabase } from './supabaseClient';

const PINNED_PROJECTS_KEY = 'sf_pinned_projects';
const PINNED_CLIENTS_KEY  = 'sf_pinned_clients';
const PROJECT_COLORS_KEY  = 'sf_project_colors';

interface SidebarPrefsRow {
  pinned_project_ids: string[];
  pinned_client_ids: string[];
  project_colors: Record<string, string>;
}

// ── Demo-session state (unchanged) ─────────────────────────────────────────
let _pinnedIds: string[] = loadPersisted(PINNED_PROJECTS_KEY, ['pj1', 'pj4', 'pj2']);
let _pinnedClientIds: string[] = loadPersisted(PINNED_CLIENTS_KEY, []);
const _projectColors: Record<string, string> = loadPersisted(PROJECT_COLORS_KEY, {});

// ── Real-session in-memory cache ───────────────────────────────────────────
let _realPinnedIds: string[] = [];
let _realPinnedClientIds: string[] = [];
let _realProjectColors: Record<string, string> = {};
let _fetchStarted = false;

async function fetchSidebarPrefs(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('sidebar_prefs')
    .select('pinned_project_ids, pinned_client_ids, project_colors')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('fetchSidebarPrefs failed', error); return; }

  const row = data as SidebarPrefsRow | null;
  _realPinnedIds = row?.pinned_project_ids ?? [];
  _realPinnedClientIds = row?.pinned_client_ids ?? [];
  _realProjectColors = row?.project_colors ?? {};
  notify();
  notifyClients();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSidebarPrefs();
}

async function saveSidebarPrefs(patch: Partial<SidebarPrefsRow>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // N'envoyer QUE le(s) champ(s) réellement modifié(s) — jamais les valeurs
  // en cache des deux autres champs. Le cache local part à vide tant que le
  // fetch initial (ensureFetchStarted) n'a pas résolu ; si un upsert incluait
  // ces valeurs pas-encore-à-jour, il écraserait silencieusement les vraies
  // valeurs distantes des colonnes non concernées par ce changement (bug
  // vécu : épingler un projet juste après un rechargement de page pouvait
  // effacer les clients épinglés). Le mode "merge-duplicates" de l'upsert
  // Postgrest ne touche que les colonnes présentes dans la requête ; les
  // valeurs par défaut de la table ('{}') couvrent la toute première ligne.
  const { error } = await supabase.from('sidebar_prefs').upsert({
    user_id: user.id,
    updated_at: new Date().toISOString(),
    ...patch,
  });
  if (error) console.error('saveSidebarPrefs failed', error);
}

function resetSidebarPrefsCache(): void {
  _realPinnedIds = [];
  _realPinnedClientIds = [];
  _realProjectColors = {};
  _fetchStarted = false;
}
onLogout(resetSidebarPrefsCache);

// --- Pinned projects ---
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

export const getPinnedIds = (): string[] => {
  if (isDemoSession()) return [..._pinnedIds];
  ensureFetchStarted();
  return [..._realPinnedIds];
};

export const isPinned = (id: string): boolean => getPinnedIds().includes(id);

export function togglePin(id: string): void {
  if (isDemoSession()) {
    _pinnedIds = _pinnedIds.includes(id) ? _pinnedIds.filter(x => x !== id) : [..._pinnedIds, id];
    savePersisted(PINNED_PROJECTS_KEY, _pinnedIds);
    notify();
    return;
  }
  _realPinnedIds = _realPinnedIds.includes(id) ? _realPinnedIds.filter(x => x !== id) : [..._realPinnedIds, id];
  notify();
  void saveSidebarPrefs({ pinned_project_ids: _realPinnedIds });
}

export function movePinned(fromIdx: number, toIdx: number): void {
  if (fromIdx === toIdx) return;
  if (isDemoSession()) {
    const next = [..._pinnedIds];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    _pinnedIds = next;
    savePersisted(PINNED_PROJECTS_KEY, _pinnedIds);
    notify();
    return;
  }
  const next = [..._realPinnedIds];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  _realPinnedIds = next;
  notify();
  void saveSidebarPrefs({ pinned_project_ids: _realPinnedIds });
}

export function subscribePinned(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// --- Project color overrides (per-project color shown in sidebar) ---

export const getProjectColor = (id: string, fallback: string): string => {
  const colors = isDemoSession() ? _projectColors : (ensureFetchStarted(), _realProjectColors);
  return colors[id] ?? fallback;
};

export function setProjectColor(id: string, color: string): void {
  if (isDemoSession()) {
    _projectColors[id] = color;
    savePersisted(PROJECT_COLORS_KEY, _projectColors);
    notify();
    return;
  }
  _realProjectColors = { ..._realProjectColors, [id]: color };
  notify();
  void saveSidebarPrefs({ project_colors: _realProjectColors });
}

// --- Pinned clients ---
const _clientListeners = new Set<() => void>();
const notifyClients = () => _clientListeners.forEach(fn => fn());

export const getPinnedClientIds = (): string[] => {
  if (isDemoSession()) return [..._pinnedClientIds];
  ensureFetchStarted();
  return [..._realPinnedClientIds];
};

export const isPinnedClient = (id: string): boolean => getPinnedClientIds().includes(id);

export function togglePinClient(id: string): void {
  if (isDemoSession()) {
    _pinnedClientIds = _pinnedClientIds.includes(id) ? _pinnedClientIds.filter(x => x !== id) : [..._pinnedClientIds, id];
    savePersisted(PINNED_CLIENTS_KEY, _pinnedClientIds);
    notifyClients();
    return;
  }
  _realPinnedClientIds = _realPinnedClientIds.includes(id) ? _realPinnedClientIds.filter(x => x !== id) : [..._realPinnedClientIds, id];
  notifyClients();
  void saveSidebarPrefs({ pinned_client_ids: _realPinnedClientIds });
}

export function movePinnedClient(fromIdx: number, toIdx: number): void {
  if (fromIdx === toIdx) return;
  if (isDemoSession()) {
    const next = [..._pinnedClientIds];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    _pinnedClientIds = next;
    savePersisted(PINNED_CLIENTS_KEY, _pinnedClientIds);
    notifyClients();
    return;
  }
  const next = [..._realPinnedClientIds];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  _realPinnedClientIds = next;
  notifyClients();
  void saveSidebarPrefs({ pinned_client_ids: _realPinnedClientIds });
}

export function subscribePinnedClients(fn: () => void): () => void {
  _clientListeners.add(fn);
  return () => _clientListeners.delete(fn);
}
