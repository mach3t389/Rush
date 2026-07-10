// Reactive task store, keyed by projectId.
//
// Every mutating function below except getSections/setSections is a pure
// wrapper around them — moveTask, moveSection, copyTasks, copySection,
// moveTasks, updateTask, deleteTask, addDeliverable all read via
// getSections() and write via setSections(). So only those two functions
// need to branch on demo/real; everything else keeps working unmodified.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase (sections + tasks tables), scoped to
// the user's studio. setSections() does a full replace (delete all
// sections+tasks for the project, then re-insert from the given array)
// rather than a surgical diff — see the plan's Global Constraints for why.

import { PROJECT_TASKS } from './mock';
import type { Task, SectionData } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

type ProjectStore = Record<string, SectionData[]>;

const STORAGE_KEY = 'sf_project_tasks';

function seedStore(): ProjectStore {
  return Object.fromEntries(
    Object.entries(PROJECT_TASKS).map(([k, sections]) => [
      k,
      sections.map(s => ({ ...s, tasks: s.tasks.map(t => ({ ...t })) })),
    ])
  );
}

let _store: ProjectStore = (() => {
  const seeded = seedStore();
  const persisted = loadPersisted<ProjectStore | null>(STORAGE_KEY, null);
  return persisted ? { ...seeded, ...persisted } : seeded;
})();

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _store); }

// ── Real (Supabase-backed) session state ──────────────────────────────────
const _supabaseSections: Record<string, SectionData[]> = {};
const _fetchedProjectIds = new Set<string>();
const _loadingProjectIds = new Set<string>();

// setSections() fires writes fire-and-forget. Two writes to the SAME project
// in quick succession (e.g. "add a section" immediately followed by "add a
// task to it") would otherwise overlap: writeSupabaseSections() does a full
// delete-then-recreate, so a second write's delete can remove the first
// write's just-inserted section before its task insert (which references
// that section's id) has run, causing a foreign-key violation. Chaining each
// project's writes onto a per-project queue serializes them without needing
// a surgical diff — writes to DIFFERENT projects still run concurrently.
const _writeQueues: Record<string, Promise<void>> = {};

function enqueueWrite(projectId: string, run: () => Promise<void>): void {
  const previous = _writeQueues[projectId] ?? Promise.resolve();
  _writeQueues[projectId] = previous.then(run, run);
}

interface SectionRow {
  id: string;
  studio_id: string;
  project_id: string;
  label: string;
  position: number;
  completed: boolean;
}

interface TaskRow {
  id: string;
  studio_id: string;
  project_id: string;
  section_id: string;
  data: Task;
}

async function fetchSupabaseSections(projectId: string): Promise<void> {
  const studioId = await getStudioId();

  const { data: sectionRows, error: sectionsError } = await supabase
    .from('sections')
    .select('*')
    .eq('studio_id', studioId)
    .eq('project_id', projectId)
    .order('position', { ascending: true });

  if (sectionsError) { console.error('fetchSupabaseSections: sections failed', sectionsError); _loadingProjectIds.delete(projectId); notify(); return; }

  const { data: taskRows, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('studio_id', studioId)
    .eq('project_id', projectId);

  if (tasksError) { console.error('fetchSupabaseSections: tasks failed', tasksError); _loadingProjectIds.delete(projectId); notify(); return; }

  const rows = (sectionRows ?? []) as SectionRow[];
  const trows = (taskRows ?? []) as TaskRow[];

  _supabaseSections[projectId] = rows.map(r => ({
    label: r.label,
    completed: r.completed,
    tasks: trows.filter(t => t.section_id === r.id).map(t => t.data),
  }));
  _loadingProjectIds.delete(projectId);
  notify();
}

export function isSectionsLoading(projectId: string): boolean {
  if (isDemoSession()) return false;
  ensureSupabaseFetchStarted(projectId);
  return _loadingProjectIds.has(projectId);
}

function ensureSupabaseFetchStarted(projectId: string): void {
  if (_fetchedProjectIds.has(projectId)) return;
  _fetchedProjectIds.add(projectId);
  _loadingProjectIds.add(projectId);
  void fetchSupabaseSections(projectId);
}

async function writeSupabaseSections(projectId: string, sections: SectionData[]): Promise<void> {
  const studioId = await getStudioId();

  const { error: deleteError } = await supabase
    .from('sections')
    .delete()
    .eq('studio_id', studioId)
    .eq('project_id', projectId);

  if (deleteError) { console.error('writeSupabaseSections: delete failed', deleteError); return; }

  const sectionRows: SectionRow[] = sections.map((s, i) => ({
    id: `sec-${Date.now()}-${i}`,
    studio_id: studioId,
    project_id: projectId,
    label: s.label,
    position: i,
    completed: s.completed ?? false,
  }));

  if (sectionRows.length > 0) {
    const { error: insertSectionsError } = await supabase.from('sections').insert(sectionRows);
    if (insertSectionsError) { console.error('writeSupabaseSections: insert sections failed', insertSectionsError); return; }
  }

  const taskRows: TaskRow[] = sections.flatMap((s, i) =>
    s.tasks.map(t => ({
      id: t.id,
      studio_id: studioId,
      project_id: projectId,
      section_id: sectionRows[i].id,
      data: t,
    }))
  );

  if (taskRows.length > 0) {
    const { error: insertTasksError } = await supabase.from('tasks').insert(taskRows);
    if (insertTasksError) { console.error('writeSupabaseSections: insert tasks failed', insertTasksError); return; }
  }

  _supabaseSections[projectId] = sections;
  notify();
}

export function resetTasksCache(): void {
  Object.keys(_supabaseSections).forEach(k => delete _supabaseSections[k]);
  _fetchedProjectIds.clear();
}

onLogout(resetTasksCache);

// ── Public API (unchanged signatures) ─────────────────────────────────────

export function getSections(projectId: string): SectionData[] {
  if (isDemoSession()) return _store[projectId] ?? [];
  ensureSupabaseFetchStarted(projectId);
  return _supabaseSections[projectId] ?? [];
}

// A project's stored phaseLabel is set once at creation and never updated,
// so it drifts out of sync as work progresses through sections — this reads
// the real current section (first incomplete one, or the last section once
// everything is done) so displays show where the project actually is.
export function getCurrentSectionLabel(projectId: string): string | null {
  const sections = getSections(projectId);
  if (sections.length === 0) return null;
  return (sections.find(s => !s.completed) ?? sections[sections.length - 1]).label;
}

export function setSections(projectId: string, sections: SectionData[]): void {
  if (isDemoSession()) {
    _store = { ..._store, [projectId]: sections };
    persist();
    notify();
    return;
  }
  enqueueWrite(projectId, () => writeSupabaseSections(projectId, sections));
}

export function addDeliverable(projectId: string, task: Task): void {
  const sections = getSections(projectId);
  const SECTION = 'Livraison';
  const idx = sections.findIndex(s => s.label === SECTION);
  let next: SectionData[];
  if (idx >= 0) {
    next = sections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, task] } : s);
  } else {
    next = [...sections, { label: SECTION, tasks: [task] }];
  }
  setSections(projectId, next);
}

export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => {
      if (t.id !== taskId) return t;
      const resolvedPatch = (patch.status !== undefined && patch.correctionsRequested === undefined)
        ? { ...patch, correctionsRequested: false }
        : patch;
      return { ...t, ...resolvedPatch };
    }),
  }));
  setSections(projectId, next);
}

export function deleteTask(projectId: string, taskId: string): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== taskId) }));
  setSections(projectId, next);
}

export function getDeliverables(projectId: string): Task[] {
  return getSections(projectId).flatMap(s => s.tasks).filter(t => t.deliverable);
}

export function moveTask(fromProjectId: string, taskId: string, toProjectId: string, toSectionLabel: string): void {
  let movedTask: Task | null = null;
  const fromSections = getSections(fromProjectId).map(s => {
    const found = s.tasks.find(t => t.id === taskId);
    if (found) movedTask = found;
    return { ...s, tasks: s.tasks.filter(t => t.id !== taskId) };
  });
  if (!movedTask) return;
  setSections(fromProjectId, fromSections);

  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  let nextTo: SectionData[];
  if (idx >= 0) {
    nextTo = toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, movedTask!] } : s);
  } else {
    nextTo = [...toSections, { label: toSectionLabel, tasks: [movedTask!] }];
  }
  setSections(toProjectId, nextTo);
}

export function moveSection(fromProjectId: string, sectionLabel: string, toProjectId: string): void {
  const fromSections = getSections(fromProjectId);
  const section = fromSections.find(s => s.label === sectionLabel);
  if (!section) return;
  setSections(fromProjectId, fromSections.filter(s => s.label !== sectionLabel));
  const toSections = getSections(toProjectId);
  const existingIdx = toSections.findIndex(s => s.label === sectionLabel);
  if (existingIdx >= 0) {
    const merged = toSections.map((s, i) => i === existingIdx ? { ...s, tasks: [...s.tasks, ...section.tasks] } : s);
    setSections(toProjectId, merged);
  } else {
    setSections(toProjectId, [...toSections, { ...section }]);
  }
}

export function copyTasks(taskIds: string[], fromProjectId: string, toProjectId: string, toSectionLabel: string): void {
  const idSet = new Set(taskIds);
  const originals: Task[] = [];
  getSections(fromProjectId).forEach(s => s.tasks.forEach(t => { if (idSet.has(t.id)) originals.push(t); }));
  if (!originals.length) return;
  const copies = originals.map(t => ({ ...t, id: `${t.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  if (idx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...copies] } : s));
  } else {
    setSections(toProjectId, [...toSections, { label: toSectionLabel, tasks: copies }]);
  }
}

export function copySection(fromProjectId: string, sectionLabel: string, toProjectId: string): void {
  const section = getSections(fromProjectId).find(s => s.label === sectionLabel);
  if (!section) return;
  const copies = section.tasks.map(t => ({ ...t, id: `${t.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
  const toSections = getSections(toProjectId);
  const existingIdx = toSections.findIndex(s => s.label === sectionLabel);
  if (existingIdx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === existingIdx ? { ...s, tasks: [...s.tasks, ...copies] } : s));
  } else {
    setSections(toProjectId, [...toSections, { ...section, tasks: copies }]);
  }
}

export function moveTasks(fromProjectId: string, taskIds: string[], toProjectId: string, toSectionLabel: string): void {
  const idSet = new Set(taskIds);
  const movedTasks: Task[] = [];
  const fromSections = getSections(fromProjectId).map(s => {
    const kept: Task[] = [];
    s.tasks.forEach(t => { if (idSet.has(t.id)) movedTasks.push(t); else kept.push(t); });
    return { ...s, tasks: kept };
  });
  setSections(fromProjectId, fromSections);
  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  if (idx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...movedTasks] } : s));
  } else {
    setSections(toProjectId, [...toSections, { label: toSectionLabel, tasks: movedTasks }]);
  }
}

export function subscribeStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
