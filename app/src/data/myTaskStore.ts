import { MY_TASKS } from './mock';
import type { Task } from '../types';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_my_tasks';

let _tasks: Task[] = loadPersisted(STORAGE_KEY, MY_TASKS.map(t => ({ ...t })));
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

export const getMyTasks = (): Task[] => [..._tasks];

export function updateMyTask(taskId: string, patch: Partial<Task>): void {
  _tasks = _tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
  savePersisted(STORAGE_KEY, _tasks);
  notify();
}

export function subscribeMyTasks(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
