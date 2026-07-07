// Favoris de modèles — préférence PERSONNELLE (par utilisateur), pas par studio.
//
// Demo sessions: unchanged localStorage behavior, exactly as before this
// migration. Real sessions: backed by the `template_favorites` table, scoped
// by the authenticated user's own id (auth.uid()) — like notifPrefsStore.ts,
// not studio-scoped, since favoriting a template is a personal shortcut.

import { isDemoSession } from './authStore';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'sf_template_favorites';

type Listener = () => void;
const listeners: Listener[] = [];
function notify() { listeners.forEach(l => l()); }

// ── Demo-session working set ─────────────────────────────────────────────────
function loadDemoFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* noop */ }
  return new Set();
}
function saveDemoFavorites(ids: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])); } catch { /* noop */ }
}

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseFavorites: Set<string> = new Set();
let _fetchStarted = false;

async function fetchSupabaseFavorites(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.from('template_favorites').select('template_id').eq('user_id', user.id);
    if (error) { console.error('fetchSupabaseFavorites failed', error); return; }

    _supabaseFavorites = new Set((data as { template_id: string }[]).map(row => row.template_id));
    notify();
  } catch (err) {
    console.error('fetchSupabaseFavorites failed', err);
  }
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabaseFavorites();
}

async function addSupabaseFavorite(templateId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('template_favorites').insert({ user_id: user.id, template_id: templateId });
  if (error) console.error('addSupabaseFavorite failed', error);
}

async function removeSupabaseFavorite(templateId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('template_favorites').delete().eq('user_id', user.id).eq('template_id', templateId);
  if (error) console.error('removeSupabaseFavorite failed', error);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getFavoriteTemplateIds(): Set<string> {
  if (isDemoSession()) return loadDemoFavorites();
  ensureFetchStarted();
  return _supabaseFavorites;
}

export function isTemplateFavorite(id: string): boolean {
  return getFavoriteTemplateIds().has(id);
}

export function toggleTemplateFavorite(id: string): void {
  if (isDemoSession()) {
    const ids = loadDemoFavorites();
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    saveDemoFavorites(ids);
    notify();
    return;
  }

  const next = new Set(_supabaseFavorites);
  if (next.has(id)) {
    next.delete(id);
    _supabaseFavorites = next;
    notify();
    void removeSupabaseFavorite(id);
  } else {
    next.add(id);
    _supabaseFavorites = next;
    notify();
    void addSupabaseFavorite(id);
  }
}

export function subscribeTemplateFavorites(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
