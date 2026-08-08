// app/api/google-calendar-sync.ts
//
// Merged google-calendar-pull.ts + google-calendar-push.ts into one file to
// stay under Vercel Hobby's 12-serverless-function cap (see the 2026-07
// incident in CLAUDE.md — silently broke every prod deploy for over a
// week). The two were never actually the same *request*, just the same
// budget slot: pull is the daily cron sweep (Google → Rush, all studios),
// push is one event's Rush → Google write, triggered by eventStore.ts on
// create/update/delete. They're told apart by their Authorization header,
// which each caller already sends for its own reason (cron secret vs a
// real user's Supabase session) — no change needed to either caller
// beyond pointing at this file's URL instead of the old two.
//
// A third caller was added later: a signed-in user opening a calendar screen
// asks for a pull of their own studio only (`action: 'pull'`), because Vercel
// Hobby caps the cron above at one run per day and waiting until 8am for a
// change made in Google is too slow. Same handler, one studio instead of all.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken, getOrgDefaultCalendarId, resolveEventCalendarId, googleCalendarRequest, toGoogleEventBody, renameGoogleCalendar, resolveProjectCalendarId } from './_lib/googleCalendarApi.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization || '';
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return handlePull(req, res);
  }
  if (req.body && (req.body as { action?: string }).action === 'pull') {
    return handleUserPull(req, res);
  }
  return handlePush(req, res);
}

// Shared by the push and user-pull handlers: both are called by a real
// signed-in user and must confirm the session belongs to a member of the
// studio it claims to act on. Returns an admin client on success, or null
// after having already written the error response.
async function authorizeStudioMember(req: VercelRequest, res: VercelResponse, studioId: string): Promise<SupabaseClient | null> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return null;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return null;
  }

  return supabaseAdmin;
}

// ── Push: one event, Rush → Google (eventStore.ts, on create/update/delete) ──

interface PushBody {
  studioId: string;
  eventId: string;
  action: 'create' | 'update' | 'delete';
  projectId?: string | null;
  googleEventId?: string; // required for 'delete' — the Rush row is already gone by the time this runs
}

async function handlePush(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, eventId, action, projectId, googleEventId } = req.body as PushBody;
  if (!studioId || !eventId || !action) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const supabaseAdmin = await authorizeStudioMember(req, res, studioId);
  if (!supabaseAdmin) return;

  try {
    const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    if (!accessToken) {
      // No Google Calendar connected for this studio — nothing to push, not an error.
      res.status(200).json({ ok: true, skipped: 'not_connected' });
      return;
    }

    if (action === 'delete') {
      if (googleEventId) {
        const calendarId = await resolveEventCalendarId(supabaseAdmin, studioId, projectId ?? null, accessToken);
        if (calendarId) {
          await googleCalendarRequest(accessToken, calendarId, 'DELETE', `/events/${googleEventId}`);
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from('events')
      .select('title, start, "end", all_day, description, location, google_event_id, project_id')
      .eq('id', eventId)
      .eq('studio_id', studioId)
      .single();

    if (eventError || !eventRow) {
      res.status(200).json({ ok: true, skipped: 'event_not_found' });
      return;
    }

    const calendarId = await resolveEventCalendarId(supabaseAdmin, studioId, eventRow.project_id, accessToken);
    if (!calendarId) {
      res.status(200).json({ ok: true, skipped: 'no_calendar' });
      return;
    }

    const body = toGoogleEventBody({
      title: eventRow.title,
      start: eventRow.start,
      end: eventRow.end,
      allDay: eventRow.all_day,
      description: eventRow.description,
      location: eventRow.location,
    });

    if (eventRow.google_event_id) {
      await googleCalendarRequest(accessToken, calendarId, 'PUT', `/events/${eventRow.google_event_id}`, body);
    } else {
      const created = await googleCalendarRequest(accessToken, calendarId, 'POST', '/events', body);
      await supabaseAdmin.from('events').update({ google_event_id: created.id }).eq('id', eventId);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to push event to Google Calendar:', error);
    // Do not fail the response with a 500 that the client would surface as
    // an error toast — a push failure never blocks or rolls back the
    // Rush-side write, it just means Google is out of sync until the
    // connection (or calendar) is fixed.
    res.status(200).json({ ok: false, error: 'push_failed' });
  }
}

// ── Pull: daily cron sweep, Google → Rush, all studios ───────────────────────

interface GoogleEventItem {
  id: string;
  status: 'confirmed' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

async function handlePull(_req: VercelRequest, res: VercelResponse) {
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: connections, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('studio_id');

  if (error) {
    console.error('Failed to load Google Calendar connections:', error);
    res.status(500).json({ error: 'Failed to load connections' });
    return;
  }

  const results: Record<string, string> = {};

  for (const conn of connections ?? []) {
    await pullStudio(supabaseAdmin, conn.studio_id as string, results);
  }

  res.status(200).json({ ok: true, results });
}

// ── User-triggered pull: one studio, Google → Rush ───────────────────────────
//
// Called by eventStore.ts when a signed-in user opens a calendar screen (see
// the throttle there). Same work as one iteration of the cron loop above, but
// scoped to the caller's own studio and authenticated by their session.

async function handleUserPull(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId } = req.body as { studioId?: string };
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const supabaseAdmin = await authorizeStudioMember(req, res, studioId);
  if (!supabaseAdmin) return;

  const results: Record<string, string> = {};
  await pullStudio(supabaseAdmin, studioId, results);
  res.status(200).json({ ok: true, results });
}

// Pulls one studio's org default calendar plus each of its active project
// calendars. Never throws: every failure is recorded in `results` so one bad
// studio (or one bad calendar) can't abort the cron sweep over the others.
async function pullStudio(supabaseAdmin: SupabaseClient, studioId: string, results: Record<string, string>): Promise<void> {
  let accessToken: string | null = null;
  try {
    accessToken = await getValidAccessToken(supabaseAdmin, studioId);
  } catch (err) {
    console.error(`Failed to get access token for studio ${studioId}:`, err);
    results[`studio:${studioId}:default`] = 'error';
    return;
  }
  if (!accessToken) {
    results[`studio:${studioId}:default`] = 'not_connected';
    return;
  }

  try {
    const orgCalendarId = await getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);
    if (orgCalendarId) {
      // Keep the org calendar's Google title in sync with the studio's
      // current name — same bug class as the per-project calendar (see
      // google-calendar-project.ts's activateHandler comment): the name is
      // otherwise only ever set once, at creation/recreation, and a studio
      // rename afterward left it stale in Google forever. Done here (the
      // pull path — cron 1x/day + throttled 1x/2min on-mount) rather than
      // on every push, since push fires per-event and would multiply this
      // extra API call far more than a rename actually needs.
      try {
        const { data: studio } = await supabaseAdmin.from('studios').select('name').eq('id', studioId).maybeSingle();
        if (studio?.name) await renameGoogleCalendar(accessToken, orgCalendarId, `Rushflow — ${studio.name}`);
      } catch (err) {
        console.error(`Failed to resync org calendar name for studio ${studioId}:`, err);
      }
      const { data: connRow } = await supabaseAdmin
        .from('google_calendar_connections')
        .select('sync_token')
        .eq('studio_id', studioId)
        .maybeSingle();

      results[`studio:${studioId}:default`] = await pullCalendar({
        supabaseAdmin, studioId, calendarId: orgCalendarId, accessToken, insertProjectId: null,
        syncToken: connRow?.sync_token ?? null,
        persistSyncToken: async (token) => {
          await supabaseAdmin
            .from('google_calendar_connections')
            .update({ sync_token: token ?? null, last_synced_at: new Date().toISOString() })
            .eq('studio_id', studioId);
        },
      });
    }
  } catch (err) {
    console.error(`Pull failed for studio ${studioId} default calendar:`, err);
    results[`studio:${studioId}:default`] = 'error';
  }

  const { data: projectCals, error: projectCalsError } = await supabaseAdmin
    .from('project_google_calendars')
    .select('project_id, google_calendar_id, sync_token')
    .eq('studio_id', studioId)
    .eq('active', true);

  if (projectCalsError) {
    console.error(`Failed to load project calendars for studio ${studioId}:`, projectCalsError);
    results[`studio:${studioId}:projects`] = 'error';
    return;
  }

  for (const pc of projectCals ?? []) {
    const projectId = pc.project_id as string;
    try {
      // Self-heal FIRST, before renaming or pulling — a calendar deleted
      // directly in Google (not through Rush) was previously only ever
      // detected by the push path (resolveEventCalendarId); the pull path
      // read the stored id straight off the row and just failed silently,
      // forever, every cycle, with the row still showing "active" in the
      // app. resolveProjectCalendarId recreates it under the current
      // account when unreachable, same as activate/sync-access already do.
      const calendarId = await resolveProjectCalendarId(supabaseAdmin, projectId, pc.google_calendar_id as string, accessToken);

      // Same resync-on-pull as the org calendar above — a project's Google
      // Calendar title was previously only ever set at creation/reuse-on-
      // activate, so changing (or removing) the project's client never
      // reached an already-active calendar until the next explicit
      // deactivate/reactivate. Doing it here means a plain page refresh
      // (which triggers this same throttled pull) picks up the rename,
      // matching what a user actually expects to happen.
      try {
        const { data: project } = await supabaseAdmin.from('projects').select('name, client_name').eq('id', projectId).maybeSingle();
        if (project) {
          const calendarName = project.client_name ? `${project.client_name} — ${project.name}` : (project.name as string);
          await renameGoogleCalendar(accessToken, calendarId, calendarName);
        }
      } catch (err) {
        console.error(`Failed to resync calendar name for project ${projectId}:`, err);
      }
      results[`project:${projectId}`] = await pullCalendar({
        supabaseAdmin, studioId, calendarId, accessToken, insertProjectId: projectId,
        // A recreated calendar has no history with Google yet — force a
        // fresh full sync instead of reusing a token scoped to the old,
        // now-gone calendar (Google would just reject it anyway).
        syncToken: calendarId === pc.google_calendar_id ? (pc.sync_token as string | null) : null,
        persistSyncToken: async (token) => {
          await supabaseAdmin
            .from('project_google_calendars')
            .update({ sync_token: token ?? null, last_synced_at: new Date().toISOString() })
            .eq('project_id', projectId);
        },
      });
    } catch (err) {
      console.error(`Pull failed for project calendar ${projectId}:`, err);
      results[`project:${projectId}`] = 'error';
    }
  }
}

interface PullCalendarOpts {
  supabaseAdmin: SupabaseClient;
  studioId: string;
  calendarId: string;
  accessToken: string;
  insertProjectId: string | null;
  syncToken: string | null;
  persistSyncToken: (token: string | undefined) => Promise<void>;
}

async function pullCalendar(opts: PullCalendarOpts): Promise<string> {
  try {
    return await runSync(opts, opts.syncToken);
  } catch (err) {
    if ((err as Error & { status?: number }).status === 410) {
      // Stale/invalidated sync token — Google requires dropping it and
      // starting a fresh full sync, not retrying with the same token.
      return runSync(opts, null);
    }
    throw err;
  }
}

async function runSync(opts: PullCalendarOpts, syncToken: string | null): Promise<string> {
  const { supabaseAdmin, studioId, calendarId, accessToken, insertProjectId, persistSyncToken } = opts;

  const params = new URLSearchParams({ singleEvents: 'true' });
  if (syncToken) {
    params.set('syncToken', syncToken);
  } else {
    // First sync ever for this calendar (or a resync after a stale token) —
    // Google requires a bounded time window instead of a syncToken. Six
    // months back is enough to catch anything a team would plausibly want
    // to see in Rush.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    params.set('timeMin', sixMonthsAgo.toISOString());
  }

  let allItems: GoogleEventItem[] = [];
  let nextSyncToken: string | undefined;
  let pageToken: string | undefined;

  do {
    if (pageToken) params.set('pageToken', pageToken);
    else params.delete('pageToken');

    const data = await googleCalendarRequest(accessToken, calendarId, 'GET', `/events?${params.toString()}`);

    allItems = allItems.concat((data.items ?? []) as GoogleEventItem[]);
    nextSyncToken = data.nextSyncToken;
    pageToken = data.nextPageToken;
  } while (pageToken);

  for (const item of allItems) {
    if (item.status === 'cancelled') {
      await supabaseAdmin.from('events').delete().eq('google_event_id', item.id).eq('studio_id', studioId);
      continue;
    }

    const start = item.start?.dateTime ?? item.start?.date ?? null;
    const end = item.end?.dateTime ?? item.end?.date ?? null;
    if (!start || !end) continue; // malformed event from Google, skip it

    const { data: existing } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('google_event_id', item.id)
      .eq('studio_id', studioId)
      .maybeSingle();

    const fields = {
      title: item.summary ?? '(Sans titre)',
      start,
      end,
      all_day: !item.start?.dateTime,
      description: item.description ?? null,
      location: item.location ?? null,
      google_event_id: item.id,
    };

    if (existing) {
      // Never touch project_id here — an event already in Rush keeps
      // whichever project it's already assigned to (e.g. one just moved
      // into this calendar by the activate endpoint), a pull only updates
      // its content fields.
      await supabaseAdmin.from('events').update(fields).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('events').insert({
        studio_id: studioId,
        project_id: insertProjectId, // null for the org default calendar, the specific project otherwise
        event_type_id: 'autre', // default type for events pulled in from Google — see eventTypeStore.ts
        member_ids: [],
        ...fields,
      });
    }
  }

  await persistSyncToken(nextSyncToken);
  return 'ok';
}
