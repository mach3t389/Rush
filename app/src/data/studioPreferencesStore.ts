// Studio-level preferences: fonts (heading/body), portal accent color.
// Scoped by studio, shared by all team members in that studio.
//
// Demo sessions: localStorage with studio-scoped keys (e.g., sf_studio_prefs_demo_studio_1)
// Real sessions: Supabase studios table columns ui_fonts and portal_accent,
// fetched on app startup via applyPersistedStudioPreferences().

import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { supabase } from './supabaseClient';
import { getStudioId } from './studioStore';

const DEFAULT_UI_FONTS = { heading: "'Montserrat',sans-serif", body: "'Montserrat',sans-serif" };

export interface StudioPreferences {
  uiFonts: { heading: string; body: string };
  portalAccent: string | null;
}

// Demo-session state

function demoStorageKey(studioId: string, key: string): string {
  return 'sf_studio_prefs_' + studioId + '_' + key;
}

function getDemoPreferences(studioId: string): StudioPreferences {
  try {
    const uiFonts = loadPersisted(demoStorageKey(studioId, 'ui_fonts'), DEFAULT_UI_FONTS);
    const portalAccent = loadPersisted(demoStorageKey(studioId, 'portal_accent'), null);
    return { uiFonts, portalAccent };
  } catch {
    return { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
  }
}

function setDemoPreferences(studioId: string, prefs: StudioPreferences): void {
  try {
    savePersisted(demoStorageKey(studioId, 'ui_fonts'), prefs.uiFonts);
    savePersisted(demoStorageKey(studioId, 'portal_accent'), prefs.portalAccent);
  } catch { /* noop */ }
}

// ── Real-session in-memory cache ─────────────────────────────────────────────

let _realPreferences: StudioPreferences = { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
let _fetchStarted = false;
let _fetchPromise: Promise<void> | null = null;

async function fetchStudioPreferences(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('studios')
      .select('ui_fonts, portal_accent')
      .eq('id', studioId)
      .single();

    if (error) {
      console.error('fetchStudioPreferences failed', error);
      _realPreferences = { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
      return;
    }

    _realPreferences = {
      uiFonts: data?.ui_fonts ?? DEFAULT_UI_FONTS,
      portalAccent: data?.portal_accent ?? null,
    };
    notify();
  } catch (e) {
    console.error('fetchStudioPreferences exception', e);
    _realPreferences = { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
  }
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  _fetchPromise = fetchStudioPreferences();
}

function resetCache(): void {
  _realPreferences = { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
  _fetchStarted = false;
  _fetchPromise = null;
}

onLogout(resetCache);

// ── Public API ────────────────────────────────────────────────────────────────

const _listeners = new Set<() => void>();
function notify() {
  _listeners.forEach(fn => fn());
}

export function getStudioPreferences(): StudioPreferences {
  if (isDemoSession()) {
    // For demo, we need a mock studio id — use a fixed string
    return getDemoPreferences('demo_studio_1');
  }
  ensureFetchStarted();
  return { ..._realPreferences };
}

export function setUiFonts(heading: string, body: string): void {
  const uiFonts = { heading, body };
  if (isDemoSession()) {
    const current = getDemoPreferences('demo_studio_1');
    setDemoPreferences('demo_studio_1', { ...current, uiFonts });
    notify();
    return;
  }
  _realPreferences = { ..._realPreferences, uiFonts };
  notify();
  void (async () => {
    const studioId = await getStudioId();
    const { error } = await supabase
      .from('studios')
      .update({ ui_fonts: uiFonts })
      .eq('id', studioId);
    if (error) console.error('setUiFonts failed', error);
  })();
}

export function setPortalAccent(color: string | null): void {
  if (isDemoSession()) {
    const current = getDemoPreferences('demo_studio_1');
    setDemoPreferences('demo_studio_1', { ...current, portalAccent: color });
    applyAccentToCss(color);
    notify();
    return;
  }
  _realPreferences = { ..._realPreferences, portalAccent: color };
  applyAccentToCss(color);
  notify();
  void (async () => {
    const studioId = await getStudioId();
    const { error } = await supabase
      .from('studios')
      .update({ portal_accent: color })
      .eq('id', studioId);
    if (error) console.error('setPortalAccent failed', error);
  })();
}

export function subscribeStudioPreferences(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Bootstrap: Apply persisted preferences at app startup ─────────────────────
// Called once from main.tsx before React render. Ensures fonts and accent color
// are applied to CSS variables before components mount.

function applyUiFontsToCss(uiFonts: { heading: string; body: string }): void {
  document.documentElement.style.setProperty('--ff-display', uiFonts.heading);
  document.documentElement.style.setProperty('--ff-text', uiFonts.body);
}

function applyAccentToCss(color: string | null): void {
  if (color) {
    document.documentElement.style.setProperty('--accent', color);
  }
}

export async function applyPersistedStudioPreferences(): Promise<void> {
  const prefs = getStudioPreferences();
  applyUiFontsToCss(prefs.uiFonts);
  applyAccentToCss(prefs.portalAccent);

  // For real sessions, wait for fetch to complete so we have fresh data from Supabase
  if (!isDemoSession() && _fetchPromise) {
    await _fetchPromise;
    // Re-apply after fetch resolves (fresh data from server)
    const updated = getStudioPreferences();
    applyUiFontsToCss(updated.uiFonts);
    applyAccentToCss(updated.portalAccent);
  }
}
