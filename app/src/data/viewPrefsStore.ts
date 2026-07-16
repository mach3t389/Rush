// Préférences d'affichage (par utilisateur, cross-device) — ex. "afficher
// les sections terminées", "afficher les tâches terminées", vue liste/board.
//
// Demo sessions: localStorage, comme avant.
// Real sessions: table `view_prefs`, scopée par l'utilisateur authentifié
// (auth.uid()) — même pattern que notifPrefsStore.ts.

import { isDemoSession } from './authStore';
import { supabase } from './supabaseClient';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_view_prefs';

type ViewPrefs = Record<string, unknown>;

let _prefs: ViewPrefs | null = null;
let _fetchStarted = false;

const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(fn => fn()); }

async function fetchSupabasePrefs(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('view_prefs')
    .select('prefs')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('fetchViewPrefs failed', error); return; }

  _prefs = (data?.prefs as ViewPrefs) ?? {};
  notify();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabasePrefs();
}

async function saveSupabasePrefs(prefs: ViewPrefs): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('view_prefs')
    .upsert({ user_id: user.id, prefs, updated_at: new Date().toISOString() });
  if (error) console.error('saveViewPrefs failed', error);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getViewPref<T>(key: string, fallback: T): T {
  if (isDemoSession()) {
    const all = loadPersisted<ViewPrefs>(STORAGE_KEY, {});
    return key in all ? (all[key] as T) : fallback;
  }
  ensureFetchStarted();
  if (_prefs && key in _prefs) return _prefs[key] as T;
  return fallback;
}

export function setViewPref<T>(key: string, value: T): void {
  if (isDemoSession()) {
    const all = loadPersisted<ViewPrefs>(STORAGE_KEY, {});
    savePersisted(STORAGE_KEY, { ...all, [key]: value });
    notify();
    return;
  }
  _prefs = { ...(_prefs ?? {}), [key]: value };
  void saveSupabasePrefs(_prefs);
  notify();
}

export function subscribeViewPrefs(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
