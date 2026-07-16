// Reactive calendar-events store.
//
// Demo sessions (isDemoSession() === true): unchanged localStorage-backed
// behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio (see
// studioStore.ts). getEvents() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern clientStore.ts uses.

import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { createLoadingFlag } from './loadingFlag';

async function pushToGoogleCalendar(eventId: string, action: 'create' | 'update' | 'delete', projectId?: string, googleEventId?: string): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/google-calendar-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studioId, eventId, action, projectId, googleEventId }),
    });
  } catch (err) {
    // Fire-and-forget — a push failure must never block the Rush-side write.
    console.error('pushToGoogleCalendar failed', err);
  }
}

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
  googleEventId?: string;
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

// ── Demo (localStorage) path ────────────────────────────────────────────────

function getDemoEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CalendarEvent[];
  } catch { /* noop */ }
  return INITIAL_EVENTS;
}

function saveDemoEvents(events: CalendarEvent[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* noop */ }
}

// ── Real (Supabase-backed) session state ────────────────────────────────────

let _supabaseEvents: CalendarEvent[] = [];
let _supabaseFetchStarted = false;
const _loading = createLoadingFlag();

interface EventRow {
  id: string;
  studio_id: string;
  title: string;
  event_type_id: string;
  project_id: string | null;
  start: string;
  end: string;
  all_day: boolean | null;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  member_ids: string[];
  google_event_id: string | null;
}

function toEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    eventTypeId: row.event_type_id,
    projectId: row.project_id ?? undefined,
    start: row.start,
    end: row.end,
    allDay: row.all_day ?? undefined,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    meetingUrl: row.meeting_url ?? undefined,
    memberIds: row.member_ids ?? undefined,
    googleEventId: row.google_event_id ?? undefined,
  };
}

function toRow(e: CalendarEvent, studioId: string): Omit<EventRow, 'end' | 'google_event_id'> & { end: string } {
  return {
    id: e.id,
    studio_id: studioId,
    title: e.title,
    event_type_id: e.eventTypeId,
    project_id: e.projectId ?? null,
    start: e.start,
    end: e.end,
    all_day: e.allDay ?? null,
    description: e.description ?? null,
    location: e.location ?? null,
    meeting_url: e.meetingUrl ?? null,
    member_ids: e.memberIds ?? [],
  };
}

async function fetchSupabaseEvents(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchSupabaseEvents failed', error); _loading.markLoaded(); notify(); return; }

  _supabaseEvents = (data as EventRow[]).map(toEvent);
  _loading.markLoaded();
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseEvents();
}

export function isEventsLoading(): boolean {
  if (isDemoSession()) return false;
  ensureSupabaseFetchStarted();
  return _loading.isLoading();
}

export function resetEventsCache(): void {
  _supabaseEvents = [];
  _supabaseFetchStarted = false;
  _loading.reset();
}

onLogout(resetEventsCache);

async function addSupabaseEvent(ev: CalendarEvent): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('events').insert(toRow(ev, studioId));
  if (error) { console.error('addSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(ev.id, 'create', ev.projectId);
  await fetchSupabaseEvents();
}

async function updateSupabaseEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseEvents.find(e => e.id === id);
  if (!current) { console.error('updateSupabaseEvent: event not found in cache', id); return; }
  const merged = { ...current, ...patch };
  const { error } = await supabase.from('events').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(id, 'update', merged.projectId);
  await fetchSupabaseEvents();
}

async function deleteSupabaseEvent(id: string): Promise<void> {
  const existing = _supabaseEvents.find(e => e.id === id);
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(id, 'delete', existing?.projectId, existing?.googleEventId);
  await fetchSupabaseEvents();
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getEvents(): CalendarEvent[] {
  if (isDemoSession()) return getDemoEvents();
  ensureSupabaseFetchStarted();
  return _supabaseEvents;
}

export function addEvent(ev: Omit<CalendarEvent, 'id'>): CalendarEvent {
  const newEv: CalendarEvent = { ...ev, id: `ev_${Date.now()}` };
  if (isDemoSession()) {
    saveDemoEvents([...getDemoEvents(), newEv]);
    notify();
    return newEv;
  }
  void addSupabaseEvent(newEv);
  return newEv;
}

export function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) {
  if (isDemoSession()) {
    saveDemoEvents(getDemoEvents().map(e => e.id === id ? { ...e, ...patch } : e));
    notify();
    return;
  }
  void updateSupabaseEvent(id, patch);
}

export function deleteEvent(id: string) {
  if (isDemoSession()) {
    saveDemoEvents(getDemoEvents().filter(e => e.id !== id));
    notify();
    return;
  }
  void deleteSupabaseEvent(id);
}

async function deleteSupabaseEventsForProject(projectId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('project_id', projectId);
  if (error) { console.error('deleteSupabaseEventsForProject failed', error); return; }
  await fetchSupabaseEvents();
}

export function deleteEventsForProject(projectId: string): void {
  if (isDemoSession()) {
    saveDemoEvents(getDemoEvents().filter(e => e.projectId !== projectId));
    notify();
    return;
  }
  void deleteSupabaseEventsForProject(projectId);
}
