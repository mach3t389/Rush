export interface EventType {
  id: string;
  label: string;
  color: string;
  icon: string;
  builtIn?: boolean; // built-in types can't be deleted
}

const STORAGE_KEY = 'sf_event_types';

const DEFAULT_TYPES: EventType[] = [
  { id: 'tournage',  label: 'Tournage',   color: '#e85b7a', icon: 'video',          builtIn: true },
  { id: 'livraison', label: 'Livraison',  color: '#f5975b', icon: 'package',        builtIn: true },
  { id: 'reunion',   label: 'Réunion',    color: '#5b8af5', icon: 'users',          builtIn: true },
  { id: 'deadline',  label: 'Échéance',   color: '#c45be8', icon: 'alert-circle',   builtIn: true },
  { id: 'montage',   label: 'Montage',    color: '#34c98a', icon: 'scissors',       builtIn: true },
  { id: 'autre',     label: 'Autre',      color: '#888',    icon: 'circle',         builtIn: true },
];

type Listener = () => void;
const listeners: Listener[] = [];

function notify() { listeners.forEach(l => l()); }

export function subscribeEventTypes(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

export function getEventTypes(): EventType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EventType[];
  } catch { /* noop */ }
  return DEFAULT_TYPES;
}

function save(types: EventType[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(types)); } catch { /* noop */ }
}

export function addEventType(type: Omit<EventType, 'id'>): EventType {
  const newType: EventType = { ...type, id: `et_${Date.now()}` };
  const types = [...getEventTypes(), newType];
  save(types);
  notify();
  return newType;
}

export function updateEventType(id: string, patch: Partial<Omit<EventType, 'id' | 'builtIn'>>) {
  const types = getEventTypes().map(t => t.id === id ? { ...t, ...patch } : t);
  save(types);
  notify();
}

export function deleteEventType(id: string) {
  const types = getEventTypes().filter(t => t.id !== id || t.builtIn);
  save(types);
  notify();
}

export function getEventTypeById(id: string): EventType | undefined {
  return getEventTypes().find(t => t.id === id);
}
