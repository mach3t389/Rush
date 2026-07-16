// Keeps the `project_client_access` table (the RLS-backing table for
// client-contact project access — see the Step B migration,
// docs/superpowers/specs/2026-07-15-client-access-migration.sql) in sync
// with `projects.members`, the JSONB array ProjectMembres.tsx actually
// displays and edits. This is the ONLY place that writes
// project_client_access — see persistMembers() in ProjectMembres.tsx.
//
// Demo sessions no-op: project_client_access is a real-session-only RLS
// concern (demo sessions never hit Supabase RLS at all).

import { isDemoSession } from './authStore';
import { getClientExternalTeam } from './clientTeamStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import type { User } from '../types';

async function syncGoogleCalendarProjectAccess(projectId: string): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/google-calendar-project-sync-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studioId, projectId }),
    });
  } catch (err) {
    // Fire-and-forget — this must never block the project_client_access write.
    console.error('syncGoogleCalendarProjectAccess failed', err);
  }
}

export function syncProjectClientAccess(projectId: string, clientId: string, members: User[]): void {
  if (isDemoSession()) return;
  void doSync(projectId, clientId, members);
}

async function doSync(projectId: string, clientId: string, members: User[]): Promise<void> {
  const externalContactIds = new Set(getClientExternalTeam(clientId).map(c => c.id));
  const nextContactIds = members.map(m => m.id).filter(id => externalContactIds.has(id));

  const { data: existing, error: fetchError } = await supabase
    .from('project_client_access')
    .select('client_contact_id')
    .eq('project_id', projectId);

  if (fetchError) { console.error('syncProjectClientAccess fetch failed', fetchError); return; }

  const existingIds = (existing ?? []).map(row => row.client_contact_id as string);
  const toRemove = existingIds.filter(id => !nextContactIds.includes(id));
  const toAdd = nextContactIds.filter(id => !existingIds.includes(id));

  // Guard against a race with clientTeamStore's background fetch: getClientExternalTeam()
  // returns [] synchronously both when a client genuinely has zero contacts AND when that
  // client's contact-team cache simply hasn't finished loading yet (see ensureFetchStarted
  // in clientTeamStore.ts). If we can't tell those apart and there are pre-existing
  // project_client_access rows, treating "pool empty" as "revoke everyone" would silently
  // wipe every client contact's access on an unrelated member edit that just happened to
  // race the fetch. So: an empty pool with pre-existing rows skips the delete pass entirely
  // rather than assuming the pool is authoritative. (The insert pass is unaffected — an
  // empty pool naturally yields an empty toAdd too, so it doesn't need this guard.)
  const poolLooksUnloaded = externalContactIds.size === 0 && existingIds.length > 0;
  if (poolLooksUnloaded) {
    console.warn(
      `syncProjectClientAccess: skipping delete pass for project ${projectId} — ` +
      `client ${clientId}'s contact pool came back empty while ${existingIds.length} ` +
      `project_client_access row(s) already exist. Assuming the contact-team cache ` +
      `hasn't finished loading yet rather than revoking all access.`
    );
  } else if (toRemove.length > 0) {
    const { error } = await supabase
      .from('project_client_access')
      .delete()
      .eq('project_id', projectId)
      .in('client_contact_id', toRemove);
    if (error) console.error('syncProjectClientAccess delete failed', error);
  }

  if (toAdd.length > 0) {
    const studioId = await getStudioId();
    const { error } = await supabase
      .from('project_client_access')
      .insert(toAdd.map(clientContactId => ({ project_id: projectId, client_contact_id: clientContactId, studio_id: studioId })));
    if (error) console.error('syncProjectClientAccess insert failed', error);
  }

  void syncGoogleCalendarProjectAccess(projectId);
}
