import { RESOURCES } from './mock';
import type { Resource } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { removeResourceContent } from './resourceContentStore';

const STORAGE_KEY = 'sf_resources';

// ── Demo-session working set ─────────────────────────────────────────────────
let _demoResources: Resource[] = loadPersisted(STORAGE_KEY, [...RESOURCES]);

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseResources: Resource[] = [];
let _supabaseFetchStarted = false;

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }
function persistDemo() { savePersisted(STORAGE_KEY, _demoResources); }

interface ResourceRow {
  id: string;
  studio_id: string;
  type: string;
  eyebrow: string;
  title: string;
  description: string | null;
  status: string;
  status_label: string;
  meta: string;
  version: string | null;
  progress: number | null;
  avatars: { initials: string; bg: string }[] | null;
  colors: string[] | null;
  media_subtype: Resource['mediaSubtype'] | null;
  web_url: string | null;
}

function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    type: row.type as Resource['type'],
    eyebrow: row.eyebrow,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as Resource['status'],
    statusLabel: row.status_label,
    meta: row.meta,
    version: row.version ?? undefined,
    progress: row.progress ?? undefined,
    avatars: row.avatars ?? undefined,
    colors: row.colors ?? undefined,
    mediaSubtype: row.media_subtype ?? undefined,
    webUrl: row.web_url ?? undefined,
  };
}

function toRow(r: Resource, studioId: string): ResourceRow {
  return {
    id: r.id,
    studio_id: studioId,
    type: r.type,
    eyebrow: r.eyebrow,
    title: r.title,
    description: r.description ?? null,
    status: r.status,
    status_label: r.statusLabel,
    meta: r.meta,
    version: r.version ?? null,
    progress: r.progress ?? null,
    avatars: r.avatars ?? null,
    colors: r.colors ?? null,
    media_subtype: r.mediaSubtype ?? null,
    web_url: r.webUrl ?? null,
  };
}

async function fetchSupabaseResources(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchSupabaseResources failed', error); return; }

  _supabaseResources = (data as ResourceRow[]).map(toResource);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseResources();
}

export function resetResourcesCache(): void {
  _supabaseResources = [];
  _supabaseFetchStarted = false;
}

onLogout(resetResourcesCache);

async function addSupabaseResource(r: Resource): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('resources').insert(toRow(r, studioId));
  if (error) { console.error('addSupabaseResource failed', error); return; }
  await fetchSupabaseResources();
}

async function updateSupabaseResource(id: string, patch: Partial<Resource>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseResources.find(r => r.id === id);
  if (!current) { console.error('updateSupabaseResource: resource not found in cache', id); return; }
  const merged = { ...current, ...patch };
  const { error } = await supabase.from('resources').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseResource failed', error); return; }
  await fetchSupabaseResources();
}

async function removeSupabaseResource(id: string): Promise<void> {
  const { error } = await supabase.from('resources').delete().eq('id', id);
  if (error) { console.error('removeSupabaseResource failed', error); return; }
  await fetchSupabaseResources();
}

// ── Public API (unchanged signatures) ─────────────────────────────────────────

export function getResources(): Resource[] {
  if (isDemoSession()) return _demoResources;
  ensureSupabaseFetchStarted();
  return _supabaseResources;
}

export function addResource(r: Resource): void {
  if (isDemoSession()) {
    _demoResources = [..._demoResources, r];
    persistDemo();
    notify();
    return;
  }
  void addSupabaseResource(r);
}

export function updateResource(id: string, patch: Partial<Resource>): void {
  if (isDemoSession()) {
    _demoResources = _demoResources.map(r => r.id === id ? { ...r, ...patch } : r);
    persistDemo();
    notify();
    return;
  }
  void updateSupabaseResource(id, patch);
}

export function removeResource(id: string): void {
  removeResourceContent(id);
  if (isDemoSession()) {
    _demoResources = _demoResources.filter(r => r.id !== id);
    persistDemo();
    notify();
    return;
  }
  void removeSupabaseResource(id);
}

export function subscribeResources(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
