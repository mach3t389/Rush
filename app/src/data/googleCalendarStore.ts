import { supabase } from './supabaseClient';
import { getStudioId } from './studioStore';
import { onLogout } from './authStore';

export interface GoogleCalendarStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  connectedEmail: string | null;
  connectedName: string | null;
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
  if (!resp.ok) return { connected: false, lastSyncedAt: null, connectedEmail: null, connectedName: null };
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

export interface ProjectGoogleCalendarExtraInvitee {
  email: string;
  shared: boolean;
}

export interface ProjectGoogleCalendarStatus {
  active: boolean;
  contacts: ProjectGoogleCalendarContact[];
  extraInvitees: ProjectGoogleCalendarExtraInvitee[];
}

export async function getProjectGoogleCalendarStatus(projectId: string): Promise<ProjectGoogleCalendarStatus> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-project?action=status&studioId=${studioId}&projectId=${projectId}`, { headers });
  if (!resp.ok) return { active: false, contacts: [], extraInvitees: [] };
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
// Returns whether at least one share/unshare call to Google actually
// failed (e.g. the calendar became briefly unreachable) — the endpoint
// still responds 200/ok in that case (it did what it could and self-heals
// on retry), so this is how the caller tells a real success apart from a
// silent partial failure instead of always showing the same confirmation.
export async function shareProjectGoogleCalendarNow(projectId: string): Promise<{ partialFailure: boolean }> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync-access', studioId, projectId }),
  });
  if (!resp.ok) throw new Error('Failed to share project Google Calendar');
  const data = await resp.json();
  return { partialFailure: !!data.partialFailure };
}

// Adds a manually-entered email to a project calendar's invitee list.
// Pending until the next "Partager" click (shareProjectGoogleCalendarNow) —
// this call never talks to Google itself, it only records intent, exactly
// like a client contact getting project access does before it's shared.
export async function addExtraInvitee(projectId: string, email: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-extra-invitee', studioId, projectId, email }),
  });
  if (!resp.ok) throw new Error('Failed to add invitee');
}

// Removes a manually-entered email — revokes its Google Calendar access
// immediately if it had already been shared, same as removing a client
// contact's project access does.
export async function removeExtraInvitee(projectId: string, email: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remove-extra-invitee', studioId, projectId, email }),
  });
  if (!resp.ok) throw new Error('Failed to remove invitee');
}

// Resends the Google Calendar invite email to someone already shared —
// their "Partagé" status is untouched, this only makes Google re-send the
// notification. Returns false (not a thrown error) when it couldn't
// complete, so the UI can show a specific failure message instead of
// crashing the panel.
export async function resendInvite(projectId: string, email: string): Promise<boolean> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'resend-invite', studioId, projectId, email }),
  });
  if (!resp.ok) return false;
  const data = await resp.json();
  return !!data.ok;
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

// Fire-and-forget: resyncs a project's Google Calendar title to its current
// client right away, instead of waiting for the next throttled/cron pull.
// No-op server-side if the project never activated a calendar. Deliberately
// swallows its own errors — renaming a calendar is cosmetic, it must never
// surface as a failure on the (unrelated) action that triggered it, like
// changing a project's client.
export function renameProjectGoogleCalendarNow(projectId: string): void {
  void (async () => {
    try {
      const studioId = await getStudioId();
      const headers = await authHeaders();
      await fetch('/api/google-calendar-project', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', studioId, projectId }),
      });
    } catch (err) {
      console.error('renameProjectGoogleCalendarNow failed', err);
    }
  })();
}
