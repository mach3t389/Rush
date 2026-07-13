// Reactive project store.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage-overrides behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio (see
// studioStore.ts). getProjects() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern authStore.ts uses for
// getCurrentUser() via onAuthStateChange, so no consuming screen needs to
// change to handle a Promise.

import { PROJECTS } from './mock';
import type { Project } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { setSections } from './taskStore';
import { deleteEventsForProject } from './eventStore';
import { deleteAllFilesForProject } from './fileStore';
import { getInvoicesByProject, removeInvoice } from './financeStore';
import { createLoadingFlag } from './loadingFlag';
import { showToast } from './toastStore';

const STORAGE_KEY = 'sf_added_projects';
const OVERRIDES_KEY = 'sf_project_overrides';

let _added: Project[] = loadPersisted<Project[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Project>> = loadPersisted<Record<string, Partial<Project>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

// ── Real (Supabase-backed) session state ──────────────────────────────────
let _supabaseProjects: Project[] = [];
let _supabaseFetchStarted = false;
const _loading = createLoadingFlag();

interface ProjectRow {
  id: string;
  studio_id: string;
  name: string;
  client_id: string;
  client_name: string;
  client_color: string;
  phase: string;
  phase_label: string;
  progress: number;
  task_count: number;
  deliverable_count: number;
  delivery_date: string;
  status: string;
  status_label: string;
  modified_at: string;
  budget: number | null;
  description: string | null;
  folder_structure_template_id: string | null;
  members: Project['members'];
  archived: boolean;
  completed: boolean;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    clientName: row.client_name,
    clientColor: row.client_color,
    phase: row.phase as Project['phase'],
    phaseLabel: row.phase_label,
    progress: row.progress,
    taskCount: row.task_count,
    deliverableCount: row.deliverable_count,
    members: row.members ?? [],
    deliveryDate: row.delivery_date,
    status: row.status as Project['status'],
    statusLabel: row.status_label,
    modifiedAt: row.modified_at,
    budget: row.budget ?? undefined,
    description: row.description ?? undefined,
    folderStructureTemplateId: row.folder_structure_template_id ?? undefined,
    archived: row.archived,
    completed: row.completed,
  };
}

function toRow(p: Project, studioId: string): ProjectRow {
  return {
    id: p.id,
    studio_id: studioId,
    name: p.name,
    client_id: p.clientId,
    client_name: p.clientName,
    client_color: p.clientColor,
    phase: p.phase,
    phase_label: p.phaseLabel,
    progress: p.progress,
    task_count: p.taskCount,
    deliverable_count: p.deliverableCount,
    delivery_date: p.deliveryDate,
    status: p.status,
    status_label: p.statusLabel,
    modified_at: p.modifiedAt,
    budget: p.budget ?? null,
    description: p.description ?? null,
    folder_structure_template_id: p.folderStructureTemplateId ?? null,
    members: p.members,
    archived: p.archived ?? false,
    completed: p.completed ?? false,
  };
}

async function fetchSupabaseProjects(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false });

  if (error) { console.error('fetchSupabaseProjects failed', error); _loading.markLoaded(); notify(); return; }

  _supabaseProjects = (data as ProjectRow[]).map(toProject);
  _loading.markLoaded();
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseProjects();
}

export function isProjectsLoading(): boolean {
  if (isDemoSession()) return false;
  ensureSupabaseFetchStarted();
  return _loading.isLoading();
}

export function resetProjectsCache(): void {
  _supabaseProjects = [];
  _supabaseFetchStarted = false;
  _loading.reset();
}

onLogout(resetProjectsCache);

async function addSupabaseProject(p: Project): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('projects').insert(toRow(p, studioId));
  if (error) {
    console.error('addSupabaseProject failed', error);
    showToast({ type: 'section', message: "Le projet n'a pas pu être créé", subMessage: 'Veuillez réessayer.' });
    return;
  }
  await fetchSupabaseProjects();
}

// Maps only the provided fields to their column names — unlike toRow(),
// this never requires a full Project object, so it can't silently no-op
// when the local cache hasn't populated yet (e.g. an edit fired right
// after route entry, before the background fetch resolved) and it can't
// clobber unrelated columns with a stale cached copy of the rest of the
// row (the "stale cache upsert clobber" bug this codebase has hit before).
function toRowPatch(updates: Partial<Project>): Partial<ProjectRow> {
  const patch: Partial<ProjectRow> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.clientId !== undefined) patch.client_id = updates.clientId;
  if (updates.clientName !== undefined) patch.client_name = updates.clientName;
  if (updates.clientColor !== undefined) patch.client_color = updates.clientColor;
  if (updates.phase !== undefined) patch.phase = updates.phase;
  if (updates.phaseLabel !== undefined) patch.phase_label = updates.phaseLabel;
  if (updates.progress !== undefined) patch.progress = updates.progress;
  if (updates.taskCount !== undefined) patch.task_count = updates.taskCount;
  if (updates.deliverableCount !== undefined) patch.deliverable_count = updates.deliverableCount;
  if (updates.deliveryDate !== undefined) patch.delivery_date = updates.deliveryDate;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.statusLabel !== undefined) patch.status_label = updates.statusLabel;
  if (updates.modifiedAt !== undefined) patch.modified_at = updates.modifiedAt;
  if (updates.budget !== undefined) patch.budget = updates.budget ?? null;
  if (updates.description !== undefined) patch.description = updates.description ?? null;
  if (updates.folderStructureTemplateId !== undefined) patch.folder_structure_template_id = updates.folderStructureTemplateId ?? null;
  if (updates.members !== undefined) patch.members = updates.members;
  if (updates.archived !== undefined) patch.archived = updates.archived;
  if (updates.completed !== undefined) patch.completed = updates.completed;
  return patch;
}

async function updateSupabaseProject(id: string, updates: Partial<Project>): Promise<void> {
  const { error } = await supabase.from('projects').update(toRowPatch(updates)).eq('id', id);
  if (error) {
    console.error('updateSupabaseProject failed', error);
    showToast({ type: 'section', message: "La modification n'a pas pu être enregistrée", subMessage: 'Veuillez réessayer.' });
    return;
  }
  await fetchSupabaseProjects();
}

// ── Public API (unchanged signatures) ─────────────────────────────────────

export function getProjects(): Project[] {
  if (isDemoSession()) {
    return [...PROJECTS, ..._added].map(p =>
      _overrides[p.id] ? { ...p, ..._overrides[p.id] } : p
    );
  }
  ensureSupabaseFetchStarted();
  return _supabaseProjects;
}

export function findProject(id: string): Project | undefined {
  return getProjects().find(p => p.id === id);
}

export function addProject(p: Project): void {
  if (isDemoSession()) {
    _added = [p, ..._added];
    persist();
    notify();
    return;
  }
  void addSupabaseProject(p);
}

export function updateProject(id: string, updates: Partial<Project>): void {
  // Stamp a real timestamp on every edit — modifiedAt is read as a plain
  // ISO string and formatted live (see utils/timeAgo.ts), so this is what
  // makes the "Il y a Xh" badge actually reflect reality instead of being
  // frozen at whatever value the record was created with.
  const stamped = { ...updates, modifiedAt: new Date().toISOString() };
  if (isDemoSession()) {
    _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...stamped } };
    persistOverrides();
    notify();
    return;
  }
  void updateSupabaseProject(id, stamped);
}

export function subscribeProjects(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function archiveProject(id: string): void {
  updateProject(id, { archived: true });
}

export function unarchiveProject(id: string): void {
  updateProject(id, { archived: false });
}

async function removeSupabaseProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) { console.error('removeSupabaseProject failed', error); return; }
  await fetchSupabaseProjects();
}

export function removeProject(id: string): void {
  setSections(id, []);
  deleteEventsForProject(id);
  deleteAllFilesForProject(id);
  getInvoicesByProject(id).forEach(inv => removeInvoice(inv.id));

  if (isDemoSession()) {
    _added = _added.filter(p => p.id !== id);
    const { [id]: _, ...rest } = _overrides;
    _overrides = rest;
    persist();
    persistOverrides();
    notify();
    return;
  }
  _supabaseProjects = _supabaseProjects.filter(p => p.id !== id);
  notify();
  void removeSupabaseProject(id);
}
