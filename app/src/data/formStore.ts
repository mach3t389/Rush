import type { FormInstance, FormResponse } from './templates';

const STORAGE_KEY = 'sf_form_instances';

let _instances: FormInstance[] = loadFromStorage();
const _listeners: Set<() => void> = new Set();

function notify() { _listeners.forEach(fn => fn()); }

function loadFromStorage(): FormInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToStorage(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_instances));
}

export function getFormInstances(): FormInstance[] {
  return _instances;
}

export function getFormInstance(id: string): FormInstance | undefined {
  return _instances.find(i => i.id === id);
}

export function createFormInstance(instance: FormInstance): void {
  _instances = [instance, ..._instances];
  saveToStorage();
  notify();
}

export function updateFormInstance(id: string, responses: FormResponse[], status: 'draft' | 'completed'): void {
  _instances = _instances.map(i =>
    i.id === id ? { ...i, responses, status, updatedAt: new Date().toISOString() } : i
  );
  saveToStorage();
  notify();
}

export function deleteFormInstance(id: string): void {
  _instances = _instances.filter(i => i.id !== id);
  saveToStorage();
  notify();
}

export function subscribeFormStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
