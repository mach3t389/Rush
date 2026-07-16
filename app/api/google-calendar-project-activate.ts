// app/api/google-calendar-project-activate.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, getOrgDefaultCalendarId, createGoogleCalendar, shareGoogleCalendar, moveGoogleEvent } from './_lib/googleCalendarApi.js';

interface ActivateBody {
  studioId: string;
  projectId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId } = req.body as ActivateBody;
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

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (projectError || !project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    if (!accessToken) {
      res.status(400).json({ error: 'No Google Calendar connection for this organisation' });
      return;
    }

    const orgDefaultCalendarId = await getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);
    if (!orgDefaultCalendarId) {
      res.status(400).json({ error: 'No Google Calendar connection for this organisation' });
      return;
    }

    const { data: existingRow } = await supabaseAdmin
      .from('project_google_calendars')
      .select('google_calendar_id, active')
      .eq('project_id', projectId)
      .maybeSingle();

    let calendarId: string;
    if (existingRow) {
      calendarId = existingRow.google_calendar_id as string;
      if (!existingRow.active) {
        const { error: reactivateError } = await supabaseAdmin
          .from('project_google_calendars')
          .update({ active: true })
          .eq('project_id', projectId);
        if (reactivateError) {
          console.error(`Failed to reactivate project_google_calendars row for project ${projectId}:`, reactivateError);
          res.status(500).json({ error: 'Failed to activate' });
          return;
        }
      }
    } else {
      calendarId = await createGoogleCalendar(accessToken, project.name as string);
      const { error: insertError } = await supabaseAdmin.from('project_google_calendars').insert({
        project_id: projectId,
        studio_id: studioId,
        google_calendar_id: calendarId,
        active: true,
        shared_contact_ids: [],
      });
      if (insertError) {
        if ((insertError as { code?: string }).code === '23505') {
          // Another concurrent activate request already inserted this project's row.
          // The calendar we just created via createGoogleCalendar is now an orphan —
          // abandon it in favour of the row the other request landed, and log it so
          // it's discoverable for future cleanup.
          console.error(
            `Race on project_google_calendars insert for project ${projectId}: unique violation. ` +
            `Abandoning duplicate Google calendar ${calendarId} created by this request; re-selecting existing row.`
          );
          const { data: raceRow, error: raceSelectError } = await supabaseAdmin
            .from('project_google_calendars')
            .select('google_calendar_id')
            .eq('project_id', projectId)
            .maybeSingle();
          if (raceSelectError || !raceRow) {
            console.error(`Failed to re-select project_google_calendars row after race for project ${projectId}:`, raceSelectError);
            res.status(500).json({ error: 'Failed to activate' });
            return;
          }
          calendarId = raceRow.google_calendar_id as string;
        } else {
          console.error(`Failed to insert project_google_calendars row for project ${projectId}:`, insertError);
          res.status(500).json({ error: 'Failed to activate' });
          return;
        }
      }
    }

    // Move any already-synced events for this project from the org default
    // calendar into the project's calendar — same event ID, no duplication.
    const { data: eventsToMove } = await supabaseAdmin
      .from('events')
      .select('id, google_event_id')
      .eq('project_id', projectId)
      .not('google_event_id', 'is', null);

    for (const ev of eventsToMove ?? []) {
      try {
        await moveGoogleEvent(accessToken, orgDefaultCalendarId, ev.google_event_id as string, calendarId);
      } catch (err) {
        console.error(`Failed to move event ${ev.id} into project calendar ${calendarId}:`, err);
      }
    }

    // Share with every client contact currently granted access to this project.
    const { data: access } = await supabaseAdmin
      .from('project_client_access')
      .select('client_contact_id')
      .eq('project_id', projectId);
    const contactIds = (access ?? []).map(row => row.client_contact_id as string);
    const sharedIds: string[] = [];

    if (contactIds.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('client_contacts')
        .select('id, email')
        .in('id', contactIds);
      for (const contact of contacts ?? []) {
        if (!contact.email) continue;
        try {
          await shareGoogleCalendar(accessToken, calendarId, contact.email as string);
          sharedIds.push(contact.id as string);
        } catch (err) {
          console.error(`Failed to share calendar with ${contact.email}:`, err);
        }
      }
    }

    const { error: shareUpdateError } = await supabaseAdmin
      .from('project_google_calendars')
      .update({ shared_contact_ids: sharedIds })
      .eq('project_id', projectId);
    if (shareUpdateError) {
      console.error(`Failed to persist shared_contact_ids for project ${projectId}:`, shareUpdateError);
      res.status(500).json({ error: 'Failed to activate' });
      return;
    }

    res.status(200).json({ ok: true, calendarId });
  } catch (error) {
    console.error('Failed to activate project Google Calendar:', error);
    res.status(500).json({ error: 'Failed to activate' });
  }
}
