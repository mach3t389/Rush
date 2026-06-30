// Shared store for client-side contacts (people at the client company).
// Used by FicheClient (Équipe tab) and ProjectMembres (Contacts client section).

export interface PortalPermissions {
  approve: boolean;  // can formally approve/reject deliverables
  comment: boolean;  // can leave comments on resources
  download: boolean; // can download shared files
}

export const DEFAULT_PORTAL_PERMISSIONS: PortalPermissions = { approve: false, comment: true, download: true };

export interface PortalPreset { key: string; labelKey: string; descKey: string; perms: PortalPermissions; }

export const PORTAL_PRESETS: PortalPreset[] = [
  { key: 'approver',     labelKey: 'client.portalPresetApprover',     descKey: 'client.portalPresetApproverDesc',     perms: { approve: true,  comment: true,  download: true  } },
  { key: 'collaborator', labelKey: 'client.portalPresetCollaborator', descKey: 'client.portalPresetCollaboratorDesc', perms: { approve: false, comment: true,  download: true  } },
  { key: 'observer',     labelKey: 'client.portalPresetObserver',     descKey: 'client.portalPresetObserverDesc',     perms: { approve: false, comment: false, download: true  } },
];

export function matchPortalPreset(perms: PortalPermissions): string | null {
  return PORTAL_PRESETS.find(p =>
    p.perms.approve === perms.approve && p.perms.comment === perms.comment && p.perms.download === perms.download
  )?.key ?? null;
}

export function loadPortalPermissions(contactId: string): PortalPermissions {
  try {
    const raw = localStorage.getItem(`sf_portal_perms_${contactId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { ...DEFAULT_PORTAL_PERMISSIONS };
}

export function savePortalPermissions(contactId: string, perms: PortalPermissions) {
  try { localStorage.setItem(`sf_portal_perms_${contactId}`, JSON.stringify(perms)); } catch { /* noop */ }
}

export interface ClientContact {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'active' | 'invited' | 'pending';
  initials: string;
  color: string;
  internal?: boolean;
  userId?: string; // links to USERS key if internal studio member
  portalPermissions?: PortalPermissions;
}

export const CLIENT_CONTACTS: Record<string, ClientContact[]> = {
  c1: [
    { id: 'ext1', name: 'Sophie Blanc',  role: 'Directrice marketing',  email: 'sophie@novafilms.fr',    status: 'active',  initials: 'SB', color: '#3b4f8f' },
    { id: 'ext2', name: 'Pierre Leroy',  role: 'Chef de projet client', email: 'pierre@novafilms.fr',   status: 'invited', initials: 'PL', color: '#7d4e57' },
    { id: 'int1', name: 'Léa Marchand',  role: 'Admin',                 email: 'lea@studioflow.fr',     status: 'active',  initials: 'LM', color: '#5c3d8f', internal: true, userId: 'lea' },
    { id: 'int2', name: 'Sarah Martin',  role: 'Dir. créative',         email: 'sarah@studioflow.fr',   status: 'active',  initials: 'SM', color: '#3b4f8f', internal: true, userId: 'sarah' },
  ],
  c2: [
    { id: 'ext3', name: 'Marc Dubois',    role: 'Producteur exécutif',  email: 'marc@studiobleu.fr',    status: 'active',  initials: 'MD', color: '#1a6b4a' },
    { id: 'ext4', name: 'Élise Fontaine', role: 'Responsable com.',     email: 'elise@studiobleu.fr',   status: 'invited', initials: 'EF', color: '#2d6b5a' },
    { id: 'int3', name: 'Julie Bernard',  role: 'Monteuse',             email: 'julie@studioflow.fr',   status: 'active',  initials: 'JB', color: '#1a6b4a', internal: true, userId: 'julie' },
  ],
  c3: [
    { id: 'ext5', name: 'Antoine Renaud', role: 'Directeur général',    email: 'antoine@fondlumiere.fr', status: 'active', initials: 'AR', color: '#4a3428' },
  ],
  c4: [
    { id: 'ext6', name: 'Camille Morel',  role: 'Directrice artistique',email: 'camille@maisonleroux.fr',status: 'active', initials: 'CM', color: '#2d5a7d' },
    { id: 'ext7', name: 'Hugo Leroux',    role: 'PDG',                  email: 'hugo@maisonleroux.fr',  status: 'active',  initials: 'HL', color: '#1a3d5c' },
  ],
  c5: [
    { id: 'ext8', name: 'Jade Moreau',    role: 'Coordinatrice projet', email: 'jade@collectifondes.fr', status: 'active', initials: 'JM', color: '#7d4e57' },
  ],
  c6: [
    { id: 'ext9', name: 'Théo Vidal',     role: 'Directeur création',   email: 'theo@agencevertigo.fr', status: 'active',  initials: 'TV', color: '#3d3d30' },
  ],
};

export const DEFAULT_CLIENT_CONTACTS: ClientContact[] = [
  { id: 'extd1', name: 'Contact principal', role: 'Directeur général', email: 'contact@client.fr', status: 'active', initials: 'CP', color: '#404040' },
];

export function getClientContacts(clientId: string): ClientContact[] {
  return CLIENT_CONTACTS[clientId] ?? DEFAULT_CLIENT_CONTACTS;
}

// Only external contacts (not internal studio members)
export function getExternalContacts(clientId: string): ClientContact[] {
  return getClientContacts(clientId).filter(c => !c.internal);
}
