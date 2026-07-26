import { supabase } from './supabaseClient';
import { getStudioId } from './studioStore';
import { onLogout } from './authStore';

export interface GoogleCalendarStatus {
  connected: boolean;
  lastSyncedAt: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// The connection status barely ever changes (only via connect/disconnect
// below) but was being re-fetched from scratch on every single mount of
// GoogleProjectCalendarButton — every project's calendar page paid a full
// round-trip for a value that's virtually always the same. Cache it in
// memory for the session; connect/disconnect explicitly invalidate it.
let _orgStatusCache: GoogleCalendarStatus | null = null;
let _orgStatusInFlight: Promise<GoogleCalendarStatus> | null = null;

async function fetchGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-connection?action=status&studioId=${studioId}`, { headers });
  if (!resp.ok) return { connected: false, lastSyncedAt: null };
  return resp.json();
}

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  if (_orgStatusCache) return _orgStatusCache;
  if (!_orgStatusInFlight) {
    _orgStatusInFlight = fetchGoogleCalendarStatus()
      .then(status => { _orgStatusCache = status; return status; })
      .finally(() => { _orgStatusInFlight = null; });
  }
  return _orgStatusInFlight;
}

function resetGoogleCalendarStatusCache(): void {
  _orgStatusCache = null;
  _orgStatusInFlight = null;
}

onLogout(resetGoogleCalendarStatusCache);

export async function startGoogleCalendarConnect(): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-connection?action=start&studioId=${studioId}`, { headers });
  if (!resp.ok) throw new Error('Failed to start Google Calendar connection');
  const { url } = await resp.json();
  if (!url) throw new Error('No Google Calendar authorization URL returned');
  // Navigating away for the OAuth redirect anyway, but reset first so a
  // cached "not connected" never survives if the browser bfcaches back here.
  resetGoogleCalendarStatusCache();
  window.location.href = url;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-connection', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'disconnect', studioId }),
  });
  if (!resp.ok) throw new Error('Failed to disconnect Google Calendar');
  resetGoogleCalendarStatusCache();
}

export interface ProjectGoogleCalendarContact {
  id: string;
  name: string;
  email: string;
  shared: boolean;
}

export interface ProjectGoogleCalendarStatus {
  active: boolean;
  contacts: ProjectGoogleCalendarContact[];
}

export async function getProjectGoogleCalendarStatus(projectId: string): Promise<ProjectGoogleCalendarStatus> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-project?action=status&studioId=${studioId}&projectId=${projectId}`, { headers });
  if (!resp.ok) return { active: false, contacts: [] };
  return resp.json();
}

export async function activateProjectGoogleCalendar(projectId: string, opts?: { share?: boolean }): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'activate', studioId, projectId, share: opts?.share ?? true }),
  });
  if (!resp.ok) throw new Error('Failed to activate project Google Calendar');
}

// Shares an already-active project calendar with every client contact
// currently granted access to the project, without touching whether the
// calendar itself is active — used by the "Partager avec le client" button,
// separate from "Créer le calendrier" (which can skip sharing entirely).
export async function shareProjectGoogleCalendarNow(projectId: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync-access', studioId, projectId }),
  });
  if (!resp.ok) throw new Error('Failed to share project Google Calendar');
}

export async function deactivateProjectGoogleCalendar(projectId: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'deactivate', studioId, projectId }),
  });
  if (!resp.ok) throw new Error('Failed to deactivate project Google Calendar');
}
