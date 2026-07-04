// Reactive personal-tasks ("Mes tâches") store.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage behavior — a fully independent list, exactly as before this
// migration.
//
// Real sessions: "Mes tâches" is a computed union of two Supabase sources —
// tasks assigned to the current user across ALL their projects (read from
// the tasks table already built in the project-Tasks chantier, filtered by
// assignee.id), plus freestanding personal tasks (this chantier's own
// my_tasks table). Assigned tasks are never copied — mutating one calls
// taskStore.ts's real updateTask(), so "Mes tâches" and the project view
// always show the same record.

import { MY_TASKS } from './mock';
import type { Task } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout, getCurrentUser } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { updateTask as updateProjectTask } from './taskStore';

const STORAGE_KEY = 'sf_my_tasks';
const SECTIONS_KEY = 'sf_my_task_sections';

let _tasks: Task[] = loadPersisted(STORAGE_KEY, MY_TASKS.map(t => ({ ...t })));
let _sections: string[] = loadPersisted(SECTIONS_KEY, []);
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

// ── Real (Supabase-backed) session state ──────────────────────────────────
let _freestandingTasks: Task[] = [];
let _assignedTasks: Task[] = [];
let _supabaseSectionRows: { id: string; label: string }[] = [];
let _fetchStarted = false;

interface MySectionRow {
  id: string;
  studio_id: string;
  label: string;
  position: number;
}

interface MyTaskRow {
  id: string;
  studio_id: string;
  data: Task;
}

interface ProjectTaskRow {
  id: string;
  studio_id: string;
  project_id: string;
  section_id: string;
  data: Task;
}

async function fetchSupabaseMyTasks(): Promise<void> {
  const studioId = await getStudioId();
  const myUserId = getCurrentUser()?.id;

  const { data: sectionRows, error: sectionsError } = await supabase
    .from('my_sections')
    .select('*')
    .eq('studio_id', studioId)
    .order('position', { ascending: true });

  if (sectionsError) { console.error('fetchSupabaseMyTasks: my_sections failed', sectionsError); return; }

  const { data: freestandingRows, error: freestandingError } = await supabase
    .from('my_tasks')
    .select('*')
    .eq('studio_id', studioId);

  if (freestandingError) { console.error('fetchSupabaseMyTasks: my_tasks failed', freestandingError); return; }

  const { data: projectTaskRows, error: projectTasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('studio_id', studioId);

  if (projectTasksError) { console.error('fetchSupabaseMyTasks: tasks failed', projectTasksError); return; }

  _supabaseSectionRows = ((sectionRows ?? []) as MySectionRow[]).map(r => ({ id: r.id, label: r.label }));
  _freestandingTasks = ((freestandingRows ?? []) as MyTaskRow[]).map(r => r.data);
  _assignedTasks = ((projectTaskRows ?? []) as ProjectTaskRow[])
    .map(r => r.data)
    .filter(t => !!myUserId && t.assignee?.id === myUserId);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabaseMyTasks();
}

export function resetMyTasksCache(): void {
  _freestandingTasks = [];
  _assignedTasks = [];
  _supabaseSectionRows = [];
  _fetchStarted = false;
}

onLogout(resetMyTasksCache);

async function addSupabaseMyTask(task: Task): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('my_tasks').insert({ id: task.id, studio_id: studioId, data: task });
  if (error) { console.error('addSupabaseMyTask failed', error); return; }
  _freestandingTasks = [..._freestandingTasks, task];
  notify();
}

async function removeSupabaseMyTask(taskId: string): Promise<void> {
  if (!_freestandingTasks.some(t => t.id === taskId)) {
    console.warn('removeSupabaseMyTask: refusing to remove an assigned project task from Mes tâches', taskId);
    return;
  }
  const studioId = await getStudioId();
  const { error } = await supabase.from('my_tasks').delete().eq('studio_id', studioId).eq('id', taskId);
  if (error) { console.error('removeSupabaseMyTask failed', error); return; }
  _freestandingTasks = _freestandingTasks.filter(t => t.id !== taskId);
  notify();
}

async function updateSupabaseMyTask(taskId: string, patch: Partial<Task>): Promise<void> {
  const freestanding = _freestandingTasks.find(t => t.id === taskId);
  if (freestanding) {
    const studioId = await getStudioId();
    const merged = { ...freestanding, ...patch };
    const { error } = await supabase.from('my_tasks').update({ data: merged }).eq('studio_id', studioId).eq('id', taskId);
    if (error) { console.error('updateSupabaseMyTask (freestanding) failed', error); return; }
    _freestandingTasks = _freestandingTasks.map(t => t.id === taskId ? merged : t);
    notify();
    return;
  }

  const assigned = _assignedTasks.find(t => t.id === taskId);
  if (assigned) {
    updateProjectTask(assigned.projectId, taskId, patch);
    _assignedTasks = _assignedTasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
    notify();
    return;
  }

  console.error('updateSupabaseMyTask: task not found in either cache', taskId);
}

async function addSupabaseMyTaskSection(label: string): Promise<void> {
  if (_supabaseSectionRows.some(s => s.label === label)) return;
  const studioId = await getStudioId();
  const id = `my-sec-${Date.now()}`;
  const { error } = await supabase.from('my_sections').insert({
    id, studio_id: studioId, label, position: _supabaseSectionRows.length,
  });
  if (error) { console.error('addSupabaseMyTaskSection failed', error); return; }
  _supabaseSectionRows = [..._supabaseSectionRows, { id, label }];
  notify();
}

async function removeSupabaseMyTaskSection(label: string): Promise<void> {
  const studioId = await getStudioId();
  const row = _supabaseSectionRows.find(s => s.label === label);
  if (row) {
    const { error } = await supabase.from('my_sections').delete().eq('studio_id', studioId).eq('id', row.id);
    if (error) { console.error('removeSupabaseMyTaskSection: delete section failed', error); return; }
  }
  _supabaseSectionRows = _supabaseSectionRows.filter(s => s.label !== label);

  const affected = _freestandingTasks.filter(t => t.mySection === label);
  for (const t of affected) {
    const merged: Task = { ...t, mySection: undefined };
    const { error } = await supabase.from('my_tasks').update({ data: merged }).eq('studio_id', studioId).eq('id', t.id);
    if (error) { console.error('removeSupabaseMyTaskSection: clear task section failed', error); continue; }
    _freestandingTasks = _freestandingTasks.map(x => x.id === t.id ? merged : x);
  }
  notify();
}

// ── Public API (unchanged signatures, plus isAssignedTask) ────────────────

export const getMyTasks = (): Task[] => {
  if (isDemoSession()) return [..._tasks];
  ensureSupabaseFetchStarted();
  return [..._assignedTasks, ..._freestandingTasks];
};

export const getMyTaskSections = (): string[] => {
  if (isDemoSession()) return [..._sections];
  ensureSupabaseFetchStarted();
  return _supabaseSectionRows.map(s => s.label);
};

export function addMyTaskSection(label: string): void {
  if (isDemoSession()) {
    if (_sections.includes(label)) return;
    _sections = [..._sections, label];
    savePersisted(SECTIONS_KEY, _sections);
    notify();
    return;
  }
  void addSupabaseMyTaskSection(label);
}

export function removeMyTaskSection(label: string): void {
  if (isDemoSession()) {
    _sections = _sections.filter(s => s !== label);
    _tasks = _tasks.map(t => t.mySection === label ? { ...t, mySection: undefined } : t);
    savePersisted(SECTIONS_KEY, _sections);
    savePersisted(STORAGE_KEY, _tasks);
    notify();
    return;
  }
  void removeSupabaseMyTaskSection(label);
}

export function updateMyTask(taskId: string, patch: Partial<Task>): void {
  if (isDemoSession()) {
    _tasks = _tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
    savePersisted(STORAGE_KEY, _tasks);
    notify();
    return;
  }
  void updateSupabaseMyTask(taskId, patch);
}

export function addMyTask(task: Task): void {
  if (isDemoSession()) {
    _tasks = [..._tasks, task];
    savePersisted(STORAGE_KEY, _tasks);
    notify();
    return;
  }
  void addSupabaseMyTask(task);
}

export function removeMyTask(taskId: string): void {
  if (isDemoSession()) {
    _tasks = _tasks.filter(t => t.id !== taskId);
    savePersisted(STORAGE_KEY, _tasks);
    notify();
    return;
  }
  void removeSupabaseMyTask(taskId);
}

export function isAssignedTask(taskId: string): boolean {
  if (isDemoSession()) return false;
  return _assignedTasks.some(t => t.id === taskId);
}

export function subscribeMyTasks(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
