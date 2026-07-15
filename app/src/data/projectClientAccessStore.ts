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

  if (toRemove.length > 0) {
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
}
