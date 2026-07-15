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
  const resp = await fetch(`/api/google-calendar-status?studioId=${studioId}`, { headers });
  if (!resp.ok) return { connected: false, lastSyncedAt: null };
  return resp.json();
}

export async function startGoogleCalendarConnect(): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-oauth-start?studioId=${studioId}`, { headers });
  if (!resp.ok) throw new Error('Failed to start Google Calendar connection');
  const { url } = await resp.json();
  window.location.href = url;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-disconnect', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studioId }),
  });
  if (!resp.ok) throw new Error('Failed to disconnect Google Calendar');
}
