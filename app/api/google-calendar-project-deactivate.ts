// app/api/google-calendar-project-deactivate.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, getOrgDefaultCalendarId, unshareGoogleCalendar, moveGoogleEvent } from './_lib/googleCalendarApi.js';

interface DeactivateBody {
  studioId: string;
  projectId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId } = req.body as DeactivateBody;
  if (!studioId || !projectId) {
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

  const { data: row, error: rowError } = await supabaseAdmin
    .from('project_google_calendars')
    .select('google_calendar_id, active, shared_contact_ids')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (rowError || !row || !row.active) {
    res.status(200).json({ ok: true, skipped: 'not_active' });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    if (!accessToken) {
      res.status(400).json({ error: 'No Google Calendar connection for this organisation' });
      return;
    }

    const orgDefaultCalendarId = await getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);

    const contactIds = (row.shared_contact_ids ?? []) as string[];
    if (contactIds.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('client_contacts')
        .select('id, email')
        .in('id', contactIds);
      for (const contact of contacts ?? []) {
        if (!contact.email) continue;
        try {
          await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, contact.email as string);
        } catch (err) {
          console.error(`Failed to unshare calendar with ${contact.email}:`, err);
        }
      }
    }

    if (orgDefaultCalendarId) {
      const { data: eventsToMove } = await supabaseAdmin
        .from('events')
        .select('id, google_event_id')
        .eq('project_id', projectId)
        .not('google_event_id', 'is', null);

      for (const ev of eventsToMove ?? []) {
        try {
          await moveGoogleEvent(accessToken, row.google_calendar_id as string, ev.google_event_id as string, orgDefaultCalendarId);
        } catch (err) {
          console.error(`Failed to move event ${ev.id} back to the org default calendar:`, err);
        }
      }
    }

    await supabaseAdmin
      .from('project_google_calendars')
      .update({ active: false, shared_contact_ids: [] })
      .eq('project_id', projectId);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to deactivate project Google Calendar:', error);
    res.status(500).json({ error: 'Failed to deactivate' });
  }
}
