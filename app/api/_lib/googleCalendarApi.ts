import type { SupabaseClient } from '@supabase/supabase-js';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

interface ConnectionRow {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  google_calendar_id: string;
}

// Returns a valid access token for the studio's connection, refreshing it
// first (and persisting the refreshed token) if it's expired or expiring
// within the next minute. Returns null if there's no connection at all.
export async function getValidAccessToken(
  supabaseAdmin: SupabaseClient,
  studioId: string
): Promise<{ accessToken: string; calendarId: string } | null> {
  const { data: connection } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('access_token, refresh_token, access_token_expires_at, google_calendar_id')
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!connection) return null;
  const conn = connection as ConnectionRow;

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return { accessToken: conn.access_token, calendarId: conn.google_calendar_id };
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    console.error('Failed to refresh Google access token:', await tokenRes.text());
    return null;
  }

  const refreshed = await tokenRes.json() as { access_token: string; expires_in: number };

  await supabaseAdmin
    .from('google_calendar_connections')
    .update({
      access_token: refreshed.access_token,
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq('studio_id', studioId);

  return { accessToken: refreshed.access_token, calendarId: conn.google_calendar_id };
}

export async function googleCalendarRequest(
  accessToken: string,
  calendarId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<any> {
  const resp = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (method === 'DELETE') {
    if (!resp.ok && resp.status !== 410 && resp.status !== 404) {
      const err = new Error(`Google Calendar API ${method} ${path} failed: ${resp.status}`) as Error & { status?: number };
      err.status = resp.status;
      throw err;
    }
    return null;
  }

  if (!resp.ok) {
    const err = new Error(`Google Calendar API ${method} ${path} failed: ${resp.status} ${await resp.text()}`) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

// Converts a Rush CalendarEvent row's fields into Google's event body shape.
export function toGoogleEventBody(ev: {
  title: string;
  start: string;
  end: string;
  allDay?: boolean | null;
  description?: string | null;
  location?: string | null;
}) {
  return {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    start: ev.allDay ? { date: ev.start.slice(0, 10) } : { dateTime: ev.start },
    end: ev.allDay ? { date: ev.end.slice(0, 10) } : { dateTime: ev.end },
  };
}
