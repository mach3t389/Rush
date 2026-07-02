# Invitation contact client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a studio admin generate a real, copyable invitation link for a client contact, and let that contact accept or decline on a dedicated `/invitation/:token` page — replacing the current fake "invitation sent" simulation in `FicheClient.tsx`.

**Architecture:** A new `invitationStore.ts` (localStorage-backed, same pattern as every other store in `app/src/data/`) maps a generated token to `{ clientId, contactId, outcome }`. `FicheClient.tsx`'s existing invite/resend UI calls this store and displays the resulting link for the admin to copy. A new standalone screen `InvitationAccept.tsx` reads the token from the URL, shows the invitation details, and on Accept/Decline mutates `clientTeamStore` (already existing) and resolves the invitation outcome.

**Tech Stack:** React 19 + TypeScript, react-router-dom v7 (`useParams`), i18next (`useTranslation`), existing `SFButton`/`SFIcon` UI primitives, localStorage via `persist.ts`.

## Global Constraints

- No automated test suite exists in this project ("Il n'y a pas de tests automatisés. La vérification se fait via le serveur de preview.", CLAUDE.md). Every task below replaces the usual "write failing test" step with: run `npx tsc --noEmit` from `app/` (must produce zero output) and, where relevant, a manual check via the Preview tool.
- **Never hard-code user-facing text.** Every new string goes through `t('namespace.key')`, added to both `app/src/locales/fr.json` and `app/src/locales/en.json` before use (project rule, CLAUDE.md).
- Follow existing store conventions exactly: `loadPersisted`/`savePersisted` from `app/src/data/persist.ts`, plain module-level array + `persist()` helper, no external state library.
- Do not touch `ProjectMembres.tsx`'s project-assignment mechanism, portal authentication, or the internal-team invite flow (Paramètres) — all explicitly out of scope per the approved spec (`docs/superpowers/specs/2026-07-02-invitation-contact-client-design.md`).

---

### Task 1: `invitationStore.ts` — token store

**Files:**
- Create: `app/src/data/invitationStore.ts`

**Interfaces:**
- Produces: `ClientInvitation` type; `createInvitation(clientId: string, contactId: string): ClientInvitation`; `getInvitation(token: string): ClientInvitation | undefined`; `resolveInvitation(token: string, outcome: 'accepted' | 'declined'): void`; `getInvitationLink(token: string): string`.

- [ ] **Step 1: Create the store file**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit`
Expected: no output (no errors). The file is not imported anywhere yet, so this only checks the file compiles in isolation.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/invitationStore.ts
git commit -m "feat: add invitationStore for client-contact invitation tokens"
```

---

### Task 2: `notificationStore.ts` — optional `projectId`, new `clientId`, `'invitation'` kind

**Files:**
- Modify: `app/src/data/notificationStore.ts:12-24`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NotifKind` now includes `'invitation'`; `AppNotif.projectId` is now optional; `AppNotif.clientId?: string` added. `addNotif` (unchanged signature, `Omit<AppNotif, 'id' | 'read'>`) can now be called without `projectId`.

- [ ] **Step 1: Edit the type definitions**

Replace lines 12-24 of `app/src/data/notificationStore.ts`:

```ts
export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version' | 'approval';

export interface AppNotif {
  id: string;
  kind: NotifKind;
  actor: string;
  text: string;
  timestamp: number;
  read: boolean;
  taskId?: string;
  resourceId?: string;
  projectId: string;
}
```

with:

```ts
export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version' | 'approval' | 'invitation';

export interface AppNotif {
  id: string;
  kind: NotifKind;
  actor: string;
  text: string;
  timestamp: number;
  read: boolean;
  taskId?: string;
  resourceId?: string;
  projectId?: string;
  clientId?: string;
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit`
Expected: no output. This confirms every existing caller of `addNotif`/`AppNotif` (all of which already pass a `projectId`) still satisfies the now-optional field, and that `getUnreadForProject`/`getUnreadTaskCountForProject`/`markAllProjectRead` (which compare `n.projectId === projectId`) still typecheck since comparing `string | undefined === string` is valid.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/notificationStore.ts
git commit -m "feat: allow client-scoped notifications without a projectId"
```

---

### Task 3: i18n keys

**Files:**
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Produces: `client.emailAlreadyInvited`, `client.invitationLinkHint`, `client.copyLink`, `client.linkCopied`, `client.close`, and a new `invitation.*` namespace (`invalidTitle`, `invalidDesc`, `pendingTitle`, `pendingDesc`, `permissionsTitle`, `permApprove`, `permComment`, `permDownload`, `accept`, `decline`, `acceptedTitle`, `acceptedDesc`, `declinedTitle`, `declinedDesc`, `backToLogin`) used by Task 4 and Task 6/7.

- [ ] **Step 1: Add keys to `fr.json`**

In `app/src/locales/fr.json`, in the `"client"` block, insert after the line `"sendInvitation": "Envoyer l'invitation",` (currently line 540):

```json
    "emailAlreadyInvited": "Cette adresse courriel fait déjà partie de l'équipe.",
    "invitationLinkHint": "Copiez ce lien et envoyez-le au contact pour qu'il rejoigne l'équipe.",
    "copyLink": "Copier le lien",
    "linkCopied": "Lien copié !",
    "close": "Fermer",
```

Then, still in `fr.json`, insert a new top-level namespace right after the closing `},` of the `"viewAs"` block (currently ending at line 2094, immediately before `"pricing": {`):

```json
  "invitation": {
    "invalidTitle": "Lien d'invitation invalide",
    "invalidDesc": "Ce lien n'existe pas ou a été supprimé. Contactez votre studio pour obtenir un nouveau lien.",
    "pendingTitle": "Invitation à rejoindre l'équipe",
    "pendingDesc": "{{contact}} a été invité(e) à rejoindre l'équipe de {{client}} sur le portail de {{studio}}.",
    "permissionsTitle": "Accès accordé",
    "permApprove": "Approuver les livrables",
    "permComment": "Commenter les ressources",
    "permDownload": "Télécharger les fichiers partagés",
    "accept": "Accepter l'invitation",
    "decline": "Refuser",
    "acceptedTitle": "Bienvenue dans l'équipe !",
    "acceptedDesc": "Vous faites maintenant partie de l'équipe de {{client}}. Votre studio pourra vous donner accès à des projets spécifiques.",
    "declinedTitle": "Invitation refusée",
    "declinedDesc": "Vous avez refusé cette invitation. Si c'est une erreur, contactez votre studio pour en recevoir une nouvelle.",
    "backToLogin": "Retour à la connexion"
  },
```

- [ ] **Step 2: Add the mirrored keys to `en.json`**

In `app/src/locales/en.json`, in the `"client"` block, insert after `"sendInvitation": "Send invitation",` (currently line 540):

```json
    "emailAlreadyInvited": "This email is already part of the team.",
    "invitationLinkHint": "Copy this link and send it to the contact so they can join the team.",
    "copyLink": "Copy link",
    "linkCopied": "Link copied!",
    "close": "Close",
```

Then insert the mirrored namespace right after the `"viewAs"` block, before `"pricing": {`:

```json
  "invitation": {
    "invalidTitle": "Invalid invitation link",
    "invalidDesc": "This link doesn't exist or was removed. Contact your studio for a new one.",
    "pendingTitle": "Invitation to join the team",
    "pendingDesc": "{{contact}} was invited to join {{client}}'s team on {{studio}}'s portal.",
    "permissionsTitle": "Access granted",
    "permApprove": "Approve deliverables",
    "permComment": "Comment on resources",
    "permDownload": "Download shared files",
    "accept": "Accept invitation",
    "decline": "Decline",
    "acceptedTitle": "Welcome to the team!",
    "acceptedDesc": "You're now part of {{client}}'s team. Your studio can grant you access to specific projects.",
    "declinedTitle": "Invitation declined",
    "declinedDesc": "You declined this invitation. If this was a mistake, contact your studio for a new one.",
    "backToLogin": "Back to login"
  },
```

- [ ] **Step 3: Verify both files are valid JSON**

Run (from `app/`): `node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "i18n: add invitation flow strings (fr/en)"
```

---

### Task 4: `InvitationAccept.tsx` — the `/invitation/:token` screen

**Files:**
- Create: `app/src/screens/InvitationAccept.tsx`

**Interfaces:**
- Consumes: `getInvitation`, `resolveInvitation` from `../data/invitationStore` (Task 1); `findClient` from `../data/clientStore`; `getClientTeam`, `setClientTeam`, `removeClientTeamMember` from `../data/clientTeamStore`; `STUDIO_NAME_KEY` from `../data/authStore`; `addNotif` from `../data/notificationStore` (Task 2); `PortalPermissions` type from `../data/clientContactsStore`; `SFIcon` from `../components/ui`.
- Produces: `export function InvitationAccept()` — default export not used, named export consumed by Task 5.

- [ ] **Step 1: Create the screen**

```tsx
import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getInvitation, resolveInvitation } from '../data/invitationStore';
import { findClient } from '../data/clientStore';
import { getClientTeam, setClientTeam, removeClientTeamMember } from '../data/clientTeamStore';
import { STUDIO_NAME_KEY } from '../data/authStore';
import { addNotif } from '../data/notificationStore';
import { DEFAULT_PORTAL_PERMISSIONS } from '../data/clientContactsStore';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="play" size={14} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InvitationAccept() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();

  const [snapshot] = useState(() => {
    if (!token) return null;
    const invitation = getInvitation(token);
    if (!invitation) return null;
    const client = findClient(invitation.clientId);
    const contact = getClientTeam(invitation.clientId).find(c => c.id === invitation.contactId);
    if (!client || !contact) return null;
    return { invitation, client, contact };
  });

  const [outcome, setOutcome] = useState<'pending' | 'accepted' | 'declined'>(
    snapshot?.invitation.outcome ?? 'pending'
  );

  if (!snapshot) {
    return (
      <Shell>
        <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px' }}>
          {t('invitation.invalidTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('invitation.invalidDesc')}
        </p>
        <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
          {t('invitation.backToLogin')}
        </Link>
      </Shell>
    );
  }

  const { invitation, client, contact } = snapshot;
  const studioName = localStorage.getItem(STUDIO_NAME_KEY) ?? 'StudioFlow Production';
  const perms = contact.portalPermissions ?? DEFAULT_PORTAL_PERMISSIONS;

  const accept = () => {
    setClientTeam(
      invitation.clientId,
      getClientTeam(invitation.clientId).map(m => (m.id === contact.id ? { ...m, status: 'active' as const } : m))
    );
    resolveInvitation(invitation.token, 'accepted');
    addNotif({
      kind: 'invitation',
      actor: contact.name,
      text: `a rejoint l'équipe de ${client.name}`,
      clientId: client.id,
      timestamp: Date.now(),
    });
    setOutcome('accepted');
  };

  const decline = () => {
    removeClientTeamMember(invitation.clientId, contact.id);
    resolveInvitation(invitation.token, 'declined');
    setOutcome('declined');
  };

  if (outcome === 'accepted') {
    return (
      <Shell>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <SFIcon name="check" size={28} color="var(--accent)" />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
          {t('invitation.acceptedTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {t('invitation.acceptedDesc', { client: client.name })}
        </p>
      </Shell>
    );
  }

  if (outcome === 'declined') {
    return (
      <Shell>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <SFIcon name="x" size={28} color="var(--text-3)" />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
          {t('invitation.declinedTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {t('invitation.declinedDesc')}
        </p>
      </Shell>
    );
  }

  const permRows: { active: boolean; label: string }[] = [
    { active: perms.approve, label: t('invitation.permApprove') },
    { active: perms.comment, label: t('invitation.permComment') },
    { active: perms.download, label: t('invitation.permDownload') },
  ].filter(p => p.active);

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
        {t('invitation.pendingTitle')}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
        {t('invitation.pendingDesc', { contact: contact.name, client: client.name, studio: studioName })}
      </p>

      {permRows.length > 0 && (
        <div style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 28 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            {t('invitation.permissionsTitle')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {permRows.map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SFIcon name="check" size={13} color="var(--ok)" />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={decline} style={{ flex: 1, padding: '13px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
          {t('invitation.decline')}
        </button>
        <button onClick={accept} style={{ flex: 2, padding: '13px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
          {t('invitation.accept')}
        </button>
      </div>
    </Shell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit`
Expected: no output. (The screen isn't routed yet — Task 5 wires it up — so this only validates the component's own types, including that `contact.status` accepts the literal `'active'` and that `addNotif`'s call omits `projectId` legally per Task 2.)

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/InvitationAccept.tsx
git commit -m "feat: add InvitationAccept screen for /invitation/:token"
```

---

### Task 5: Route registration

**Files:**
- Modify: `app/src/main.tsx:15` (imports) and `app/src/main.tsx:53` (routes)

**Interfaces:**
- Consumes: `InvitationAccept` from `./screens/InvitationAccept` (Task 4).

- [ ] **Step 1: Add the import**

In `app/src/main.tsx`, after the line `import { Portail } from './screens/Portail';` (line 15), add:

```tsx
import { InvitationAccept } from './screens/InvitationAccept';
```

- [ ] **Step 2: Add the route**

In `app/src/main.tsx`, after the line `{ path: '/portail/:projectId', element: <Portail /> },` (line 53), add:

```tsx
  // Invitation contact client — sans sidebar, accessible sans compte (route standalone)
  { path: '/invitation/:token', element: <InvitationAccept /> },
```

- [ ] **Step 3: Typecheck**

Run (from `app/`): `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Manual smoke check**

Start the dev server (`npm run dev` from `app/`, or via the Preview tool) and navigate to `http://localhost:5173/invitation/does-not-exist`.
Expected: the "Lien d'invitation invalide" screen renders (confirms the route resolves and Task 4's not-found branch works before any real invitation exists).

- [ ] **Step 5: Commit**

```bash
git add app/src/main.tsx
git commit -m "feat: register /invitation/:token route"
```

---

### Task 6: `InviteModal` in `FicheClient.tsx` — real link generation

**Files:**
- Modify: `app/src/screens/FicheClient.tsx:18` (import), `:51-122` (`InviteModal`), `:707` (call site)

**Interfaces:**
- Consumes: `createInvitation`, `getInvitationLink` from `../data/invitationStore` (Task 1).
- Produces: `InviteModal` now requires `clientId: string` and `existingEmails: string[]` props; `onInvite` prop signature changes from `(m: ClientMember) => void` to `(m: ClientMember) => string` (returns the invitation link).

- [ ] **Step 1: Add the import**

In `app/src/screens/FicheClient.tsx`, after the line `import { getClientTeam, setClientTeam, addClientTeamMember, removeClientTeamMember } from '../data/clientTeamStore';` (line 19), add:

```tsx
import { createInvitation, getInvitationLink } from '../data/invitationStore';
```

- [ ] **Step 2: Replace the `InviteModal` function**

Replace the entire `InviteModal` function (currently `app/src/screens/FicheClient.tsx:51-122`) with:

```tsx
function InviteModal({ clientId, existingEmails, onClose, onInvite }: {
  clientId: string;
  existingEmails: string[];
  onClose: () => void;
  onInvite: (m: ClientMember) => string;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [portalPerms, setPortalPerms] = useState<PortalPermissions>({ ...DEFAULT_PORTAL_PERMISSIONS });
  const [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const activePreset = matchPortalPreset(portalPerms);

  const submit = () => {
    if (!name.trim() || !email.trim()) return;
    const lower = email.trim().toLowerCase();
    if (existingEmails.includes(lower)) {
      setError(t('client.emailAlreadyInvited'));
      return;
    }
    const initials = name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const id = `ext${Date.now()}`;
    const generatedLink = onInvite({ id, name: name.trim(), role: role.trim() || t('client.defaultClientContactRole'), email: email.trim(), status: 'invited', initials, color: '#3b4f8f', portalPermissions: portalPerms });
    savePortalPermissions(id, portalPerms);
    setLink(generatedLink);
  };

  const copyLink = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, width: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{t('client.invitePerson')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        {link ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.5 }}>
              {t('client.invitationLinkHint')}
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <input readOnly value={link} onFocus={e => e.currentTarget.select()}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-mono)', outline: 'none' }} />
              <SFButton variant={copied ? 'primary' : 'secondary'} icon={copied ? 'check' : 'copy'} onClick={copyLink}>
                {copied ? t('client.linkCopied') : t('client.copyLink')}
              </SFButton>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SFButton variant="primary" onClick={onClose}>{t('client.close')}</SFButton>
            </div>
          </>
        ) : (
          <>
            {[
              { label: t('client.fullNameRequired'), val: name, set: setName, placeholder: t('client.fullNamePlaceholder') },
              { label: t('client.emailRequired'), val: email, set: setEmail, placeholder: t('client.emailContactPlaceholder') },
              { label: t('client.rolePosition'), val: role, set: setRole, placeholder: t('client.rolePositionPlaceholder') },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{f.label}</label>
                <input value={f.val} onChange={e => { f.set(e.target.value); setError(''); }} placeholder={f.placeholder}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
              </div>
            ))}

            {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 14 }}>{error}</p>}

            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0 16px' }} />
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{t('client.portalAccess')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {PORTAL_PRESETS.map(preset => {
                const active = activePreset === preset.key;
                return (
                  <button key={preset.key} onClick={() => setPortalPerms({ ...preset.perms })}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)', transition: 'all 0.12s' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)' }}>{t(preset.labelKey)}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t(preset.descKey)}</p>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {active && <SFIcon name="check" size={10} color="var(--on-accent)" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.5 }}>
              {t('client.inviteHint')}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="ghost" onClick={onClose}>{t('client.cancel')}</SFButton>
              <SFButton variant="primary" onClick={submit} disabled={!name.trim() || !email.trim()}>{t('client.sendInvitation')}</SFButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update the call site**

Replace (currently `app/src/screens/FicheClient.tsx:707`):

```tsx
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvite={m => { addClientTeamMember(clientId, m); setMembers(getClientTeam(clientId)); }} />}
```

with:

```tsx
      {showInvite && (
        <InviteModal
          clientId={clientId}
          existingEmails={members.map(m => m.email.toLowerCase())}
          onClose={() => setShowInvite(false)}
          onInvite={m => {
            addClientTeamMember(clientId, m);
            setMembers(getClientTeam(clientId));
            const invitation = createInvitation(clientId, m.id);
            return getInvitationLink(invitation.token);
          }}
        />
      )}
```

- [ ] **Step 4: Typecheck**

Run (from `app/`): `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Manual verification via Preview**

Start the dev server, sign in (any demo account from `Login.tsx`), go to a client's page (`/clients/c1`), open the "Équipe" tab, click "Inviter" (`t('client.invite')` button), fill name + email, submit.
Expected: the modal switches to the link view showing a URL like `http://localhost:5173/invitation/inv_...`; clicking "Copier le lien" flips the button to "Lien copié !" for 2 seconds.
Then: try inviting the same email again — expected the inline error `t('client.emailAlreadyInvited')` appears and no second contact is created.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/FicheClient.tsx
git commit -m "feat: generate a real copyable invitation link in InviteModal"
```

---

### Task 7: `MemberEditPanel` resend button + dead-code cleanup

**Files:**
- Modify: `app/src/screens/FicheClient.tsx:206` (remove dead state), `:216-219` (remove dead function), `:301` (add state), `:451-458` (resend button)

**Interfaces:**
- Consumes: `createInvitation`, `getInvitationLink` from `../data/invitationStore` (Task 1) — already imported in Task 6, Step 1.

- [ ] **Step 1: Remove the dead outer `resent` state and `resendInvite` function**

In `EquipeTab`, remove the line (currently line 206):

```tsx
  const [resent, setResent] = useState<string | null>(null);
```

and remove the function (currently lines 216-219):

```tsx
  const resendInvite = (id: string) => {
    setResent(id);
    setTimeout(() => setResent(null), 2000);
  };
```

These are shadowed by `MemberEditPanel`'s own local `resent` state and were never actually read (verified: `resendInvite`/outer `resent` had exactly one call site, the button being replaced in Step 3 below).

- [ ] **Step 2: Add local link state to `MemberEditPanel`**

In `MemberEditPanel`, after the line (currently line 301):

```tsx
    const [resent, setResent] = useState(false);
```

add:

```tsx
    const [resendLink, setResendLink] = useState<string | null>(null);
    const [linkCopied, setLinkCopied] = useState(false);

    const handleResend = () => {
      const invitation = createInvitation(clientId, m.id);
      setResendLink(getInvitationLink(invitation.token));
      setResent(true);
      setTimeout(() => setResent(false), 2000);
    };

    const copyResendLink = () => {
      if (!resendLink) return;
      navigator.clipboard.writeText(resendLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); });
    };
```

- [ ] **Step 3: Replace the resend button block**

Replace (currently `app/src/screens/FicheClient.tsx:451-458`):

```tsx
                {m.status !== 'active' && (
                  <button
                    onClick={() => { resendInvite(m.id); setResent(true); setTimeout(() => setResent(false), 2000); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: resent ? 'rgba(0,200,100,0.08)' : 'var(--surface-2)', cursor: 'pointer', color: resent ? 'var(--ok)' : 'var(--text-2)', fontSize: 13, fontFamily: 'var(--ff-text)', transition: 'all 0.2s', width: '100%', textAlign: 'left' }}>
                    <SFIcon name={resent ? 'check' : 'send'} size={15} color={resent ? 'var(--ok)' : 'var(--text-3)'} />
                    {resent ? t('client.invitationResent') : t('client.resendInvitation')}
                  </button>
                )}
```

with:

```tsx
                {m.status !== 'active' && (
                  <>
                    <button
                      onClick={handleResend}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: resent ? 'rgba(0,200,100,0.08)' : 'var(--surface-2)', cursor: 'pointer', color: resent ? 'var(--ok)' : 'var(--text-2)', fontSize: 13, fontFamily: 'var(--ff-text)', transition: 'all 0.2s', width: '100%', textAlign: 'left' }}>
                      <SFIcon name={resent ? 'check' : 'send'} size={15} color={resent ? 'var(--ok)' : 'var(--text-3)'} />
                      {resent ? t('client.invitationResent') : t('client.resendInvitation')}
                    </button>
                    {resendLink && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input readOnly value={resendLink} onFocus={e => e.currentTarget.select()}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-mono)', outline: 'none' }} />
                        <SFButton variant={linkCopied ? 'primary' : 'secondary'} icon={linkCopied ? 'check' : 'copy'} onClick={copyResendLink}>
                          {linkCopied ? t('client.linkCopied') : t('client.copyLink')}
                        </SFButton>
                      </div>
                    )}
                  </>
                )}
```

- [ ] **Step 4: Typecheck**

Run (from `app/`): `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Manual verification via Preview**

From the client page's "Équipe" tab, click on an `invited` contact to open its member card, click "Renvoyer l'invitation".
Expected: button flips to "Invitation renvoyée !" for 2 seconds, and a copyable link input + "Copier le lien" button appear below it. Click the copy button and confirm it flips to "Lien copié !".

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/FicheClient.tsx
git commit -m "feat: show a real copyable link when resending a client invitation"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Full accept flow**

Via the Preview tool: invite a new contact from a client's "Équipe" tab, copy the generated link, open it in a new tab.
Expected: the pending invitation screen shows the contact's name, the client's name, the studio name, and the permission rows matching the preset chosen at invite time. Click "Accepter l'invitation".
Expected: the acceptance screen appears; back in the original tab, refresh the "Équipe" tab — the contact's badge now reads "Actif" instead of "Invitation envoyée". Open the notification bell (`GlobalTopBar`) — an entry for "a rejoint l'équipe de [Client]" is present and unread.

- [ ] **Step 2: Decline flow**

Invite a second contact, copy its link, open it, click "Refuser".
Expected: the decline screen appears; back in "Équipe", the contact is gone from the list entirely.

- [ ] **Step 3: Reopened-link state**

Reopen the link used in Step 1 (already accepted).
Expected: the acceptance screen renders directly, no Accept/Decline buttons. Reopen the link from Step 2 (already declined) — the decline screen renders directly.

- [ ] **Step 4: Invalid link**

Navigate to `/invitation/does-not-exist`.
Expected: "Lien d'invitation invalide" screen with a link back to `/login`.

- [ ] **Step 5: Final typecheck**

Run (from `app/`): `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Lint**

Run (from `app/`): `npm run lint`
Expected: no errors (warnings pre-existing in the codebase are acceptable; do not introduce new ones).
