// app/api/google-calendar-pull.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, getOrgDefaultCalendarId, googleCalendarRequest } from './_lib/googleCalendarApi.js';

interface GoogleEventItem {
  id: string;
  status: 'confirmed' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

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
    const studioId = conn.studio_id as string;

    let accessToken: string | null = null;
    try {
      accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    } catch (err) {
      console.error(`Failed to get access token for studio ${studioId}:`, err);
      results[`studio:${studioId}:default`] = 'error';
      continue;
    }
    if (!accessToken) {
      results[`studio:${studioId}:default`] = 'not_connected';
      continue;
    }

    try {
      const orgCalendarId = await getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);
      if (orgCalendarId) {
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
      continue;
    }

    for (const pc of projectCals ?? []) {
      const projectId = pc.project_id as string;
      try {
        results[`project:${projectId}`] = await pullCalendar({
          supabaseAdmin, studioId, calendarId: pc.google_calendar_id as string, accessToken, insertProjectId: projectId,
          syncToken: pc.sync_token as string | null,
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

  res.status(200).json({ ok: true, results });
}

interface PullCalendarOpts {
  supabaseAdmin: ReturnType<typeof createClient>;
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
