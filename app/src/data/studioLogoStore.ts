import { isDemoSession } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const KEY_FULL = 'sf_studio_logo_full';
const KEY_SQUARE = 'sf_studio_logo_square';

type Listener = () => void;
const listeners: Listener[] = [];

function notify() {
  listeners.forEach(l => l());
}

export function subscribeStudioLogos(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

// ── Real-session in-memory cache ────────────────────────────────────────────
let _logoFull: string | null = null;
let _logoSquare: string | null = null;
let _fetchStarted = false;

async function fetchSupabaseLogos(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studios')
    .select('logo_full, logo_square')
    .eq('id', studioId)
    .single();

  if (error) { console.error('fetchSupabaseLogos failed', error); return; }

  _logoFull = data.logo_full;
  _logoSquare = data.logo_square;
  notify();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabaseLogos();
}

async function setSupabaseLogo(column: 'logo_full' | 'logo_square', dataUrl: string | null): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('studios').update({ [column]: dataUrl }).eq('id', studioId);
  if (error) console.error('setSupabaseLogo failed', error);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getLogoFull(): string | null {
  if (isDemoSession()) {
    try { return localStorage.getItem(KEY_FULL); } catch { return null; }
  }
  ensureFetchStarted();
  return _logoFull;
}

export function getLogoSquare(): string | null {
  if (isDemoSession()) {
    try { return localStorage.getItem(KEY_SQUARE); } catch { return null; }
  }
  ensureFetchStarted();
  return _logoSquare;
}

export function setLogoFull(dataUrl: string | null) {
  if (isDemoSession()) {
    try {
      if (dataUrl) localStorage.setItem(KEY_FULL, dataUrl);
      else localStorage.removeItem(KEY_FULL);
      notify();
    } catch { /* noop */ }
    return;
  }
  _logoFull = dataUrl;
  notify();
  void setSupabaseLogo('logo_full', dataUrl);
}

export function setLogoSquare(dataUrl: string | null) {
  if (isDemoSession()) {
    try {
      if (dataUrl) localStorage.setItem(KEY_SQUARE, dataUrl);
      else localStorage.removeItem(KEY_SQUARE);
      notify();
    } catch { /* noop */ }
    return;
  }
  _logoSquare = dataUrl;
  notify();
  void setSupabaseLogo('logo_square', dataUrl);
}
