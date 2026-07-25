import { supabase } from './supabaseClient';
import { getStudioId } from './studioStore';

export interface GoogleCalendarStatus {
  connected: boolean;
  lastSyncedAt: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-connection?action=status&studioId=${studioId}`, { headers });
  if (!resp.ok) return { connected: false, lastSyncedAt: null };
  return resp.json();
}

export async function startGoogleCalendarConnect(): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-connection?action=start&studioId=${studioId}`, { headers });
  if (!resp.ok) throw new Error('Failed to start Google Calendar connection');
  const { url } = await resp.json();
  if (!url) throw new Error('No Google Calendar authorization URL returned');
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

export async function activateProjectGoogleCalendar(projectId: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'activate', studioId, projectId }),
  });
  if (!resp.ok) throw new Error('Failed to activate project Google Calendar');
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
