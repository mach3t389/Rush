import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, googleCalendarRequest, toGoogleEventBody } from './_lib/googleCalendarApi.js';

interface PushBody {
  studioId: string;
  eventId: string;
  action: 'create' | 'update' | 'delete';
  googleEventId?: string; // required for 'delete' — the Rush row is already gone by the time this runs
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, eventId, action, googleEventId } = req.body as PushBody;
  if (!studioId || !eventId || !action) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  try {
    const conn = await getValidAccessToken(supabaseAdmin, studioId);
    if (!conn) {
      // No Google Calendar connected for this studio — nothing to push, not an error.
      res.status(200).json({ ok: true, skipped: 'not_connected' });
      return;
    }

    if (action === 'delete') {
      if (googleEventId) {
        await googleCalendarRequest(conn.accessToken, conn.calendarId, 'DELETE', `/events/${googleEventId}`);
      }
      res.status(200).json({ ok: true });
      return;
    }

    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from('events')
      .select('title, start, "end", all_day, description, location, google_event_id')
      .eq('id', eventId)
      .eq('studio_id', studioId)
      .single();

    if (eventError || !eventRow) {
      res.status(200).json({ ok: true, skipped: 'event_not_found' });
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
      await googleCalendarRequest(conn.accessToken, conn.calendarId, 'PUT', `/events/${eventRow.google_event_id}`, body);
    } else {
      const created = await googleCalendarRequest(conn.accessToken, conn.calendarId, 'POST', '/events', body);
      await supabaseAdmin.from('events').update({ google_event_id: created.id }).eq('id', eventId);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to push event to Google Calendar:', error);
    // Do not fail the response with a 500 that the client would surface as
    // an error toast — per the design, a push failure never blocks or rolls
    // back the Rush-side write, it just means Google is out of sync until
    // the connection is fixed.
    res.status(200).json({ ok: false, error: 'push_failed' });
  }
}
