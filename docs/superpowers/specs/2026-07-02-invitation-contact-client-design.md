# Invitation d'un contact client — design

Date : 2026-07-02
Statut : approuvé (en attente de plan d'implémentation)

## Contexte

Rush n'a aucun backend : tout l'état est mock + `localStorage`. Deux modals d'invitation existent déjà (`MonEquipe.tsx` pour l'équipe interne, `FicheClient.tsx` pour les contacts client) mais simulent juste un "envoi" — aucun lien réel n'est généré, et il n'existe aucune page pour qu'un contact accepte ou refuse.

Cette spec couvre uniquement le flux **contact client rejoint l'équipe du client**. Le flux équipe interne (invité depuis Paramètres) est explicitement hors scope et fera l'objet d'une spec séparée.

Modèle métier confirmé avec l'utilisateur : un contact client est d'abord ajouté à l'équipe du client (`clientTeamStore`). Une fois dans l'équipe, l'admin peut décider de l'ajouter à un ou plusieurs projets avec des permissions (mécanisme déjà fonctionnel dans `ProjectMembres.tsx` → `AddMemberModal`, qui pioche dans `getClientExternalTeam(clientId)` sans filtrer par statut — non modifié par cette spec).

## Hors scope (explicite)

- Authentification réelle du portail client (`/portail/:projectId` reste un lien ouvert, comme aujourd'hui).
- Expiration des tokens d'invitation.
- Flux d'invitation équipe interne (Paramètres).
- Modification du mécanisme d'assignation à un projet (`ProjectMembres.tsx`), déjà fonctionnel.
- Envoi d'email réel (aucun backend) — le lien est copié manuellement par l'admin.

## 1. Nouveau store : `app/src/data/invitationStore.ts`

Calqué sur le pattern des autres stores (localStorage via `persist.ts`, `get*`/mutations, pas de `subscribe` nécessaire — la page d'invitation est une lecture ponctuelle par token).

```ts
export interface ClientInvitation {
  token: string;
  clientId: string;
  contactId: string;       // id du ClientContact dans clientTeamStore
  outcome: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}
```

Fonctions :
- `createInvitation(clientId, contactId): ClientInvitation` — si une invitation `pending` existe déjà pour ce `contactId`, la retourne telle quelle (pas de doublon de token). Sinon en crée une nouvelle.
- `getInvitation(token): ClientInvitation | undefined`
- `resolveInvitation(token, outcome: 'accepted' | 'declined'): void`
- `getInvitationLink(token): string` — construit `${window.location.origin}/invitation/${token}`

Pas de nouveau statut sur `ClientContact` (`'active' | 'invited' | 'pending'` inchangé). Refuser retire le contact via `removeClientTeamMember` (existant) ; accepter passe son statut à `'active'`.

## 2. `FicheClient.tsx` — `InviteModal`

- Garde-fou anti-doublon : avant `submit()`, vérifier si l'email existe déjà dans `getClientTeam(clientId)` (actif ou invité) ; si oui, afficher une erreur inline et bloquer l'envoi.
- `submit()` ajoute le contact (inchangé) **et** appelle `createInvitation(clientId, contact.id)`.
- Au lieu de fermer immédiatement, le modal passe à un état "lien généré" : champ en lecture seule avec le lien (`getInvitationLink(token)`) + bouton "Copier" (feedback "Copié !" pendant 2s, `navigator.clipboard.writeText`).
- Le bouton "Renvoyer l'invitation" sur une ligne `invited` (actuellement un `setTimeout` factice) appelle `createInvitation` (qui réutilise le token `pending` existant) et affiche le lien dans une popover à copier, au lieu de juste clignoter "envoyé".

## 3. Nouvelle page `/invitation/:token` — `InvitationAccept.tsx`

Écran standalone (pas d'`AppShell`, même famille visuelle que `Onboarding.tsx`/`Login.tsx`). Route ajoutée dans `main.tsx` à côté de `/portail/:projectId`, **hors** `authLoader` (accessible sans compte).

Comportement selon l'état de l'invitation :
- **Token introuvable** → écran "Lien invalide".
- **`outcome: 'pending'`** → carte avec nom du contact, nom du client, nom du studio, résumé des permissions portail accordées (réutilise `PORTAL_PRESETS` / `matchPortalPreset` de `clientContactsStore.ts`), boutons **Accepter** / **Refuser**.
  - **Accepter** → statut du contact → `active` (via mutation dans `clientTeamStore`), `resolveInvitation(token, 'accepted')`, notification créée (section 4), écran de confirmation "Vous faites maintenant partie de l'équipe de [Client]".
  - **Refuser** → `removeClientTeamMember(clientId, contactId)`, `resolveInvitation(token, 'declined')`, écran "Invitation refusée".
- **`outcome: 'accepted'` ou `'declined'`** (lien réouvert) → page d'état correspondante, sans boutons d'action.

## 4. Notification studio

Extension minimale de `app/src/data/notificationStore.ts` :
- `AppNotif.projectId` devient optionnel (`projectId?: string`).
- Ajout d'un champ optionnel `clientId?: string`.
- Ajout du `NotifKind` `'invitation'`.

À l'acceptation : `addNotif({ kind: 'invitation', actor: contact.name, text: "a rejoint l'équipe de [Client]", clientId, timestamp: Date.now() })`. Apparaît dans la cloche (`GlobalTopBar`) et `Activite.tsx`. Non cliquable (ni `taskId` ni `resourceId`), cohérent avec le comportement actuel pour ce cas de figure — vérifié que `Activite.tsx`/`GlobalTopBar.tsx` ne déréférencent `projectId` nulle part directement.

## 5. i18n

Toutes les nouvelles chaînes (page d'invitation, boutons, messages d'état, erreur de doublon) passent par `t()`. Nouvelles clés à ajouter dans `fr.json` et `en.json` avant utilisation (namespace `invitation.*` suggéré), conformément à la règle critique du projet (pas de texte en dur).

## Points de vérification pour le plan d'implémentation

- Compatibilité TypeScript : `projectId?` optionnel sur `AppNotif` ne doit pas casser les fonctions existantes (`getUnreadForProject`, etc. — filtrage déjà tolérant).
- Test manuel du flux complet : inviter → copier lien → ouvrir dans un nouvel onglet → accepter → vérifier statut `active` dans `FicheClient` + notification dans la cloche → rouvrir le même lien → écran d'état "déjà accepté".
- Test du flux refus : refuser → contact disparu de la liste → lien réouvert → écran "refusée".
- Test anti-doublon : tenter d'inviter un email déjà présent → erreur bloquante.
