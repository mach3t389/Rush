// Client-contact invitation links/tokens.
//
// Demo sessions (isDemoSession() === true): unchanged localStorage behavior,
// exactly as before this migration.
//
// Real sessions: backed by the `client_invitations` table. The invited
// contact opens /invitation/:token fully unauthenticated (no account, no
// session) — reading and resolving the invitation goes through two
// security-definer Postgres functions (get_client_invitation /
// resolve_client_invitation) rather than plain table access, since an
// anonymous visitor has no auth.uid() to scope RLS against. See
// docs/superpowers/specs/2026-07-10-client-invitations-supabase-migration.sql.
//
// Every function is now async (a real network round trip can't be
// synchronous) — this is a necessary signature change from the
// localStorage-only version; the two call sites in FicheClient.tsx and the
// data-loading in InvitationAccept.tsx were updated to await it.

import { loadPersisted, savePersisted } from './persist';
import { isDemoSession } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { findClient } from './clientStore';
import { getClientTeam, setClientTeam, removeClientTeamMember } from './clientTeamStore';
import { STUDIO_NAME_KEY } from './authStore';
import { DEFAULT_PORTAL_PERMISSIONS, type PortalPermissions } from './clientContactsStore';
import { getLogoFull, getLogoSquare } from './studioLogoStore';

const STORAGE_KEY = 'sf_client_invitations';

export interface ClientInvitation {
  token: string;
  clientId: string;
  contactId: string;
  outcome: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export interface InvitationDetails {
  outcome: 'pending' | 'accepted' | 'declined';
  clientId: string;
  clientName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  portalPermissions: PortalPermissions;
  studioName: string;
  studioLogoFull: string | null;
  studioLogoSquare: string | null;
}

let _invitations: ClientInvitation[] = loadPersisted<ClientInvitation[]>(STORAGE_KEY, []);

function persist() { savePersisted(STORAGE_KEY, _invitations); }

function makeToken(): string {
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

// Reuses the existing pending invitation for this contact instead of minting
// a new token every time "Renvoyer" is clicked, so a previously shared link
// keeps working.
export async function createInvitation(clientId: string, contactId: string): Promise<ClientInvitation> {
  if (isDemoSession()) {
    const existing = _invitations.find(
      i => i.clientId === clientId && i.contactId === contactId && i.outcome === 'pending'
    );
    if (existing) return existing;

    const invitation: ClientInvitation = {
      token: makeToken(),
      clientId,
      contactId,
      outcome: 'pending',
      createdAt: Date.now(),
    };
    _invitations = [..._invitations, invitation];
    persist();
    return invitation;
  }

  const { data: existing } = await supabase
    .from('client_invitations')
    .select('token, client_id, contact_id, outcome, created_at')
    .eq('client_id', clientId)
    .eq('contact_id', contactId)
    .eq('outcome', 'pending')
    .maybeSingle();

  if (existing) {
    return { token: existing.token, clientId: existing.client_id, contactId: existing.contact_id, outcome: 'pending', createdAt: Date.parse(existing.created_at) };
  }

  const studioId = await getStudioId();
  const token = makeToken();
  const createdAt = new Date().toISOString();
  const { error } = await supabase.from('client_invitations').insert({
    token, studio_id: studioId, client_id: clientId, contact_id: contactId, outcome: 'pending', created_at: createdAt,
  });
  if (error) console.error('createInvitation failed', error);

  return { token, clientId, contactId, outcome: 'pending', createdAt: Date.parse(createdAt) };
}

export async function getInvitationDetails(token: string): Promise<InvitationDetails | null> {
  if (isDemoSession()) {
    const invitation = _invitations.find(i => i.token === token);
    if (!invitation) return null;
    const client = findClient(invitation.clientId);
    if (!client) return null;
    const contact = getClientTeam(invitation.clientId).find(c => c.id === invitation.contactId);
    // A resolved invitation's contact may no longer exist in the live store
    // (declined invitations remove the contact) — only a still-pending
    // invitation needs the contact record to render (name, permissions).
    if (invitation.outcome === 'pending' && !contact) return null;
    return {
      outcome: invitation.outcome,
      clientId: client.id,
      clientName: client.name,
      contactId: invitation.contactId,
      contactName: contact?.name ?? '',
      contactEmail: contact?.email ?? '',
      portalPermissions: contact?.portalPermissions ?? DEFAULT_PORTAL_PERMISSIONS,
      studioName: localStorage.getItem(STUDIO_NAME_KEY) ?? 'Rush',
      studioLogoFull: getLogoFull(),
      studioLogoSquare: getLogoSquare(),
    };
  }

  const { data, error } = await supabase.rpc('get_client_invitation', { p_token: token });
  if (error) { console.error('getInvitationDetails failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    outcome: row.outcome,
    clientId: row.client_id,
    clientName: row.client_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email ?? '',
    portalPermissions: row.portal_permissions ?? DEFAULT_PORTAL_PERMISSIONS,
    studioName: row.studio_name ?? 'Rush',
    studioLogoFull: row.studio_logo_full ?? null,
    studioLogoSquare: row.studio_logo_square ?? null,
  };
}

// Resolves the invitation AND applies the matching contact side-effect
// (mark active on accept, remove on decline) as a single call — for real
// sessions this is one atomic security-definer function, so there's no
// window where the invitation is resolved but the contact wasn't updated.
export async function acceptInvitation(clientId: string, contactId: string, token: string): Promise<void> {
  if (isDemoSession()) {
    setClientTeam(clientId, getClientTeam(clientId).map(m => (m.id === contactId ? { ...m, status: 'active' as const } : m)));
    _invitations = _invitations.map(i => (i.token === token ? { ...i, outcome: 'accepted' } : i));
    persist();
    return;
  }
  const { error } = await supabase.rpc('resolve_client_invitation', { p_token: token, p_outcome: 'accepted' });
  if (error) console.error('acceptInvitation failed', error);
}

// Called after the invited client has just authenticated (registered or
// logged in) on ClientInvitationAccept.tsx — links their new Supabase Auth
// account to this client_contacts row via the accept_client_invitation RPC
// (checks the caller's email matches the invitation server-side). Distinct
// from acceptInvitation() above, which only flips status to 'active' and is
// still used by the studio-side flows that don't involve account creation.
export async function acceptClientAccount(token: string): Promise<void> {
  const { error } = await supabase.rpc('accept_client_invitation', { p_token: token });
  if (error) throw error;
}

export async function declineInvitation(clientId: string, contactId: string, token: string): Promise<void> {
  if (isDemoSession()) {
    removeClientTeamMember(clientId, contactId);
    _invitations = _invitations.map(i => (i.token === token ? { ...i, outcome: 'declined' } : i));
    persist();
    return;
  }
  const { error } = await supabase.rpc('resolve_client_invitation', { p_token: token, p_outcome: 'declined' });
  if (error) console.error('declineInvitation failed', error);
}

export function getInvitationLink(token: string): string {
  return `${window.location.origin}/invitation/${token}`;
}
