// Reactive event-type taxonomy store.
//
// Demo sessions (isDemoSession() === true): unchanged localStorage-backed
// behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio. Every new
// real studio gets the 6 built-in types seeded once (see
// seedBuiltInEventTypes, called from studioStore.ts's brand-new-studio
// branch). getEventTypes() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern clientStore.ts uses.

import { isDemoSession, onLogout } from './authStore';
import { supabase } from './supabaseClient';

export interface EventType {
  id: string;
  label: string;
  color: string;
  icon: string;
  builtIn?: boolean; // seeded default type — can still be edited/deleted by the user
}

const STORAGE_KEY = 'sf_event_types';

const DEFAULT_TYPES: EventType[] = [
  { id: 'tournage',  label: 'Tournage',   color: '#e85b7a', icon: 'video',          builtIn: true },
  { id: 'livraison', label: 'Livraison',  color: '#f5975b', icon: 'package',        builtIn: true },
  { id: 'reunion',   label: 'Réunion',    color: '#5b8af5', icon: 'users',          builtIn: true },
  { id: 'deadline',  label: 'Échéance',   color: '#c45be8', icon: 'alert-circle',   builtIn: true },
  { id: 'montage',   label: 'Montage',    color: '#34c98a', icon: 'scissors',       builtIn: true },
  { id: 'autre',     label: 'Autre',      color: '#888',    icon: 'circle',         builtIn: true },
];

type Listener = () => void;
const listeners: Listener[] = [];

function notify() { listeners.forEach(l => l()); }

export function subscribeEventTypes(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

// ── Demo (localStorage) path ────────────────────────────────────────────────

function getDemoEventTypes(): EventType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EventType[];
  } catch { /* noop */ }
  return DEFAULT_TYPES;
}

function saveDemoEventTypes(types: EventType[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(types)); } catch { /* noop */ }
}

// ── Real (Supabase-backed) session state ────────────────────────────────────

let _supabaseTypes: EventType[] = [];
let _supabaseFetchStarted = false;

interface EventTypeRow {
  id: string;
  studio_id: string;
  label: string;
  color: string;
  icon: string;
  built_in: boolean | null;
  position: number;
}

function toEventType(row: EventTypeRow): EventType {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    icon: row.icon,
    builtIn: row.built_in ?? undefined,
  };
}

async function fetchSupabaseEventTypes(studioId: string): Promise<void> {
  const { data, error } = await supabase
    .from('event_types')
    .select('*')
    .eq('studio_id', studioId)
    .order('position', { ascending: true });

  if (error) { console.error('fetchSupabaseEventTypes failed', error); return; }

  _supabaseTypes = (data as EventTypeRow[]).map(toEventType);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await fetchSupabaseEventTypes(studioId);
  })();
}

export function resetEventTypesCache(): void {
  _supabaseTypes = [];
  _supabaseFetchStarted = false;
}

onLogout(resetEventTypesCache);

/**
 * Inserts the 6 built-in event types for a newly-created real studio.
 * Called once from studioStore.ts's getStudioId() brand-new-studio branch —
 * never called for demo sessions or for studios that already have types.
 */
export async function seedBuiltInEventTypes(studioId: string): Promise<void> {
  const rows: EventTypeRow[] = DEFAULT_TYPES.map((t, i) => ({
    id: t.id,
    studio_id: studioId,
    label: t.label,
    color: t.color,
    icon: t.icon,
    built_in: t.builtIn ?? null,
    position: i,
  }));
  const { error } = await supabase.from('event_types').insert(rows);
  if (error) console.error('seedBuiltInEventTypes failed', error);
}

async function addSupabaseEventType(type: EventType, studioId: string): Promise<void> {
  const { error } = await supabase.from('event_types').insert({
    id: type.id,
    studio_id: studioId,
    label: type.label,
    color: type.color,
    icon: type.icon,
    built_in: type.builtIn ?? null,
    position: _supabaseTypes.length,
  });
  if (error) { console.error('addSupabaseEventType failed', error); return; }
  await fetchSupabaseEventTypes(studioId);
}

async function updateSupabaseEventType(id: string, patch: Partial<Omit<EventType, 'id' | 'builtIn'>>, studioId: string): Promise<void> {
  const { error } = await supabase.from('event_types').update(patch).eq('id', id);
  if (error) { console.error('updateSupabaseEventType failed', error); return; }
  await fetchSupabaseEventTypes(studioId);
}

async function deleteSupabaseEventType(id: string, studioId: string): Promise<void> {
  const { error } = await supabase.from('event_types').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseEventType failed', error); return; }
  await fetchSupabaseEventTypes(studioId);
}

async function reorderSupabaseEventTypes(orderedIds: string[], studioId: string): Promise<void> {
  const updates = orderedIds.map((id, i) =>
    supabase.from('event_types').update({ position: i }).eq('id', id).eq('studio_id', studioId)
  );
  const results = await Promise.all(updates);
  const failed = results.find(r => r.error);
  if (failed?.error) { console.error('reorderSupabaseEventTypes failed', failed.error); return; }
  await fetchSupabaseEventTypes(studioId);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getEventTypes(): EventType[] {
  if (isDemoSession()) return getDemoEventTypes();
  ensureSupabaseFetchStarted();
  return _supabaseTypes;
}

export function addEventType(type: Omit<EventType, 'id'>): EventType {
  const newType: EventType = { ...type, id: `et_${Date.now()}` };
  if (isDemoSession()) {
    saveDemoEventTypes([...getDemoEventTypes(), newType]);
    notify();
    return newType;
  }
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await addSupabaseEventType(newType, studioId);
  })();
  return newType;
}

export function updateEventType(id: string, patch: Partial<Omit<EventType, 'id' | 'builtIn'>>) {
  if (isDemoSession()) {
    saveDemoEventTypes(getDemoEventTypes().map(t => t.id === id ? { ...t, ...patch } : t));
    notify();
    return;
  }
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await updateSupabaseEventType(id, patch, studioId);
  })();
}

export function deleteEventType(id: string) {
  if (isDemoSession()) {
    saveDemoEventTypes(getDemoEventTypes().filter(t => t.id !== id));
    notify();
    return;
  }
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await deleteSupabaseEventType(id, studioId);
  })();
}

export function reorderEventTypes(orderedIds: string[]) {
  if (isDemoSession()) {
    const current = getDemoEventTypes();
    const byId = new Map(current.map(t => [t.id, t]));
    const reordered = orderedIds.map(id => byId.get(id)).filter((t): t is EventType => !!t);
    saveDemoEventTypes(reordered);
    notify();
    return;
  }
  void (async () => {
    const { getStudioId } = await import('./studioStore');
    const studioId = await getStudioId();
    await reorderSupabaseEventTypes(orderedIds, studioId);
  })();
}

export function getEventTypeById(id: string): EventType | undefined {
  return getEventTypes().find(t => t.id === id);
}
