import { MY_TASKS } from './mock';
import type { Task } from '../types';

let _tasks: Task[] = MY_TASKS.map(t => ({ ...t }));
const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

export const getMyTasks = (): Task[] => [..._tasks];

export function updateMyTask(taskId: string, patch: Partial<Task>): void {
  _tasks = _tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
  notify();
}

export function subscribeMyTasks(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
