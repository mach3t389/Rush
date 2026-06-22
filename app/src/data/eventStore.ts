export interface CalendarEvent {
  id: string;
  title: string;
  eventTypeId: string;
  projectId?: string;
  start: string; // ISO string
  end: string;   // ISO string
  allDay?: boolean;
  description?: string;
  location?: string;
  meetingUrl?: string;
  memberIds?: string[];
}

const STORAGE_KEY = 'sf_calendar_events';

const INITIAL_EVENTS: CalendarEvent[] = [
  { id:'ev1',  title:'Réunion équipe — Campagne Été',     eventTypeId:'reunion',   projectId:'pj1', start:'2026-06-10T10:00', end:'2026-06-10T11:30', memberIds:['lea','sarah','thomas'] },
  { id:'ev2',  title:'Appel client Nova Films',            eventTypeId:'reunion',   projectId:'pj1', start:'2026-06-12T14:00', end:'2026-06-12T15:00', memberIds:['lea','thomas'] },
  { id:'ev3',  title:'Tournage J1 — Collection Été',       eventTypeId:'tournage',  projectId:'pj1', start:'2026-06-15T09:00', end:'2026-06-15T18:00', location:'Loft Paris 10e', memberIds:['lea','sarah','thomas','julie'] },
  { id:'ev4',  title:'Tournage J2 — Portraits',            eventTypeId:'tournage',  projectId:'pj1', start:'2026-06-16T08:00', end:'2026-06-16T17:00', location:'Studio Bastille', memberIds:['lea','sarah','thomas','julie','marc'] },
  { id:'ev5',  title:'Livraison draft vidéo — Bâtisseurs', eventTypeId:'livraison', projectId:'pj2', start:'2026-06-18T10:00', end:'2026-06-18T11:00', memberIds:['julie','marc'] },
  { id:'ev6',  title:'Présentation client',                eventTypeId:'reunion',   projectId:'pj3', start:'2026-06-20T14:00', end:'2026-06-20T16:00', memberIds:['lea','sarah'] },
  { id:'ev7',  title:'Réunion post-production',            eventTypeId:'reunion',   projectId:'pj2', start:'2026-06-22T11:00', end:'2026-06-22T12:30', memberIds:['julie','marc','lea'] },
  { id:'ev8',  title:'Shooting Clip Horizon',              eventTypeId:'tournage',  projectId:'pj4', start:'2026-06-24T08:00', end:'2026-06-24T16:00', location:'Rooftop 11e',   memberIds:['marc','sarah','lea'] },
  { id:'ev9',  title:'Kick-off nouveau projet',            eventTypeId:'reunion',   projectId:'pj4', start:'2026-06-25T11:00', end:'2026-06-25T12:00', memberIds:['lea','marc'] },
  { id:'ev10', title:'Deadline montage final',             eventTypeId:'deadline',  projectId:'pj1', start:'2026-06-28', end:'2026-06-28', allDay:true, memberIds:['julie'] },
  { id:'ev11', title:'Revue budget Q3',                    eventTypeId:'reunion',   projectId:'pj1', start:'2026-06-11T09:00', end:'2026-06-11T09:45', memberIds:['lea','thomas'] },
  { id:'ev12', title:'Session montage v2',                 eventTypeId:'montage',   projectId:'pj2', start:'2026-06-13T13:00', end:'2026-06-13T17:00', memberIds:['julie'] },
];

type Listener = () => void;
const listeners: Listener[] = [];

function notify() { listeners.forEach(l => l()); }

export function subscribeEvents(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

export function getEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CalendarEvent[];
  } catch { /* noop */ }
  return INITIAL_EVENTS;
}

function save(events: CalendarEvent[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* noop */ }
}

export function addEvent(ev: Omit<CalendarEvent, 'id'>): CalendarEvent {
  const newEv: CalendarEvent = { ...ev, id: `ev_${Date.now()}` };
  save([...getEvents(), newEv]);
  notify();
  return newEv;
}

export function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) {
  save(getEvents().map(e => e.id === id ? { ...e, ...patch } : e));
  notify();
}

export function deleteEvent(id: string) {
  save(getEvents().filter(e => e.id !== id));
  notify();
}
