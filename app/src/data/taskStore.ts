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
import { isDemoSession, onLogout, getCurrentUser } from './authStore';
import { addWatchers } from './watchers';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { normalizeSectionTasks, normalizeTask } from './normalizeTask';
import { addNotif } from './notificationStore';

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
  const merged = persisted ? { ...seeded, ...persisted } : seeded;
  return Object.fromEntries(
    Object.entries(merged).map(([k, sections]) => [k, sections.map(normalizeSectionTasks)])
  );
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
    tasks: trows.filter(t => t.section_id === r.id).map(t => normalizeTask(t.data)),
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

// Same drift problem as getCurrentSectionLabel above, for Project.progress/
// taskCount: real sessions never write these back after the project is
// created (updateProject only touches them when a caller explicitly passes
// new values, which nothing does), so every real project shows 0%/0 tâches
// forever regardless of actual task activity. Demo mode's hand-seeded
// numbers are curated to tell a story and don't necessarily match
// PROJECT_TASKS's real section contents, so they're left untouched.
export function getProjectStats(p: { id: string; progress: number; taskCount: number }): { progress: number; taskCount: number; doneCount: number } {
  if (isDemoSession()) {
    // Demo's hand-seeded progress/taskCount aren't derived from real task
    // data, so doneCount can only be approximated the same lossy way
    // callers used to before this field existed.
    return { progress: p.progress, taskCount: p.taskCount, doneCount: Math.round((p.taskCount * p.progress) / 100) };
  }
  const tasks = getSections(p.id).flatMap(s => s.tasks);
  const taskCount = tasks.length;
  const doneCount = tasks.filter(t => t.checked).length;
  const progress = taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100);
  return { progress, taskCount, doneCount };
}

export function setSections(projectId: string, sections: SectionData[]): void {
  if (isDemoSession()) {
    _store = { ..._store, [projectId]: sections };
    persist();
    notify();
    return;
  }
  // Update the in-memory cache immediately (optimistic), not just after the
  // Supabase round-trip resolves. Consecutive mutations (e.g. delete a
  // section, add a task, then convert tasks to subtasks) each call
  // getSections() synchronously — if the cache only updated at the end of
  // the async write, a mutation fired before an earlier write finished
  // would read a stale pre-write snapshot, and since each write does a full
  // delete-then-recreate, that stale write would clobber the intervening
  // changes once the serialized queue got to it (sections reappearing,
  // added tasks vanishing).
  _supabaseSections[projectId] = sections;
  notify();
  enqueueWrite(projectId, () => writeSupabaseSections(projectId, sections));
}

// sectionLabel lets the caller choose where the deliverable lands (see the
// section picker in TravailOverview.tsx's "add deliverable" form). Left
// unspecified, callers that don't care about placement (RequestApprovalButton,
// VideoReview's comment-to-task) keep the old default: an existing "Livraison"
// section, or a freshly created one — a task always needs *some* section to
// live in, getDeliverables() itself doesn't care which one.
export function addDeliverable(projectId: string, task: Task, sectionLabel = 'Livraison'): void {
  const sections = getSections(projectId);
  const idx = sections.findIndex(s => s.label === sectionLabel);
  let next: SectionData[];
  if (idx >= 0) {
    next = sections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, task] } : s);
  } else {
    next = [...sections, { label: sectionLabel, tasks: [task] }];
  }
  setSections(projectId, next);
}

export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);

  // Une tâche partagée qui passe à « terminée » l'est pour tout le monde :
  // on prévient l'équipe, sinon elle disparaît de la liste des autres
  // assignés sans explication. Seulement au passage non-cochée → cochée, et
  // seulement si la tâche est effectivement partagée.
  const before = sections.flatMap(s => s.tasks).find(t => t.id === taskId);
  if (before && patch.checked === true && before.checked !== true && before.assignees.length > 1) {
    const me = getCurrentUser();
    addNotif({
      kind: 'taskCompleted',
      actor: me?.name ?? 'Rush',
      text: `a terminé « ${before.title} »`,
      timestamp: Date.now(),
      taskId,
      projectId,
      recipientIds: [], // TODO(notifs): cibler les vrais destinataires
    });
  }

  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => {
      if (t.id !== taskId) return t;
      const resolvedPatch = (patch.status !== undefined && patch.correctionsRequested === undefined)
        ? { ...patch, correctionsRequested: false }
        : patch;
      const watchers = resolvedPatch.assignees
        ? addWatchers(t.watchers, resolvedPatch.assignees.map(a => a.id))
        : t.watchers;
      return { ...t, ...resolvedPatch, watchers };
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

export function findLinkedDeliverable(projectId: string, resourceId: string): Task | null {
  return getDeliverables(projectId).find(t => (t.linkedResources ?? []).includes(resourceId)) ?? null;
}

export function moveTask(fromProjectId: string, taskId: string, toProjectId: string, toSectionLabel: string): void {
  let movedTask: Task | null = null;
  const fromSections = getSections(fromProjectId).map(s => {
    const found = s.tasks.find(t => t.id === taskId);
    if (found) movedTask = found;
    return { ...s, tasks: s.tasks.filter(t => t.id !== taskId) };
  });
  if (!movedTask) return;

  // Same project: fold into ONE write. Real (Supabase) sessions persist
  // asynchronously — a second setSections(fromProjectId, ...) right after
  // the first would read back the pre-write cache via getSections() and
  // clobber the removal with stale data, which for setSections' full
  // delete-then-recreate write means losing every other task in the
  // project too, not just duplicating this one.
  if (toProjectId === fromProjectId) {
    const idx = fromSections.findIndex(s => s.label === toSectionLabel);
    const combined = idx >= 0
      ? fromSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, movedTask!] } : s)
      : [...fromSections, { label: toSectionLabel, tasks: [movedTask!] }];
    setSections(fromProjectId, combined);
    return;
  }

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
  // Moving a section into the project it's already in is a no-op (and,
  // via the two-write remove-then-insert below, would hit the same
  // stale-read race described in moveTask above) — nothing to do.
  if (toProjectId === fromProjectId) return;
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

  // Same project: fold into ONE write — see moveTask above for why a
  // second setSections() to the same project right after the first would
  // clobber it with a stale pre-write snapshot on real (Supabase) sessions.
  if (toProjectId === fromProjectId) {
    const idx = fromSections.findIndex(s => s.label === toSectionLabel);
    const combined = idx >= 0
      ? fromSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...movedTasks] } : s)
      : [...fromSections, { label: toSectionLabel, tasks: movedTasks }];
    setSections(fromProjectId, combined);
    return;
  }

  setSections(fromProjectId, fromSections);
  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  if (idx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...movedTasks] } : s));
  } else {
    setSections(toProjectId, [...toSections, { label: toSectionLabel, tasks: movedTasks }]);
  }
}

export function convertTasksToSubtasks(projectId: string, taskIds: string[], targetTaskId: string): void {
  const idSet = new Set(taskIds);
  const movedTasks: Task[] = [];
  const withoutMoved = getSections(projectId).map(s => {
    const kept: Task[] = [];
    s.tasks.forEach(t => { if (idSet.has(t.id)) movedTasks.push(t); else kept.push(t); });
    return { ...s, tasks: kept };
  });
  if (!movedTasks.length) return;

  const next = withoutMoved.map(s => ({
    ...s,
    tasks: s.tasks.map(t => t.id === targetTaskId
      ? { ...t, subtasks: [...(t.subtasks ?? []), ...movedTasks] }
      : t),
  }));
  setSections(projectId, next);
}

// Fills in the top-level fields a promoted subtask needs to behave like a
// real task (it only ever carried a LocalSubtask-shaped subset before) —
// see convertSubtasksToTasks/copySubtasksAsTasks below.
function promoteSubtask(sub: Task, parent: Task, newId?: string): Task {
  return {
    ...sub,
    id: newId ?? sub.id,
    projectId: parent.projectId,
    projectName: parent.projectName,
    projectColor: parent.projectColor,
    priorityLabel: sub.priorityLabel || '',
    dueDate: sub.dueDate || '—',
    dueDateRed: false,
    subtasks: [],
  };
}

function insertIntoSection(toProjectId: string, toSectionLabel: string, tasks: Task[]): void {
  const toSections = getSections(toProjectId);
  const idx = toSections.findIndex(s => s.label === toSectionLabel);
  if (idx >= 0) {
    setSections(toProjectId, toSections.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...tasks] } : s));
  } else {
    setSections(toProjectId, [...toSections, { label: toSectionLabel, tasks }]);
  }
}

// Promotes a subset of `parentTaskId`'s subtasks into standalone tasks,
// removing them from the parent. With no `destination`, they land in the
// same section as their (former) parent; otherwise in the given
// project/section — mirrors moveTasks()'s remove-then-insert shape.
export function convertSubtasksToTasks(
  projectId: string,
  parentTaskId: string,
  subtaskIds: string[],
  destination?: { projectId: string; sectionLabel: string },
): void {
  const sections = getSections(projectId);
  const parent = sections.flatMap(s => s.tasks).find(t => t.id === parentTaskId);
  if (!parent) return;
  const idSet = new Set(subtaskIds);
  const chosen = (parent.subtasks ?? []).filter(s => idSet.has(s.id));
  if (!chosen.length) return;

  const withoutSubtasks = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => t.id === parentTaskId
      ? { ...t, subtasks: (t.subtasks ?? []).filter(x => !idSet.has(x.id)) }
      : t),
  }));

  const promoted = chosen.map(s => promoteSubtask(s, parent));
  const toProjectId = destination?.projectId ?? projectId;
  const toSectionLabel = destination?.sectionLabel
    ?? withoutSubtasks.find(s => s.tasks.some(t => t.id === parentTaskId))?.label;
  if (!toSectionLabel) return;

  if (toProjectId === projectId) {
    // Same project: fold both the removal and the insertion into ONE
    // setSections() call. Real (Supabase) sessions persist writes
    // asynchronously — a second setSections(projectId, ...) right after the
    // first would read back the pre-write cache via getSections() (see
    // insertIntoSection below) and clobber the removal with stale data,
    // leaving the subtask duplicated as both a subtask and a task.
    const idx = withoutSubtasks.findIndex(s => s.label === toSectionLabel);
    const combined = idx >= 0
      ? withoutSubtasks.map((s, i) => i === idx ? { ...s, tasks: [...s.tasks, ...promoted] } : s)
      : [...withoutSubtasks, { label: toSectionLabel, tasks: promoted }];
    setSections(projectId, combined);
  } else {
    setSections(projectId, withoutSubtasks);
    insertIntoSection(toProjectId, toSectionLabel, promoted);
  }
}

// Same as convertSubtasksToTasks, but the chosen subtasks stay on the
// parent — the promoted copies get fresh ids, like copyTasks() does.
export function copySubtasksAsTasks(
  projectId: string,
  parentTaskId: string,
  subtaskIds: string[],
  toProjectId: string,
  toSectionLabel: string,
): void {
  const sections = getSections(projectId);
  const parent = sections.flatMap(s => s.tasks).find(t => t.id === parentTaskId);
  if (!parent) return;
  const idSet = new Set(subtaskIds);
  const chosen = (parent.subtasks ?? []).filter(s => idSet.has(s.id));
  if (!chosen.length) return;

  const copies = chosen.map(s => promoteSubtask(s, parent, `${s.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`));
  insertIntoSection(toProjectId, toSectionLabel, copies);
}

export function subscribeStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
