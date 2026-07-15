import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, googleCalendarRequest } from './_lib/googleCalendarApi.js';

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
    .select('studio_id, sync_token, google_calendar_id');

  if (error) {
    console.error('Failed to load Google Calendar connections:', error);
    res.status(500).json({ error: 'Failed to load connections' });
    return;
  }

  const results: Record<string, string> = {};

  for (const conn of connections ?? []) {
    try {
      results[conn.studio_id] = await pullForStudio(supabaseAdmin, conn.studio_id, conn.sync_token, conn.google_calendar_id);
    } catch (err) {
      console.error(`Pull failed for studio ${conn.studio_id}:`, err);
      results[conn.studio_id] = 'error';
    }
  }

  res.status(200).json({ ok: true, results });
}

async function pullForStudio(
  supabaseAdmin: ReturnType<typeof createClient>,
  studioId: string,
  syncToken: string | null,
  calendarId: string
): Promise<string> {
  const token = await getValidAccessToken(supabaseAdmin, studioId);
  if (!token) return 'not_connected';

  const params = new URLSearchParams();
  if (syncToken) {
    params.set('syncToken', syncToken);
  } else {
    // First sync ever for this studio — Google requires a bounded time
    // window instead of a syncToken. Six months back is enough to catch
    // anything a team would plausibly want to see in Rush.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    params.set('timeMin', sixMonthsAgo.toISOString());
    params.set('singleEvents', 'true');
  }

  const data = await googleCalendarRequest(
    token.accessToken,
    calendarId,
    'GET',
    `/events?${params.toString()}`
  );

  for (const item of (data.items ?? []) as GoogleEventItem[]) {
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
      await supabaseAdmin.from('events').update(fields).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('events').insert({
        studio_id: studioId,
        event_type_id: 'autre', // default type for events pulled in from Google — see eventTypeStore.ts
        member_ids: [],
        ...fields,
      });
    }
  }

  await supabaseAdmin
    .from('google_calendar_connections')
    .update({ sync_token: data.nextSyncToken, last_synced_at: new Date().toISOString() })
    .eq('studio_id', studioId);

  return 'ok';
}
