// Session store for the active team of each client.
// Demo sessions: initialized from CLIENT_CONTACTS on first access, stored in localStorage.
// Real sessions: backed by the `client_contacts` Supabase table.
// Both FicheClient (Équipe tab) and ProjectMembres (add-member modal) use this
// so that only people actually in the client team can be added to projects.

import { getClientContacts, DEFAULT_PORTAL_PERMISSIONS, type ClientContact } from './clientContactsStore';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'sf_client_teams';

// ── Demo-session working set ─────────────────────────────────────────────────
const demoStore: Record<string, ClientContact[]> = loadPersisted(STORAGE_KEY, {});
function persistDemo() { savePersisted(STORAGE_KEY, demoStore); }

function seedFromContacts(clientId: string): ClientContact[] {
  return getClientContacts(clientId).map(c => ({ ...c, portalPermissions: c.portalPermissions ?? { ...DEFAULT_PORTAL_PERMISSIONS } }));
}

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseContacts: Record<string, ClientContact[]> = {};
let _supabaseFetchStarted: Record<string, boolean> = {};

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }

export function subscribeClientTeam(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

interface ClientContactRow {
  id: string;
  client_id: string;
  studio_id: string;
  name: string;
  role: string;
  email: string;
  status: string;
  initials: string;
  color: string;
  internal: boolean;
  studio_member_id: string | null;
  user_id: string | null;
  portal_permissions: { approve: boolean; comment: boolean; download: boolean };
  photo_url: string | null;
}

function toContact(row: ClientContactRow): ClientContact {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    status: row.status as ClientContact['status'],
    initials: row.initials,
    color: row.color,
    internal: row.internal,
    userId: row.studio_member_id ?? undefined,
    authUserId: row.user_id ?? undefined,
    portalPermissions: row.portal_permissions,
    photoUrl: row.photo_url ?? undefined,
  };
}

function toRow(c: ClientContact, clientId: string, studioId: string): ClientContactRow {
  return {
    id: c.id,
    client_id: clientId,
    studio_id: studioId,
    name: c.name,
    role: c.role,
    email: c.email,
    status: c.status,
    initials: c.initials,
    color: c.color,
    internal: !!c.internal,
    studio_member_id: c.userId ?? null,
    user_id: c.authUserId ?? null,
    portal_permissions: c.portalPermissions,
    photo_url: c.photoUrl ?? null,
  };
}

async function fetchSupabaseContacts(clientId: string): Promise<void> {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId);

  if (error) { console.error('fetchSupabaseContacts failed', error); return; }

  _supabaseContacts[clientId] = (data as ClientContactRow[]).map(toContact);
  notify();
}

function ensureFetchStarted(clientId: string): void {
  if (_supabaseFetchStarted[clientId]) return;
  _supabaseFetchStarted[clientId] = true;
  void fetchSupabaseContacts(clientId);
}

// ── Studio-wide contact list (all clients combined) — for the Membres hub's
// Individus tab, which needs every contact in the studio at once rather than
// one client at a time like the rest of this file's API. ─────────────────────
let _allContacts: (ClientContact & { clientId: string; clientName: string })[] = [];
let _allContactsFetchStarted = false;

interface ClientContactWithNameRow extends ClientContactRow {
  clients: { name: string } | null;
}

async function fetchAllClientContacts(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*, clients(name)')
    .eq('studio_id', studioId);
  if (error) { console.error('fetchAllClientContacts failed', error); return; }
  _allContacts = ((data ?? []) as ClientContactWithNameRow[]).map(row => ({
    ...toContact(row),
    clientId: row.client_id,
    clientName: row.clients?.name ?? '',
  }));
  notify();
}

function ensureAllContactsFetchStarted(): void {
  if (isDemoSession() || _allContactsFetchStarted) return;
  _allContactsFetchStarted = true;
  void fetchAllClientContacts();
}

// Invalidate the studio-wide cache so the next read reflects a per-client
// mutation (add/remove/replace). Must be called by every function that
// mutates `_supabaseContacts` in the real-session branch — otherwise
// `getAllClientContacts()` / `subscribeAllClientContacts()` (used by the
// Membres hub) keep serving stale data until a full page reload.
function invalidateAllContactsCache(): void {
  if (isDemoSession()) return;
  _allContactsFetchStarted = false;
  void fetchAllClientContacts();
}

export function getAllClientContacts(): (ClientContact & { clientId: string; clientName: string })[] {
  if (isDemoSession()) {
    return Object.entries(demoStore).flatMap(([clientId, contacts]) =>
      contacts.map(c => ({ ...c, clientId, clientName: '' }))
    );
  }
  ensureAllContactsFetchStarted();
  return _allContacts;
}

export function subscribeAllClientContacts(fn: () => void): () => void {
  _listeners.add(fn);
  ensureAllContactsFetchStarted();
  return () => _listeners.delete(fn);
}

export function resetClientTeamCache(): void {
  _supabaseContacts = {};
  _supabaseFetchStarted = {};
  _allContacts = [];
  _allContactsFetchStarted = false;
}

onLogout(resetClientTeamCache);

async function upsertSupabaseContact(clientId: string, contact: ClientContact): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('client_contacts').upsert(toRow(contact, clientId, studioId));
  if (error) { console.error('upsertSupabaseContact failed', error); return; }
  await fetchSupabaseContacts(clientId);
}

async function removeSupabaseContact(clientId: string, contactId: string): Promise<void> {
  const { error } = await supabase.from('client_contacts').delete().eq('id', contactId);
  if (error) { console.error('removeSupabaseContact failed', error); return; }
  await fetchSupabaseContacts(clientId);
}

async function replaceSupabaseTeam(clientId: string, previousIds: string[], team: ClientContact[]): Promise<void> {
  const studioId = await getStudioId();
  const nextIds = team.map(c => c.id);
  const removedIds = previousIds.filter(id => !nextIds.includes(id));

  if (removedIds.length > 0) {
    const { error: delError } = await supabase.from('client_contacts').delete().in('id', removedIds);
    if (delError) { console.error('replaceSupabaseTeam delete failed', delError); return; }
  }

  const { error: upsertError } = await supabase.from('client_contacts').upsert(team.map(c => toRow(c, clientId, studioId)));
  if (upsertError) { console.error('replaceSupabaseTeam upsert failed', upsertError); return; }

  await fetchSupabaseContacts(clientId);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function getClientTeam(clientId: string): ClientContact[] {
  if (isDemoSession()) {
    if (!demoStore[clientId]) {
      demoStore[clientId] = seedFromContacts(clientId);
      persistDemo();
    }
    return demoStore[clientId];
  }
  ensureFetchStarted(clientId);
  return _supabaseContacts[clientId] ?? [];
}

export function setClientTeam(clientId: string, team: ClientContact[]): void {
  if (isDemoSession()) {
    demoStore[clientId] = team;
    persistDemo();
    notify();
    return;
  }
  const previousIds = (_supabaseContacts[clientId] ?? []).map(c => c.id);
  _supabaseContacts[clientId] = team;
  notify();
  invalidateAllContactsCache();
  void replaceSupabaseTeam(clientId, previousIds, team);
}

export function addClientTeamMember(clientId: string, member: ClientContact): void {
  const team = getClientTeam(clientId);
  if (team.find(m => m.id === member.id)) return;

  if (isDemoSession()) {
    demoStore[clientId] = [...team, member];
    persistDemo();
    notify();
    return;
  }
  _supabaseContacts[clientId] = [...team, member];
  notify();
  invalidateAllContactsCache();
  void upsertSupabaseContact(clientId, member);
}

export function removeClientTeamMember(clientId: string, memberId: string): void {
  if (isDemoSession()) {
    demoStore[clientId] = getClientTeam(clientId).filter(m => m.id !== memberId);
    persistDemo();
    notify();
    return;
  }
  _supabaseContacts[clientId] = getClientTeam(clientId).filter(m => m.id !== memberId);
  notify();
  invalidateAllContactsCache();
  void removeSupabaseContact(clientId, memberId);
}

// Only external contacts (not internal studio members) — these are the people
// eligible to be added as "Contacts client" in a project team.
export function getClientExternalTeam(clientId: string): ClientContact[] {
  return getClientTeam(clientId).filter(c => !c.internal);
}

// The mirror of the above: studio members assigned to this client from the
// client's Membres tab. Their `userId` holds the studio_members ROW id
// (membershipId), not the auth user id — see the FK note in teamStore.ts.
export function getClientInternalTeam(clientId: string): ClientContact[] {
  return getClientTeam(clientId).filter(c => c.internal);
}
