import type { FormInstance, FormResponse } from './templates';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Store des INSTANCES de formulaire (réponses réellement soumises), à ne pas
// confondre avec les modèles de formulaire eux-mêmes (templates.ts, hors scope).
//
// Demo sessions: unchanged localStorage behavior, exactly as before this
// migration. Real sessions: backed by the `form_instances` table, bulk-loaded
// into an in-memory cache (same pattern as resourceStore.ts) so every read
// stays synchronous.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sf_form_instances';

// ── Demo-session working set ─────────────────────────────────────────────────
function loadFromStorage(): FormInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
let _demoInstances: FormInstance[] = loadFromStorage();
function persistDemo(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(_demoInstances)); }

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseInstances: FormInstance[] = [];
let _supabaseFetchStarted = false;

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }

interface FormInstanceRow {
  id: string;
  template_id: string;
  template_name: string;
  template_color: string;
  linked_project_id: string | null;
  linked_project_name: string | null;
  linked_client_id: string | null;
  linked_client_name: string | null;
  responses: FormResponse[];
  status: string;
  created_at: string;
  updated_at: string;
}

function toInstance(row: FormInstanceRow): FormInstance {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    templateColor: row.template_color,
    linkedProjectId: row.linked_project_id ?? undefined,
    linkedProjectName: row.linked_project_name ?? undefined,
    linkedClientId: row.linked_client_id ?? undefined,
    linkedClientName: row.linked_client_name ?? undefined,
    responses: row.responses,
    status: row.status as FormInstance['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(instance: FormInstance, studioId: string): FormInstanceRow & { studio_id: string } {
  return {
    id: instance.id,
    studio_id: studioId,
    template_id: instance.templateId,
    template_name: instance.templateName,
    template_color: instance.templateColor,
    linked_project_id: instance.linkedProjectId ?? null,
    linked_project_name: instance.linkedProjectName ?? null,
    linked_client_id: instance.linkedClientId ?? null,
    linked_client_name: instance.linkedClientName ?? null,
    responses: instance.responses,
    status: instance.status,
    created_at: instance.createdAt,
    updated_at: instance.updatedAt,
  };
}

async function fetchSupabaseInstances(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('form_instances')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false });

    if (error) { console.error('fetchSupabaseInstances failed', error); return; }

    _supabaseInstances = (data as FormInstanceRow[]).map(toInstance);
    notify();
  } catch (err) {
    console.error('fetchSupabaseInstances failed', err);
  }
}

function ensureFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseInstances();
}

export function resetFormInstancesCache(): void {
  _supabaseInstances = [];
  _supabaseFetchStarted = false;
}

onLogout(resetFormInstancesCache);

async function createSupabaseInstance(instance: FormInstance): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('form_instances').insert(toRow(instance, studioId));
  if (error) { console.error('createSupabaseInstance failed', error); return; }
  await fetchSupabaseInstances();
}

async function updateSupabaseInstance(id: string, responses: FormResponse[], status: 'draft' | 'completed'): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from('form_instances').update({ responses, status, updated_at: updatedAt }).eq('id', id);
  if (error) { console.error('updateSupabaseInstance failed', error); return; }
  await fetchSupabaseInstances();
}

async function deleteSupabaseInstance(id: string): Promise<void> {
  const { error } = await supabase.from('form_instances').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseInstance failed', error); return; }
  await fetchSupabaseInstances();
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getFormInstances(): FormInstance[] {
  if (isDemoSession()) return _demoInstances;
  ensureFetchStarted();
  return _supabaseInstances;
}

export function getFormInstance(id: string): FormInstance | undefined {
  return getFormInstances().find(i => i.id === id);
}

export function createFormInstance(instance: FormInstance): void {
  if (isDemoSession()) {
    _demoInstances = [instance, ..._demoInstances];
    persistDemo();
    notify();
    return;
  }
  _supabaseInstances = [instance, ..._supabaseInstances];
  notify();
  void createSupabaseInstance(instance);
}

export function updateFormInstance(id: string, responses: FormResponse[], status: 'draft' | 'completed'): void {
  if (isDemoSession()) {
    _demoInstances = _demoInstances.map(i =>
      i.id === id ? { ...i, responses, status, updatedAt: new Date().toISOString() } : i
    );
    persistDemo();
    notify();
    return;
  }
  _supabaseInstances = _supabaseInstances.map(i =>
    i.id === id ? { ...i, responses, status, updatedAt: new Date().toISOString() } : i
  );
  notify();
  void updateSupabaseInstance(id, responses, status);
}

export function deleteFormInstance(id: string): void {
  if (isDemoSession()) {
    _demoInstances = _demoInstances.filter(i => i.id !== id);
    persistDemo();
    notify();
    return;
  }
  _supabaseInstances = _supabaseInstances.filter(i => i.id !== id);
  notify();
  void deleteSupabaseInstance(id);
}

export function subscribeFormStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
