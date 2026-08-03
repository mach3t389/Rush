// app/api/_lib/googleCalendarApi.ts
import type { SupabaseClient } from '@supabase/supabase-js';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

interface ConnectionRow {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
}

// Returns a valid access token for the studio's connection, refreshing it
// first (and persisting the refreshed token) if it's expired or expiring
// within the next minute. Returns null if there's no connection at all.
// Deliberately does NOT resolve a calendar ID — see getOrgDefaultCalendarId
// and resolveEventCalendarId for that, now that a studio can target more
// than one Google calendar.
export async function getValidAccessToken(
  supabaseAdmin: SupabaseClient,
  studioId: string
): Promise<string | null> {
  const { data: connection } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('access_token, refresh_token, access_token_expires_at')
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!connection) return null;
  const conn = connection as ConnectionRow;

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return conn.access_token;
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

  return refreshed.access_token;
}

// Returns the organisation's default calendar ID (used for every event that
// isn't in an actively-shared project calendar). The stored value used to
// be the literal string "primary" (the connecting user's own personal
// Google calendar) — the first time this runs for a studio still on that,
// it creates a dedicated "Rush — <organisation>" calendar, moves every
// already-synced event over to it, and persists the new ID, so Rush events
// stop mixing into that person's personal calendar.
export async function getOrgDefaultCalendarId(
  supabaseAdmin: SupabaseClient,
  studioId: string,
  accessToken: string
): Promise<string | null> {
  const { data: connection } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('google_calendar_id')
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!connection) return null;
  const storedId = connection.google_calendar_id as string;

  if (storedId !== 'primary') {
    if (await googleCalendarExists(accessToken, storedId)) {
      return storedId;
    }
    // Stale: the studio disconnected the Google account that owned this
    // calendar and connected a different one. The old calendar isn't
    // reachable under the new account's token, so events can't be moved out
    // of it — recreate a dedicated calendar and clear the stale links
    // instead, so the next push recreates each event fresh.
    return recreateOrgCalendar(supabaseAdmin, studioId, accessToken, storedId, { moveEvents: false });
  }

  return recreateOrgCalendar(supabaseAdmin, studioId, accessToken, 'primary', { moveEvents: true });
}

async function recreateOrgCalendar(
  supabaseAdmin: SupabaseClient,
  studioId: string,
  accessToken: string,
  previousCalendarId: string,
  opts: { moveEvents: boolean }
): Promise<string> {
  const { data: studio } = await supabaseAdmin
    .from('studios')
    .select('name')
    .eq('id', studioId)
    .maybeSingle();

  const dedicatedName = `Rush — ${studio?.name ?? 'Organisation'}`;
  const newCalendarId = await createGoogleCalendar(accessToken, dedicatedName);

  const { data: eventsToMigrate } = await supabaseAdmin
    .from('events')
    .select('id, google_event_id')
    .eq('studio_id', studioId)
    .not('google_event_id', 'is', null);

  if (opts.moveEvents) {
    for (const ev of eventsToMigrate ?? []) {
      try {
        await moveGoogleEvent(accessToken, previousCalendarId, ev.google_event_id as string, newCalendarId);
      } catch (err) {
        console.error(`Failed to move event ${ev.id} to the dedicated organisation calendar during migration:`, err);
      }
    }
  } else {
    for (const ev of eventsToMigrate ?? []) {
      await supabaseAdmin.from('events').update({ google_event_id: null }).eq('id', ev.id as string);
    }
  }

  // Compare-and-swap: only persist if the row still points at the calendar
  // ID we started from. Two concurrent callers (e.g. a push racing the
  // 15-minute cron pull) can both read the same stale/primary ID above and
  // both create their own replacement calendar — the `.eq(...)` filter here
  // ensures only the first update to actually run wins the migration; the
  // loser detects that it affected zero rows and defers to whatever the
  // winner persisted, instead of silently overwriting it and orphaning the
  // winner's calendar.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('google_calendar_connections')
    .update({ google_calendar_id: newCalendarId })
    .eq('studio_id', studioId)
    .eq('google_calendar_id', previousCalendarId)
    .select('google_calendar_id');

  if (updateError) {
    console.error(`Failed to persist dedicated calendar for studio ${studioId}:`, updateError);
    return newCalendarId; // best-effort: at least this call's events were moved to a real calendar
  }

  if (!updated || updated.length === 0) {
    // Lost the race — another concurrent call already migrated this studio's
    // default calendar between our initial read and this update. Abandon the
    // calendar we just created (log it clearly so it's discoverable/cleanable
    // later — do not attempt automated deletion here) and use whichever
    // calendar the winning call actually persisted.
    console.error(`Abandoned duplicate calendar ${newCalendarId} for studio ${studioId} — another concurrent request already migrated this studio's default calendar.`);
    const { data: winner } = await supabaseAdmin
      .from('google_calendar_connections')
      .select('google_calendar_id')
      .eq('studio_id', studioId)
      .maybeSingle();
    return (winner?.google_calendar_id as string) ?? newCalendarId;
  }

  return newCalendarId;
}

// Resolves which Google calendar a given event should target: its
// project's calendar if that project has an active shared calendar,
// otherwise the organisation's default calendar.
export async function resolveEventCalendarId(
  supabaseAdmin: SupabaseClient,
  studioId: string,
  projectId: string | null,
  accessToken: string
): Promise<string | null> {
  if (projectId) {
    const { data: projectCal } = await supabaseAdmin
      .from('project_google_calendars')
      .select('google_calendar_id')
      .eq('project_id', projectId)
      .eq('active', true)
      .maybeSingle();
    if (projectCal) {
      const storedId = projectCal.google_calendar_id as string;
      if (await googleCalendarExists(accessToken, storedId)) {
        return storedId;
      }
      return recreateProjectCalendar(supabaseAdmin, projectId, accessToken, storedId);
    }
  }
  return getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);
}

// Same stale-calendar situation as recreateOrgCalendar, scoped to one
// project's calendar: the stored ID belongs to a Google account the studio
// has since disconnected, so it can't be reached (or moved out of) with the
// currently connected account's token. Recreate it fresh and clear this
// project's stale event links so the next push recreates each event.
async function recreateProjectCalendar(
  supabaseAdmin: SupabaseClient,
  projectId: string,
  accessToken: string,
  previousCalendarId: string
): Promise<string> {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('name, client_name')
    .eq('id', projectId)
    .maybeSingle();

  const calendarName = project?.client_name
    ? `${project.client_name} — ${project.name}`
    : ((project?.name as string | undefined) ?? 'Projet');
  const newCalendarId = await createGoogleCalendar(accessToken, calendarName);

  // Compare-and-swap, same reasoning as recreateOrgCalendar: only persist if
  // the row still points at the calendar ID we started from, so a
  // concurrent caller recreating the same project's calendar can't clobber
  // this one (or vice versa).
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('project_google_calendars')
    .update({ google_calendar_id: newCalendarId, shared_contact_ids: [] })
    .eq('project_id', projectId)
    .eq('google_calendar_id', previousCalendarId)
    .select('google_calendar_id');

  if (updateError) {
    console.error(`Failed to persist recreated calendar for project ${projectId}:`, updateError);
    return newCalendarId;
  }

  if (!updated || updated.length === 0) {
    console.error(`Abandoned duplicate calendar ${newCalendarId} for project ${projectId} — another concurrent request already recreated this project's calendar.`);
    const { data: winner } = await supabaseAdmin
      .from('project_google_calendars')
      .select('google_calendar_id')
      .eq('project_id', projectId)
      .maybeSingle();
    return (winner?.google_calendar_id as string) ?? newCalendarId;
  }

  await supabaseAdmin
    .from('events')
    .update({ google_event_id: null })
    .eq('project_id', projectId)
    .not('google_event_id', 'is', null);

  return newCalendarId;
}

export async function googleCalendarRequest(
  accessToken: string,
  calendarId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<any> {
  return googleCalendarAdminRequest(accessToken, method, `/calendars/${encodeURIComponent(calendarId)}${path}`, body);
}

// For calls not scoped to a single calendar's /events sub-path: creating a
// calendar, managing a calendar's ACL, or moving an event between calendars.
export async function googleCalendarAdminRequest(
  accessToken: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<any> {
  const resp = await fetch(`${CALENDAR_BASE}${path}`, {
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
  if (resp.status === 204) return null;
  return resp.json();
}

export async function createGoogleCalendar(accessToken: string, name: string): Promise<string> {
  const created = await googleCalendarAdminRequest(accessToken, 'POST', '/calendars', { summary: name });
  return created.id as string;
}

// Checks whether a stored calendar ID is still reachable under the
// currently connected Google account. Returns false (not an error) when
// Google reports the calendar as gone or inaccessible — this is the normal
// outcome after a studio disconnects one Google account and connects a
// different one, since the stored ID still points at a calendar owned by
// the old account. Any other failure (network, auth) is rethrown so it
// isn't mistaken for a legitimate "recreate the calendar" case.
export async function googleCalendarExists(accessToken: string, calendarId: string): Promise<boolean> {
  try {
    await googleCalendarAdminRequest(accessToken, 'GET', `/calendars/${encodeURIComponent(calendarId)}`);
    return true;
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 404 || status === 410 || status === 403) return false;
    throw err;
  }
}

// role: 'reader' only — shared project calendars are always read-only for
// clients (see the design's non-goals). Idempotent: Google returns 409 if
// this exact user already has a rule on the calendar, which is treated as
// success rather than an error.
export async function shareGoogleCalendar(accessToken: string, calendarId: string, email: string): Promise<void> {
  try {
    await googleCalendarAdminRequest(accessToken, 'POST', `/calendars/${encodeURIComponent(calendarId)}/acl`, {
      role: 'reader',
      scope: { type: 'user', value: email },
    });
  } catch (err) {
    if ((err as Error & { status?: number }).status === 409) return;
    throw err;
  }
}

// The ACL rule ID for a user-scoped grant is deterministically "user:<email>".
export async function unshareGoogleCalendar(accessToken: string, calendarId: string, email: string): Promise<void> {
  await googleCalendarAdminRequest(
    accessToken,
    'DELETE',
    `/calendars/${encodeURIComponent(calendarId)}/acl/${encodeURIComponent('user:' + email)}`
  );
}

// Moves an event between two calendars owned by the same connected Google
// account, preserving its event ID — this is how activating/deactivating a
// project's calendar avoids ever duplicating an event.
export async function moveGoogleEvent(
  accessToken: string,
  sourceCalendarId: string,
  eventId: string,
  destinationCalendarId: string
): Promise<void> {
  await googleCalendarAdminRequest(
    accessToken,
    'POST',
    `/calendars/${encodeURIComponent(sourceCalendarId)}/events/${encodeURIComponent(eventId)}/move?destination=${encodeURIComponent(destinationCalendarId)}`
  );
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
