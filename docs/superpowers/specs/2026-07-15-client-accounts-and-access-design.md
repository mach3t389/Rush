# Étape B — Comptes clients réels et sécurité des données (accès en lecture)

**Date :** 2026-07-15
**Contexte :** deuxième étape du chantier « vues par rôle » (voir [2026-07-15-access-level-roles-design.md](2026-07-15-access-level-roles-design.md) pour l'étape A, déjà livrée). Cette étape donne aux contacts clients invités un vrai compte, et sécurise (côté base de données, pas seulement côté interface) l'accès en lecture aux données de leurs projets. Le tableau de bord client lui-même (l'écran que le client voit) est l'étape C, hors scope ici.

## État actuel (contexte du problème)

- Un `client_contact` (table `client_contacts`) appartient à exactement un `client_id` (l'entreprise), jamais à un projet directement — pas de colonne `project_id`, pas de table de liaison.
- L'accès à un projet précis est déterminé par le tableau `members` (JSONB) intégré directement dans la fiche `projects` — pas une vraie relation interrogeable. `ProjectMembres.tsx` y ajoute/retire des contacts.
- Un contact client invité aujourd'hui **n'obtient jamais de compte** : `resolve_client_invitation()` (RPC, `docs/superpowers/specs/2026-07-10-client-invitations-supabase-migration.sql:55-78`) se contente de passer `client_contacts.status` à `'active'` — aucune création de compte Supabase Auth.
- Le portail actuel (`/portail/:projectId`, route sans garde) fonctionne en pratique uniquement pour un visiteur **déjà connecté comme membre du studio** — il appelle les mêmes fonctions (`projectStore`, `taskStore`, `financeStore`) que le reste de l'app, qui exigent toutes un `studio_id` résolu via `getStudioId()`. Un vrai visiteur externe anonyme n'a jamais eu de chemin d'accès fonctionnel à ces données réelles ; seul le mode démo simule cette expérience aujourd'hui.
- **Piège découvert :** `getStudioId()` (`app/src/data/studioStore.ts:67-78`) ne renvoie jamais d'erreur « pas de studio » — si l'utilisateur authentifié n'a aucune ligne dans `studio_members`, elle lui **crée automatiquement un nouveau studio vide** (`provisionNewStudio`). Un compte client, s'il touchait par erreur une fonction studio-scoped existante, se retrouverait avec un studio fantôme au lieu d'un refus propre.
- Aucune règle RLS existante dans ce projet ne gère une identité authentifiée qui **n'est pas** dans `studio_members` — chaque politique actuelle vérifie « es-tu le propriétaire du studio » ou « es-tu dans `studio_members` de ce studio ». Ce serait la première fois qu'un second type d'identité authentifiée obtient un accès en lecture direct (via RLS) aux tables de données réelles.

## Décisions de portée (déjà validées)

- Un client voit : statut/avancement du projet, fichiers et livrables, tâches/calendrier, factures — **en lecture seule** pour cette étape (pas d'approbation, pas de commentaires — chantier futur séparé).
- L'ancien système de lien token sans compte (`/portail/:projectId`, `client_invitations` → `resolve_client_invitation`) est **remplacé**, pas conservé en parallèle.
- Le tableau de bord client (l'UI) est hors scope — cette étape s'arrête à un écran minimal de confirmation post-connexion, juste assez pour prouver que l'accès aux données fonctionne.

## Architecture

### 1. Lier un contact client à un vrai compte

- Nouvelle colonne `client_contacts.user_id` (uuid, nullable, référence `auth.users.id`) — `null` tant que le contact n'a pas de compte, peuplée à l'acceptation de l'invitation.
- Le flux d'acceptation est reconstruit sur le même modèle que celui des invitations d'équipe interne (`TeamInvitationAccept.tsx` / `accept_studio_invitation`, étape A) : nouvel écran `ClientInvitationAccept.tsx`, qui propose « J'ai déjà un compte » (connexion) ou « Créer un compte » (email + mot de passe, l'e-mail étant celui de l'invitation, non modifiable).
- Nouvelle fonction RPC `accept_client_invitation(token)` (security definer, même famille que `accept_studio_invitation`) : vérifie que l'e-mail du compte connecté correspond bien à celui de l'invitation (leçon tirée d'un bug de sécurité corrigé après coup à l'étape équipe — appliquée dès le départ ici), puis pose `client_contacts.user_id = auth.uid()` et `status = 'active'`, et marque l'invitation acceptée. Le chemin « refuser » reste géré par `resolve_client_invitation(token, 'declined')`, inchangé.
- `get_client_invitation()` est étendu pour renvoyer aussi l'e-mail du contact (nécessaire pour préremplir le formulaire de compte, comme le fait déjà l'équivalent équipe interne).

### 2. Savoir « qui se connecte » avant de toucher aux données studio

- Nouvelle fonction `isClientSession()` (ou équivalent) dans une nouvelle petite couche d'identité — vérifie si l'utilisateur Supabase authentifié courant a une ligne `client_contacts` avec `user_id = auth.uid()`.
- Cette vérification doit se faire **avant** tout appel à une fonction studio-scoped (`getStudioId()` et tout ce qui en dépend). Concrètement : un nouveau garde de route (loader) distinct de `authLoader` protège l'arborescence `AppShell` existante — un utilisateur identifié comme client y est redirigé ailleurs (vers son propre espace, l'écran minimal de cette étape) et n'atteint jamais un composant qui appellerait `getStudioId()`.
- Les comptes clients ne créent donc jamais de studio fantôme : ils ne passent tout simplement jamais par ce chemin de code.

### 3. De quels projets un client a-t-il le droit de lire les données

- Le tableau `members` (JSONB) sur `projects` reste la source d'affichage pour l'écran « Membres » existant — **aucun changement** à `ProjectMembres.tsx` ni à la façon dont l'équipe interne gère cette liste.
- Nouvelle table technique légère `project_client_access (project_id, client_contact_id, studio_id)`, tenue à jour automatiquement (un seul point d'écriture, dans la fonction qui persiste déjà les membres d'un projet) chaque fois qu'un contact client est ajouté ou retiré des membres d'un projet. C'est cette table — indexable, simple à interroger — qui sert de base à toutes les règles RLS ci-dessous, plutôt que d'essayer d'interroger le JSONB directement (lent, non indexable, fragile).
- Risque assumé : deux représentations de la même information (le tableau `members` pour l'affichage, la table `project_client_access` pour la sécurité) doivent rester synchronisées. Le risque est limité en n'ayant qu'un seul point d'écriture applicatif qui les met à jour ensemble.

### 4. Règles de sécurité (RLS), lecture seule, sur 5 zones de données

Pour chacune des tables suivantes, une nouvelle politique **select** est ajoutée (en plus des politiques existantes propriétaire/membre du studio, inchangées) : le projet concerné doit apparaître dans `project_client_access` pour un `client_contact` lié au compte connecté (`user_id = auth.uid()`).

| Donnée | Table(s) concernée(s) |
|--------|------------------------|
| Statut du projet | `projects` |
| Fichiers et livrables | `resources`, `resource_content`, `file_folders`, `file_items` |
| Tâches / calendrier | `sections`, `tasks` |
| Factures | `invoices` |

Chaque table de cette liste a déjà une colonne `project_id` (confirmée pour fichiers/ressources dans `docs/superpowers/specs/2026-07-06-files-metadata-supabase-migration-design.md` ; à confirmer pour `tasks`/`invoices` au moment du plan d'implémentation) — la nouvelle règle se formule donc comme « ce `project_id` fait partie de ceux accessibles au contact client connecté », en s'appuyant sur `project_client_access`.

### 5. Remplacement de l'ancien portail

- La route `/portail/:projectId` et le flux `client_invitations` → lien token → accès anonyme sont retirés (ou explicitement désactivés) au profit du nouveau flux par compte.
- Un client qui n'a pas encore de compte et clique un ancien lien reçoit un message clair l'invitant à créer son compte via le nouveau flux d'invitation.

## Ce qui reste hors scope (rappel)

- Le tableau de bord client complet (étape C) — cette étape ne livre qu'un écran minimal post-connexion prouvant que la lecture des données fonctionne.
- Les actions d'écriture côté client (approbation de livrables, commentaires) — chantier futur séparé.
- La bascule admin pour prévisualiser la vue d'un client (étape D) — dépend de cette étape mais n'est pas construite ici.
- Le transfert/la fusion d'un contact client existant possédant déjà un compte vers un autre client (un contact reste lié à une seule entreprise, comme aujourd'hui).

## Suite du chantier (pour mémoire)

- **Étape C** — Dashboard client multi-projets (nouvelle vue, consommant l'accès posé ici).
- **Étape D** — Sélecteur admin pour prévisualiser l'app comme n'importe quel usager, y compris un client réel, en s'appuyant sur cette étape.
