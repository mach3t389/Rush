// Resolves whether the CURRENT authenticated Supabase user is a client
// contact (has a client_contacts row with user_id = auth.uid()) rather than
// a studio member. This must be checked before any studio-scoped store
// (anything that calls getStudioId()) is touched — a client-authenticated
// user has no studio_members row, and getStudioId() does not treat that as
// an error: it silently auto-provisions a brand-new empty studio instead
// (see studioStore.ts's resolveStudioId, step 3). Demo sessions never reach
// this module's real logic — client accounts don't exist as a concept in
// demo mode, so isClientSession() short-circuits to false for them.

import { supabase } from './supabaseClient';
import { isDemoSession, onLogout } from './authStore';

interface ClientIdentity {
  contactId: string;
  clientId: string;
}

let _cached: ClientIdentity | null | undefined; // undefined = not resolved yet, null = resolved to "not a client"
let _inFlight: Promise<ClientIdentity | null> | null = null;

async function resolveClientIdentity(): Promise<ClientIdentity | null> {
  if (isDemoSession()) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('client_contacts')
    .select('id, client_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('resolveClientIdentity failed', error); return null; }
  if (!data) return null;

  return { contactId: data.id, clientId: data.client_id };
}

async function getClientIdentity(): Promise<ClientIdentity | null> {
  if (_cached !== undefined) return _cached;
  if (!_inFlight) {
    _inFlight = resolveClientIdentity().then(result => {
      _cached = result;
      _inFlight = null;
      return result;
    });
  }
  return _inFlight;
}

export function resetClientSessionCache(): void {
  _cached = undefined;
  _inFlight = null;
}

onLogout(resetClientSessionCache);

export async function isClientSession(): Promise<boolean> {
  return (await getClientIdentity()) !== null;
}

export async function getMyClientContactId(): Promise<string | null> {
  const identity = await getClientIdentity();
  return identity?.contactId ?? null;
}

// The list of project ids this client contact can read — sourced from
// project_client_access (the RLS-backing table, see the Step B migration),
// filtered down for THIS user by that table's own RLS policy (a client
// contact has no direct SELECT grant on project_client_access itself; this
// query relies on is_client_contact_for_project() being usable indirectly
// via the projects table's own new client-access policy instead — see the
// implementation note in Task 5's Step 2 below for why this queries
// `projects`, not `project_client_access`, directly).
export async function getMyClientProjectIds(): Promise<string[]> {
  const { data, error } = await supabase.from('projects').select('id');
  if (error) { console.error('getMyClientProjectIds failed', error); return []; }
  return (data ?? []).map(row => row.id as string);
}
