# Chantier de nettoyage — invitations et fiche membre

**Date :** 2026-07-16
**Contexte :** trois correctifs mis de côté pendant les tests en direct de l'étape B (comptes clients réels). Voir [[client-access-followup-chantier]] (mémoire) pour l'historique complet — deux autres éléments de cette liste (octroi automatique d'accès, atterrissage direct après acceptation) restent reportés à l'étape C, hors scope ici.

## Portée

1. Les écrans d'invitation (client et équipe interne) affichent le logo du studio invitant au lieu de la marque Rush codée en dur.
2. Le pied de la « fiche membre » (`FicheClient.tsx`) passe sur deux lignes pour ne plus tronquer ses boutons d'action.
3. Le sélecteur de permissions internes dans « Ajouter à l'équipe » (Membres d'un projet) ne s'affiche plus quand seuls des contacts client sont sélectionnés.

## 1 — Logo du studio sur les écrans d'invitation

**État actuel :** `ClientInvitationAccept.tsx:19-22` et `TeamInvitationAccept.tsx` (bloc identique) affichent un carré codé en dur (icône `play`) suivi du texte littéral « Rush ». `studioLogoStore.ts` existe déjà et sert `getLogoFull()`/`getLogoSquare()` — mais uniquement pour l'utilisateur **authentifié courant** (résolution via `getStudioId()`), inutilisable pour un visiteur anonyme ouvrant un lien d'invitation.

**Écrans explicitement exclus de ce changement** (aucun studio connu à ce stade, marque Rush générique conservée) : `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `NoOrganization.tsx`, `Pricing.tsx`.

**Changement :**

- `get_client_invitation(p_token)` et `get_studio_invitation(p_token)` (fonctions Postgres `security definer`, déjà utilisées par ces deux écrans pour charger les détails de l'invitation) renvoient deux colonnes supplémentaires : `studio_logo_full`, `studio_logo_square` (lues depuis `studios.logo_full`/`studios.logo_square`). Comme pour l'ajout de `contact_email` à l'étape B, ça nécessite un `drop function` + recréation (Postgres refuse d'élargir un `RETURNS TABLE` via `create or replace`).
- Session réelle : `ClientInvitationAccept.tsx`/`TeamInvitationAccept.tsx` affichent `studioLogoFull` (image) à la place du bloc icône+texte s'il est présent ; sinon, comportement actuel inchangé (repli automatique — même logique que `Sidebar.tsx`, qui gère déjà ce même repli pour l'utilisateur connecté).
- Session démo : pas de changement aux fonctions RPC — les deux écrans lisent directement `getLogoFull()`/`getLogoSquare()` de `studioLogoStore.ts` (déjà accessible en démo, un seul studio local).

## 2 — Mise en page de la fiche membre

**État actuel :** `FicheClient.tsx:619-644` (le pied du panneau `MemberEditPanel`, largeur fixe 420px) aligne jusqu'à 4 éléments sur une seule ligne sans retour ni défilement (« Retirer le contact », un espaceur, « Voir en tant que », « Annuler », « Enregistrer ») — ils ne tiennent pas tous dans 420px pour un contact externe.

**Changement :** le pied de panneau passe de `display: flex` (une ligne) à `flex-direction: column` avec deux rangées :
- Rangée du haut : actions secondaires (« Retirer le contact » à gauche, « Voir en tant que » à droite si applicable).
- Rangée du bas : « Annuler » / « Enregistrer », alignés à droite, comme aujourd'hui.

Aucun changement à la largeur du panneau (420px), à l'état de confirmation de suppression (`confirmDelete`), ni à aucun autre écran ou composant.

## 3 — Sélecteur de permissions redondant

**État actuel :** `AddMemberModal` (`ProjectMembres.tsx`) affiche toujours son sélecteur de permissions internes (Administrateur/Gestionnaire/Collaborateur/Observateur, `PERMISSION_PRESETS`) et appelle `savePermissions(u.id, perms)` pour **chaque** personne sélectionnée, interne ou externe (`ProjectMembres.tsx:79-85`). Pour un contact client, cet appel écrit dans un champ (`PermissionKey[]`, système de permissions internes) que rien ne relit jamais pour un contact externe — les vraies permissions d'un contact client (`PortalPermissions` : approuver/commenter/télécharger) vivent ailleurs (`clientContactsStore.ts`, définies dans `FicheClient.tsx`). L'appel est inoffensif mais visible et déroutant à l'écran.

**Changement :**
- Le bloc de sélection de permissions (presets + description) ne s'affiche que si **au moins un membre interne** figure dans la sélection courante (`picked`).
- `handleConfirm` n'appelle `savePermissions(...)` que pour les utilisateurs internes de la sélection — plus aucun appel pour les contacts externes.
- Aucun changement à `getClientExternalTeam`, à `clientContactsStore.ts`, ni à la façon dont les permissions de portail d'un contact client sont définies (ça reste dans `FicheClient.tsx`, hors scope ici).

## Hors scope (rappel)

- Octroi automatique d'accès aux projets d'un client quand il rejoint l'équipe du client (reporté à l'étape C).
- Atterrissage direct dans le projet après acceptation d'une invitation (reporté à l'étape C).
- Toute refonte plus large du système de permissions (interne vs portail) au-delà de masquer ce sélecteur redondant.
