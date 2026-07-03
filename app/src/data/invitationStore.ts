// Session store for client-contact invitation links/tokens.
// No backend: tokens are generated client-side and persisted to localStorage.
// The pending -> accepted/declined lifecycle lets /invitation/:token show the
// right state even across reloads or when the link is reopened later.

import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_client_invitations';

export interface ClientInvitation {
  token: string;
  clientId: string;
  contactId: string;
  outcome: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

let _invitations: ClientInvitation[] = loadPersisted<ClientInvitation[]>(STORAGE_KEY, []);

function persist() { savePersisted(STORAGE_KEY, _invitations); }

function makeToken(): string {
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Reuses the existing pending invitation for this contact instead of minting
// a new token every time "Renvoyer" is clicked, so a previously shared link
// keeps working.
export function createInvitation(clientId: string, contactId: string): ClientInvitation {
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

export function getInvitation(token: string): ClientInvitation | undefined {
  return _invitations.find(i => i.token === token);
}

export function resolveInvitation(token: string, outcome: 'accepted' | 'declined'): void {
  _invitations = _invitations.map(i => (i.token === token ? { ...i, outcome } : i));
  persist();
}

export function getInvitationLink(token: string): string {
  return `${window.location.origin}/invitation/${token}`;
}
