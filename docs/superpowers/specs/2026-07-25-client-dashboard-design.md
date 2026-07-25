# Étape C — Tableau de bord client

**Date :** 2026-07-25
**Contexte :** troisième étape du chantier « vues par rôle ». L'étape A (rôles internes) et l'étape B (comptes clients réels + accès en lecture sécurisé) sont livrées et en production. `/mon-espace` n'affiche aujourd'hui qu'une liste brute d'identifiants de projets (`ClientHome.tsx`) — cette étape construit le vrai tableau de bord. Voir [[client-access-followup-chantier]] (mémoire) pour l'historique des décisions déjà prises.

## Portée

1. Un nouveau modèle de partage « visible par défaut, sauf exception » pour les tâches/livrables.
2. L'octroi automatique d'accès aux projets d'un client (actuels et futurs) dès qu'un contact rejoint son équipe.
3. Une vraie liste « Mes projets » à la place du placeholder actuel.
4. Un détail de projet à 4 onglets (Aperçu, Fichiers, Calendrier, Factures), tous en lecture seule.
5. L'atterrissage direct dans le bon projet après acceptation d'une invitation.

Toujours en lecture seule pour cette étape — aucune action d'écriture (approbation, commentaire, paiement) n'est ajoutée ici.

## 1 — Modèle de partage

**Changement de comportement (inversion du défaut actuel) :** `Task.sharedWithClient` (`app/src/types/index.ts:101`) existe déjà mais fonctionne aujourd'hui en *opt-in* — seul `Portail.tsx` (l'ancien portail, non routé) le consomme, en filtrant sur `sharedWithClient` strictement vrai (`Portail.tsx:102`). Le nouveau tableau de bord client filtre plutôt sur `sharedWithClient !== false` — c'est-à-dire visible par défaut (valeur `undefined` ou `true`), caché seulement si explicitement mis à `false` via le bouton œil déjà existant dans `TravailOverview.tsx` (lignes 488-491, aucun changement de code nécessaire à ce bouton, seul le sens implicite de son état par défaut change).

Cette règle s'applique aux tâches/livrables affichés dans les onglets Aperçu et Calendrier du tableau de bord client. Elle ne s'applique pas :
- aux notes internes ou tout contenu explicitement réservé à l'équipe (ex. la section « Notes internes » de `TravailOverview.tsx`, qui n'a jamais été persistée ni destinée au client) — ces éléments ne transitent simplement jamais par une vue client, indépendamment de `sharedWithClient` ;
- aux factures et fichiers, qui n'ont pas de notion de visibilité partielle — tout ce qui est accessible via la sécurité de l'étape B (RLS scopée par projet) est montré tel quel.

## 2 — Octroi automatique d'accès

**Deux nouveaux points de synchronisation**, en plus de celui déjà existant (`syncProjectClientAccess`, appelé depuis `ProjectMembres.tsx` quand un admin modifie manuellement les membres d'un projet précis — ce mécanisme reste la voie de dérogation pour restreindre un contact à un sous-ensemble de projets) :

- **Contact ajouté à l'équipe d'un client** (`FicheClient.tsx`, flux d'ajout/invitation) : synchronise `project_client_access` pour TOUS les projets actuels de ce `client_id`.
- **Nouveau projet créé pour un client** (flux de création de projet, `Projets.tsx` ou équivalent) : synchronise `project_client_access` pour TOUS les contacts actuellement dans l'équipe de ce `client_id`.

Les deux réutilisent la même logique de synchronisation déjà écrite pour l'étape B (diff insert/delete contre l'état actuel de `project_client_access`), appliquée à un ensemble différent (tous les projets d'un client, plutôt que tous les contacts d'un projet).

## 3 — Liste « Mes projets »

`app/src/data/clientSessionStore.ts`'s `getMyClientProjectIds()` ne sélectionne aujourd'hui que la colonne `id` (`clientSessionStore.ts:76`). Une nouvelle fonction `getMyClientProjects()` sélectionne les colonnes déjà présentes sur la table `projects` et déjà exploitées côté studio sans requête supplémentaire (`app/src/types/index.ts:43-66` — `name`, `progress`, `status`, `statusLabel`, `phase`, `phaseLabel`, `deliveryDate`) : la sécurité RLS de l'étape B scope déjà ces lignes au client connecté, aucune règle supplémentaire n'est nécessaire.

`ClientHome.tsx` remplace sa liste de blocs bruts par de vraies cartes (nom du projet, pastille de statut, barre de progression, date de livraison), chacune menant vers `/mon-espace/projets/:id`.

## 4 — Détail d'un projet (4 onglets)

Même convention de navigation que côté studio (une route par section, pas une page qui défile — décision confirmée). Nouvelles routes, toutes sous `/mon-espace/projets/:projectId`, gardées par le même `clientLoader` que `/mon-espace` :

- **Aperçu** (`/mon-espace/projets/:id`) : nouvel écran, inspiré de la structure de l'ancien `Portail.tsx` (carte de progression/phase, liste des livrables partagés) mais avec la vraie plomberie de données de l'étape B (`clientSessionStore`), pas les stores scopés studio de l'ancien portail.
- **Fichiers** (`/mon-espace/projets/:id/fichiers`) : réutilise le composant `FileBrowser` déjà partagé par tout le reste de l'app (convention « FileBrowser single source »), en mode verrouillé au projet. Nécessite un nouveau mode lecture seule sur ce composant (masquer import/suppression/renommage/déplacement) — à vérifier précisément lors du plan d'implémentation, puisque `locked` contrôle aujourd'hui seulement la portée de navigation, pas les permissions d'écriture.
- **Calendrier** (`/mon-espace/projets/:id/calendrier`) : réutilise `ProjetCalendrier.tsx` en mode `embedded` (déjà conçu pour ce type d'intégration). Nécessite le même ajout d'un mode lecture seule (masquer création/édition d'événements) — actuellement toutes les actions CRUD sont exposées sans garde. Les tâches affichées respectent la règle de partage de la section 1.
- **Factures** (`/mon-espace/projets/:id/finances`) : nouvel écran simple (résumé + liste), lecture seule — pas de réutilisation directe de `ProjetFinances.tsx` (entièrement orienté écriture : créer/modifier/supprimer une facture).

## 5 — Atterrissage après acceptation d'invitation

`ClientInvitationAccept.tsx` redirige vers `/mon-espace/projets/:id` (le projet associé à l'invitation acceptée) plutôt que `/mon-espace`, uniquement au moment de l'acceptation. Les connexions normales suivantes continuent d'atterrir sur `/mon-espace` (la liste).

## Sécurité

Toutes les nouvelles vues restent strictement en lecture seule côté interface — aucune action de création/modification/suppression n'est exposée. La sécurité réelle reste portée par les politiques RLS de l'étape B (déjà en lecture seule pour un client), cette étape n'y touche pas ; elle ajoute seulement les deux nouveaux points de synchronisation décrits en section 2, qui suivent le même modèle additif déjà validé (aucune politique existante modifiée).

## Hors scope (rappel)

- Toute action d'écriture côté client (approbation de livrable, commentaire, paiement de facture) — chantier futur séparé.
- Personnalisation par contact des projets visibles au-delà de la dérogation manuelle déjà existante (retirer d'un projet précis via l'écran Membres côté studio).
- Notifications au client (nouveau livrable partagé, facture émise, etc.) — non couvert ici.
