// Session store for the active team of each client.
// Initialized from CLIENT_CONTACTS on first access.
// Both FicheClient (Équipe tab) and ProjectMembres (add-member modal) use this
// so that only people actually in the client team can be added to projects.

import { getClientContacts, type ClientContact } from './clientContactsStore';
import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_client_teams';

const store: Record<string, ClientContact[]> = loadPersisted(STORAGE_KEY, {});
function persist() { savePersisted(STORAGE_KEY, store); }

export function getClientTeam(clientId: string): ClientContact[] {
  if (!store[clientId]) {
    store[clientId] = [...getClientContacts(clientId)];
  }
  return store[clientId];
}

export function setClientTeam(clientId: string, team: ClientContact[]): void {
  store[clientId] = team;
  persist();
}

export function addClientTeamMember(clientId: string, member: ClientContact): void {
  const team = getClientTeam(clientId);
  if (!team.find(m => m.id === member.id)) {
    store[clientId] = [...team, member];
    persist();
  }
}

export function removeClientTeamMember(clientId: string, memberId: string): void {
  store[clientId] = getClientTeam(clientId).filter(m => m.id !== memberId);
  persist();
}

// Only external contacts (not internal studio members) — these are the people
// eligible to be added as "Contacts client" in a project team.
export function getClientExternalTeam(clientId: string): ClientContact[] {
  return getClientTeam(clientId).filter(c => !c.internal);
}
