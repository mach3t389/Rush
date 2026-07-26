// app/api/google-calendar-project.ts
//
// Consolidated per-project Google Calendar sharing endpoint.
// Vercel's Hobby plan caps a deployment at 12 serverless functions, so the
// four previously-separate endpoints (project-status, project-activate,
// project-deactivate, project-sync-access) are merged here and dispatched by
// an `action` param. Each handler body below is a verbatim copy of its
// original file — only the function name and the dispatcher wrapper are new.
//
//   GET  ?action=status&studioId=&projectId= -> { active }        (was google-calendar-project-status)
//   POST { action:'activate', studioId, projectId }   -> { ok, calendarId } (was google-calendar-project-activate)
//   POST { action:'deactivate', studioId, projectId } -> { ok }    (was google-calendar-project-deactivate)
//   POST { action:'sync-access', studioId, projectId } -> { ok }   (was google-calendar-project-sync-access)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, getOrgDefaultCalendarId, createGoogleCalendar, shareGoogleCalendar, unshareGoogleCalendar, moveGoogleEvent } from './_lib/googleCalendarApi.js';

interface ActivateBody {
  studioId: string;
  projectId: string;
  // Defaults to true when omitted, so any other caller keeps today's
  // create-and-share-in-one-step behavior. The "Créer le calendrier" button
  // passes false to create an internal-only calendar without inviting
  // whoever already has project access; "Partager avec le client" then
  // triggers the same share step on demand via the sync-access action.
  share?: boolean;
}

interface DeactivateBody {
  studioId: string;
  projectId: string;
}

interface SyncAccessBody {
  studioId: string;
  projectId: string;
}

async function statusHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const studioId = req.query.studioId as string | undefined;
  const projectId = req.query.projectId as string | undefined;
  if (!studioId || !projectId) {
    res.status(400).json({ error: 'Invalid request' });
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

  const { data: row } = await supabaseAdmin
    .from('project_google_calendars')
    .select('active, shared_contact_ids')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  const { data: access } = await supabaseAdmin
    .from('project_client_access')
    .select('client_contact_id')
    .eq('project_id', projectId);
  const contactIds = (access ?? []).map(r => r.client_contact_id as string);

  let contacts: { id: string; name: string; email: string; shared: boolean }[] = [];
  if (contactIds.length > 0) {
    const sharedIds = new Set((row?.shared_contact_ids ?? []) as string[]);
    const { data: contactRows } = await supabaseAdmin
      .from('client_contacts')
      .select('id, name, email')
      .in('id', contactIds);
    contacts = (contactRows ?? []).map(c => ({
      id: c.id as string,
      name: c.name as string,
      email: c.email as string,
      shared: sharedIds.has(c.id as string),
    }));
  }

  res.status(200).json({ active: !!row?.active, contacts });
}

async function activateHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId, share = true } = req.body as ActivateBody;
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
    .select('id, name, client_name')
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
      // Prefixed with the client's name so multiple projects for the same
      // client (or similarly-named projects across different clients) are
      // distinguishable in the Google Calendar list — a bare project name
      // gives no hint of which client it belongs to.
      const calendarName = project.client_name
        ? `${project.client_name} — ${project.name}`
        : (project.name as string);
      calendarId = await createGoogleCalendar(accessToken, calendarName);
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

    // Share with every client contact currently granted access to this project
    // — skipped when share=false ("Créer le calendrier", internal-only).
    // "Partager avec le client" reaches this same effect afterwards via the
    // sync-access action, which does its own diff against shared_contact_ids.
    if (share) {
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
    }

    res.status(200).json({ ok: true, calendarId });
  } catch (error) {
    console.error('Failed to activate project Google Calendar:', error);
    res.status(500).json({ error: 'Failed to activate' });
  }
}

async function deactivateHandler(req: VercelRequest, res: VercelResponse) {
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
    const stillSharedIds: string[] = [];
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
          stillSharedIds.push(contact.id as string);
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

    const { error: deactivateUpdateError } = await supabaseAdmin
      .from('project_google_calendars')
      .update({ active: false, shared_contact_ids: stillSharedIds })
      .eq('project_id', projectId);
    if (deactivateUpdateError) {
      console.error(`Failed to persist deactivation for project ${projectId}:`, deactivateUpdateError);
      res.status(500).json({ error: 'Failed to deactivate' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to deactivate project Google Calendar:', error);
    res.status(500).json({ error: 'Failed to deactivate' });
  }
}

async function syncAccessHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId } = req.body as SyncAccessBody;
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
      res.status(200).json({ ok: true, skipped: 'not_connected' });
      return;
    }

    const { data: access } = await supabaseAdmin
      .from('project_client_access')
      .select('client_contact_id')
      .eq('project_id', projectId);
    const currentIds = (access ?? []).map(r => r.client_contact_id as string);
    const previousIds = (row.shared_contact_ids ?? []) as string[];

    const toAdd = currentIds.filter(id => !previousIds.includes(id));
    const toRemove = previousIds.filter(id => !currentIds.includes(id));

    if (toAdd.length > 0 || toRemove.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('client_contacts')
        .select('id, email')
        .in('id', [...toAdd, ...toRemove]);
      const emailById = new Map((contacts ?? []).map(c => [c.id as string, c.email as string]));

      const finalIds = new Set(previousIds);
      for (const id of toAdd) {
        const email = emailById.get(id);
        if (!email) continue;
        try {
          await shareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
          finalIds.add(id);
        } catch (err) {
          console.error(`Failed to share calendar with ${email}:`, err);
        }
      }
      for (const id of toRemove) {
        const email = emailById.get(id);
        if (!email) continue;
        try {
          await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
          finalIds.delete(id);
        } catch (err) {
          console.error(`Failed to unshare calendar with ${email}:`, err);
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('project_google_calendars')
        .update({ shared_contact_ids: Array.from(finalIds) })
        .eq('project_id', projectId);
      if (updateError) {
        console.error(`Failed to persist shared_contact_ids for project ${projectId}:`, updateError);
        res.status(500).json({ error: 'Failed to sync access' });
        return;
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to sync project Google Calendar access:', error);
    res.status(200).json({ ok: false, error: 'sync_failed' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string | undefined)
    ?? (req.body && (req.body as { action?: string }).action)
    ?? '';
  switch (action) {
    case 'status': return statusHandler(req, res);
    case 'activate': return activateHandler(req, res);
    case 'deactivate': return deactivateHandler(req, res);
    case 'sync-access': return syncAccessHandler(req, res);
    default:
      res.status(400).json({ error: 'Unknown or missing action' });
  }
}
