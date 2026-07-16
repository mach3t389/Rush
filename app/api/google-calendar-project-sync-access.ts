// app/api/google-calendar-project-sync-access.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, shareGoogleCalendar, unshareGoogleCalendar } from './_lib/googleCalendarApi.js';

interface SyncAccessBody {
  studioId: string;
  projectId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const { data: row } = await supabaseAdmin
    .from('project_google_calendars')
    .select('google_calendar_id, active, shared_contact_ids')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!row || !row.active) {
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

      for (const id of toAdd) {
        const email = emailById.get(id);
        if (!email) continue;
        try { await shareGoogleCalendar(accessToken, row.google_calendar_id as string, email); }
        catch (err) { console.error(`Failed to share calendar with ${email}:`, err); }
      }
      for (const id of toRemove) {
        const email = emailById.get(id);
        if (!email) continue;
        try { await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email); }
        catch (err) { console.error(`Failed to unshare calendar with ${email}:`, err); }
      }

      await supabaseAdmin
        .from('project_google_calendars')
        .update({ shared_contact_ids: currentIds })
        .eq('project_id', projectId);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to sync project Google Calendar access:', error);
    res.status(200).json({ ok: false, error: 'sync_failed' });
  }
}
