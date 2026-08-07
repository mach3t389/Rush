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
import { getValidAccessToken, getOrgDefaultCalendarId, createGoogleCalendar, googleCalendarExists, shareGoogleCalendar, unshareGoogleCalendar, moveGoogleEvent } from './_lib/googleCalendarApi.js';

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
    .select('active, shared_contact_ids, extra_invitees, extra_invitees_shared')
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

  const extraSharedSet = new Set((row?.extra_invitees_shared ?? []) as string[]);
  const extraInvitees = ((row?.extra_invitees ?? []) as string[]).map(email => ({
    email,
    shared: extraSharedSet.has(email),
  }));

  res.status(200).json({ active: !!row?.active, contacts, extraInvitees });
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

    // Prefixed with the client's name so multiple projects for the same
    // client (or similarly-named projects across different clients) are
    // distinguishable in the Google Calendar list — a bare project name
    // gives no hint of which client it belongs to.
    const calendarName = project.client_name
      ? `${project.client_name} — ${project.name}`
      : (project.name as string);

    let calendarId: string;
    // A stored calendar ID can be unreachable under the current access token
    // even when a row already exists: the studio disconnected the Google
    // account that owned it and connected a different one. Reusing it
    // blindly would 404 on every later sync call, so check reachability
    // before trusting it and transparently recreate under the current
    // account when it's gone.
    const existingReachable = existingRow
      ? await googleCalendarExists(accessToken, existingRow.google_calendar_id as string)
      : false;

    if (existingRow && existingReachable) {
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
    } else if (existingRow) {
      // Stale row: recreate the calendar under the currently connected
      // account and update the row in place (not insert — the row already
      // exists for this project).
      calendarId = await createGoogleCalendar(accessToken, calendarName);
      const { error: updateError } = await supabaseAdmin
        .from('project_google_calendars')
        .update({ google_calendar_id: calendarId, active: true, shared_contact_ids: [], extra_invitees: [], extra_invitees_shared: [] })
        .eq('project_id', projectId);
      if (updateError) {
        console.error(`Failed to persist recreated calendar for project ${projectId}:`, updateError);
        res.status(500).json({ error: 'Failed to activate' });
        return;
      }
    } else {
      calendarId = await createGoogleCalendar(accessToken, calendarName);
      const { error: insertError } = await supabaseAdmin.from('project_google_calendars').insert({
        project_id: projectId,
        studio_id: studioId,
        google_calendar_id: calendarId,
        active: true,
        shared_contact_ids: [],
        extra_invitees: [],
        extra_invitees_shared: [],
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
    .select('google_calendar_id, active, shared_contact_ids, extra_invitees_shared')
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

    // Manually-added emails: unshare the same way, directly from the stored
    // email (no client_contacts lookup needed — the address is already
    // stored raw). The desired list (extra_invitees) is deliberately left
    // untouched here — deactivating never clears what the user asked for,
    // only what's actually granted right now, same as contacts above.
    const extraSharedEmails = (row.extra_invitees_shared ?? []) as string[];
    const stillSharedExtra: string[] = [];
    for (const email of extraSharedEmails) {
      try {
        await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
      } catch (err) {
        console.error(`Failed to unshare calendar with ${email}:`, err);
        stillSharedExtra.push(email);
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
      .update({ active: false, shared_contact_ids: stillSharedIds, extra_invitees_shared: stillSharedExtra })
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
    .select('google_calendar_id, active, shared_contact_ids, extra_invitees, extra_invitees_shared')
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

    // Self-heal a calendar orphaned by a Google account disconnect/reconnect
    // since this row was last activated. Without this check, every
    // share/unshare call below silently 404s against a calendar id that no
    // longer exists under the current token — each failure is caught
    // per-item and logged, never surfaced, so "Partager" always reports
    // success while nothing actually reaches Google. (activateHandler
    // already does this exact check; sync-access never did, which is how a
    // project's calendar could stay invisible in Google Calendar forever
    // after a reconnect, with the UI never showing anything wrong.)
    let calendarId = row.google_calendar_id as string;
    const reachable = await googleCalendarExists(accessToken, calendarId);
    if (!reachable) {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('name, client_name')
        .eq('id', projectId)
        .maybeSingle();
      const calendarName = project?.client_name ? `${project.client_name} — ${project.name}` : (project?.name as string ?? 'Projet');
      calendarId = await createGoogleCalendar(accessToken, calendarName);
      // Fresh calendar, zero existing access — reset both tracking columns
      // (same reasoning as activateHandler's stale-recreate branch) so the
      // diff below re-shares everyone from scratch instead of thinking
      // they're already covered.
      const { error: healError } = await supabaseAdmin
        .from('project_google_calendars')
        .update({ google_calendar_id: calendarId, shared_contact_ids: [], extra_invitees_shared: [] })
        .eq('project_id', projectId);
      if (healError) {
        console.error(`Failed to persist healed calendar id for project ${projectId}:`, healError);
        res.status(500).json({ error: 'Failed to sync access' });
        return;
      }
      row.shared_contact_ids = [];
      row.extra_invitees_shared = [];
    }

    const { data: access } = await supabaseAdmin
      .from('project_client_access')
      .select('client_contact_id')
      .eq('project_id', projectId);
    const currentIds = (access ?? []).map(r => r.client_contact_id as string);
    const previousIds = (row.shared_contact_ids ?? []) as string[];

    const toAdd = currentIds.filter(id => !previousIds.includes(id));
    const toRemove = previousIds.filter(id => !currentIds.includes(id));
    const finalIds = new Set(previousIds);
    // Surfaced in the response so the frontend can show a warning instead
    // of a blanket success confirmation when a share/unshare actually
    // failed (e.g. Google briefly unreachable) — previously every failure
    // here was only console.error'd, so the UI always reported success
    // regardless of whether anything actually reached Google.
    let anyFailure = false;

    if (toAdd.length > 0 || toRemove.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('client_contacts')
        .select('id, email')
        .in('id', [...toAdd, ...toRemove]);
      const emailById = new Map((contacts ?? []).map(c => [c.id as string, c.email as string]));

      for (const id of toAdd) {
        const email = emailById.get(id);
        if (!email) continue;
        try {
          await shareGoogleCalendar(accessToken, calendarId, email);
          finalIds.add(id);
        } catch (err) {
          console.error(`Failed to share calendar with ${email}:`, err);
          anyFailure = true;
        }
      }
      for (const id of toRemove) {
        const email = emailById.get(id);
        if (!email) continue;
        try {
          await unshareGoogleCalendar(accessToken, calendarId, email);
          finalIds.delete(id);
        } catch (err) {
          console.error(`Failed to unshare calendar with ${email}:`, err);
          anyFailure = true;
        }
      }
    }

    // Manually-added emails follow the exact same add/remove diff, against
    // extra_invitees (desired) vs extra_invitees_shared (currently granted)
    // instead of project_client_access vs shared_contact_ids — same button,
    // same call, both lists reconciled together.
    const extraDesired = (row.extra_invitees ?? []) as string[];
    const extraPreviouslyShared = (row.extra_invitees_shared ?? []) as string[];
    const extraToAdd = extraDesired.filter(email => !extraPreviouslyShared.includes(email));
    const extraToRemove = extraPreviouslyShared.filter(email => !extraDesired.includes(email));
    const finalExtraShared = new Set(extraPreviouslyShared);

    for (const email of extraToAdd) {
      try {
        await shareGoogleCalendar(accessToken, calendarId, email);
        finalExtraShared.add(email);
      } catch (err) {
        console.error(`Failed to share calendar with ${email}:`, err);
        anyFailure = true;
      }
    }
    for (const email of extraToRemove) {
      try {
        await unshareGoogleCalendar(accessToken, calendarId, email);
        finalExtraShared.delete(email);
      } catch (err) {
        console.error(`Failed to unshare calendar with ${email}:`, err);
        anyFailure = true;
      }
    }

    if (toAdd.length > 0 || toRemove.length > 0 || extraToAdd.length > 0 || extraToRemove.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('project_google_calendars')
        .update({ shared_contact_ids: Array.from(finalIds), extra_invitees_shared: Array.from(finalExtraShared) })
        .eq('project_id', projectId);
      if (updateError) {
        console.error(`Failed to persist shared access for project ${projectId}:`, updateError);
        res.status(500).json({ error: 'Failed to sync access' });
        return;
      }
    }

    res.status(200).json({ ok: true, partialFailure: anyFailure });
  } catch (error) {
    console.error('Failed to sync project Google Calendar access:', error);
    res.status(200).json({ ok: false, error: 'sync_failed' });
  }
}

interface AddExtraInviteeBody {
  studioId: string;
  projectId: string;
  email: string;
}

async function addExtraInviteeHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId, email: rawEmail } = req.body as AddExtraInviteeBody;
  if (!studioId || !projectId || !rawEmail) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  const email = rawEmail.trim().toLowerCase();

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
    .select('extra_invitees')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (rowError || !row) {
    res.status(404).json({ error: 'Project calendar not found' });
    return;
  }

  const current = (row.extra_invitees ?? []) as string[];
  // Idempotent — adding an already-present email is a no-op, not an error,
  // since the client already blocks duplicates before calling this.
  if (current.includes(email)) {
    res.status(200).json({ ok: true });
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('project_google_calendars')
    .update({ extra_invitees: [...current, email] })
    .eq('project_id', projectId)
    .eq('studio_id', studioId);
  if (updateError) {
    console.error(`Failed to add extra invitee ${email} for project ${projectId}:`, updateError);
    res.status(500).json({ error: 'Failed to add invitee' });
    return;
  }

  res.status(200).json({ ok: true });
}

interface RemoveExtraInviteeBody {
  studioId: string;
  projectId: string;
  email: string;
}

async function removeExtraInviteeHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId, email: rawEmail } = req.body as RemoveExtraInviteeBody;
  if (!studioId || !projectId || !rawEmail) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  const email = rawEmail.trim().toLowerCase();

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
    .select('google_calendar_id, active, extra_invitees, extra_invitees_shared, shared_contact_ids')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  // Nothing to remove — idempotent, not an error.
  if (rowError || !row) {
    res.status(200).json({ ok: true });
    return;
  }

  const remainingDesired = ((row.extra_invitees ?? []) as string[]).filter(e => e !== email);
  const wasShared = ((row.extra_invitees_shared ?? []) as string[]).includes(email);
  let remainingShared = (row.extra_invitees_shared ?? []) as string[];

  // A manually-added email can collide with a real client contact's address
  // (Google Calendar sharing is per-email, not per-source). Revoking Google
  // access here would also kill that contact's access, which their own
  // shared_contact_ids tracking would never notice and self-heal. Check
  // whether this email currently belongs to a shared contact before making
  // the live Google API call — the email is still removed from
  // extra_invitees/extra_invitees_shared below either way.
  let belongsToSharedContact = false;
  const sharedContactIds = (row.shared_contact_ids ?? []) as string[];
  if (sharedContactIds.length > 0) {
    const { data: sharedContacts } = await supabaseAdmin
      .from('client_contacts')
      .select('id, email')
      .in('id', sharedContactIds);
    belongsToSharedContact = (sharedContacts ?? []).some(
      c => typeof c.email === 'string' && c.email.trim().toLowerCase() === email
    );
  }

  // Revoke immediately if it had actually been invited and the calendar can
  // currently be reached — same "revoke now" behavior as removing a client
  // contact's access. If the calendar is inactive or Google isn't
  // reachable right now, the email is dropped from the desired list anyway;
  // it stays in extra_invitees_shared and the next "Partager" click's
  // sync-access diff will retry the revoke then (same self-healing property
  // sync-access already has for contacts).
  if (wasShared && row.active) {
    if (belongsToSharedContact) {
      console.warn(
        `Skipping Google Calendar revoke for ${email} on project ${projectId}: ` +
        `this address also belongs to a shared client contact — removing the manual invitee entry must not revoke the contact's own access.`
      );
      remainingShared = remainingShared.filter(e => e !== email);
    } else {
      try {
        const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
        if (accessToken) {
          await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
          remainingShared = remainingShared.filter(e => e !== email);
        }
      } catch (err) {
        console.error(`Failed to unshare calendar with ${email}:`, err);
      }
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('project_google_calendars')
    .update({ extra_invitees: remainingDesired, extra_invitees_shared: remainingShared })
    .eq('project_id', projectId)
    .eq('studio_id', studioId);
  if (updateError) {
    console.error(`Failed to remove extra invitee ${email} for project ${projectId}:`, updateError);
    res.status(500).json({ error: 'Failed to remove invitee' });
    return;
  }

  res.status(200).json({ ok: true });
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
    case 'add-extra-invitee': return addExtraInviteeHandler(req, res);
    case 'remove-extra-invitee': return removeExtraInviteeHandler(req, res);
    default:
      res.status(400).json({ error: 'Unknown or missing action' });
  }
}
