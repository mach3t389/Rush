import { MY_TASKS } from './mock';
import type { Task } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_my_tasks';
const SECTIONS_KEY = 'sf_my_task_sections';

let _tasks: Task[] = loadPersisted(STORAGE_KEY, MY_TASKS.map(t => ({ ...t })));
let _sections: string[] = loadPersisted(SECTIONS_KEY, []);
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

export const getMyTasks = (): Task[] => [..._tasks];
export const getMyTaskSections = (): string[] => [..._sections];

export function addMyTaskSection(label: string): void {
  if (_sections.includes(label)) return;
  _sections = [..._sections, label];
  savePersisted(SECTIONS_KEY, _sections);
  notify();
}

export function removeMyTaskSection(label: string): void {
  _sections = _sections.filter(s => s !== label);
  // Move tasks from deleted section to "no section"
  _tasks = _tasks.map(t => t.mySection === label ? { ...t, mySection: undefined } : t);
  savePersisted(SECTIONS_KEY, _sections);
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function updateMyTask(taskId: string, patch: Partial<Task>): void {
  _tasks = _tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function addMyTask(task: Task): void {
  _tasks = [..._tasks, task];
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function removeMyTask(taskId: string): void {
  _tasks = _tasks.filter(t => t.id !== taskId);
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function subscribeMyTasks(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
