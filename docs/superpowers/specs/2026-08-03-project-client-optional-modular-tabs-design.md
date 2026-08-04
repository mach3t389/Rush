# Projet indépendant du client + onglets modulaires — Design

## Contexte

Aujourd'hui, `Project.clientId` est un champ obligatoire (`app/src/types/index.ts:46`), utilisé partout dans l'app pour la couleur, le nom affiché, le regroupement, et surtout Finances (une facture est directement rattachée à un client). L'assistant "Nouveau projet" (`ProjectsListView.tsx`) force même la création d'un client si le studio n'en a aucun — il n'existe aucun chemin pour créer un projet sans client.

Ce chantier rend le client **optionnel** sur un projet ("projet personnel"), et introduit des **onglets modulaires** (Calendrier / Fichiers / Finance) qu'on peut activer ou désactiver par projet.

**Hors scope pour ce chantier** (chantiers séparés, à faire plus tard) :
- Les "Groupes" réutilisables de personnes assignables à plusieurs projets.
- La simplification du système de permission client (arrêter la propagation automatique de tous les contacts d'un client vers chaque nouveau projet) — sujet du chantier suivant.

## Modèle de données

### `projects` (Supabase + type `Project`)

- `client_id` (Supabase) / `clientId` (type) : passe de **obligatoire** à **optionnel** (`string | null`). Reste une colonne texte dénormalisée (pas de FK aujourd'hui, comportement inchangé) — juste la contrainte NOT NULL/valeur par défaut `''` qui saute. `clientName`/`clientColor` deviennent optionnels en cohérence.
- Trois nouvelles colonnes booléennes, toutes avec une valeur par défaut `true` en base (pour que la migration des lignes existantes soit triviale — voir plus bas) :
  - `calendar_enabled` / `calendarEnabled`
  - `files_enabled` / `filesEnabled`
  - `finance_enabled` / `financeEnabled`

### Règle de cohérence Finance ↔ Client

`financeEnabled` ne peut être `true` que si `clientId` est renseigné. Cette règle est appliquée :
- **Côté UI** : la case à cocher "Finance" de l'assistant de création et du panneau d'édition du projet est désactivée (grisée) tant qu'aucun client n'est sélectionné.
- **Côté store** (`projectStore.ts`) : si `clientId` est retiré d'un projet existant (`updateProject`), `financeEnabled` est forcé à `false` dans la même opération — jamais d'état incohérent "Finance activé, pas de client" en base.
- Retirer le client d'un projet qui a déjà des factures **ne supprime rien** — les factures restent en base, l'onglet Finance disparaît juste de l'UI. Si un client est rattaché de nouveau plus tard, l'onglet (et les factures) réapparaissent tels quels.

## Comportement de l'assistant "Nouveau projet"

- L'étape client (`ProjectsListView.tsx`, step `'info'`) devient explicitement optionnelle : un bouton/lien "Créer un projet personnel, sans client" à côté du sélecteur de client existant.
- Nouvelle sous-section "Fonctionnalités de ce projet" (même étape ou une nouvelle étape courte) avec 3 cases à cocher :
  - Calendrier — cochée par défaut.
  - Fichiers — cochée par défaut.
  - Finance — cochée par défaut **si et seulement si** un client a été choisi à cette étape ; décochée et grisée sinon. Si le plan d'abonnement du studio ne couvre pas Finances (gating existant, `planFeatures.ts`), la case reste grisée avec le même mécanisme d'invitation à mettre à niveau qu'ailleurs dans l'app, peu importe la présence d'un client.
- Le studio sans aucun client actif (correctif du 2026-08-03, `ProjectsListView.tsx`) garde son comportement actuel de proposer de créer un premier client **si l'utilisateur choisit d'en avoir un** — mais le bouton "Projet personnel" reste disponible en tout temps, y compris pour ce studio.

## Comportement dans l'écran projet (Travail / TravailOverview)

- La barre de navigation du projet (Aperçu / Tâches / Calendrier / Fichiers / Finance / Équipe / Activité) masque les onglets Calendrier/Fichiers/Finance dont le booléen correspondant est `false` pour ce projet. Aperçu, Tâches, Équipe, Activité restent toujours visibles — non modulables, ce sont les fondations d'un projet dans l'app.
- Ces trois réglages sont modifiables après la création, depuis le même endroit que les autres réglages du projet (panneau d'édition, `ProjectEditPanel` — voir [[project-edit-persistence]]).

## Cohérence dans les vues globales

Un module désactivé sur un projet le rend invisible partout où ce projet apparaît en agrégat dans une vue globale, pas seulement dans sa propre page :

- **Calendrier global** (`CalendrierGlobal.tsx`) : le projet n'apparaît pas dans la liste de filtres par projet ; ses événements (s'il y en avait avant la désactivation) restent en base mais ne s'affichent nulle part tant que Calendrier n'est pas réactivé pour ce projet.
- **Fichiers global** (`FichiersGlobal.tsx`) : le projet n'apparaît pas dans l'arborescence globale ni dans les filtres si Fichiers est désactivé.
- **Finances** (`Finances.tsx`) : le projet n'apparaît pas dans les listes/filtres de factures par projet si Finance est désactivé (ou si le projet n'a pas de client).

Dans les trois cas : c'est un filtre d'affichage, jamais une suppression de données. Réactiver le module fait tout réapparaître intact.

## Migration (données existantes)

Migration SQL unique, à exécuter manuellement dans Supabase → SQL Editor (comme toutes les migrations de ce projet — rien ne s'applique automatiquement) :

```sql
alter table projects alter column client_id drop not null;
alter table projects add column if not exists calendar_enabled boolean not null default true;
alter table projects add column if not exists files_enabled boolean not null default true;
alter table projects add column if not exists finance_enabled boolean not null default true;
```

Comme les trois nouvelles colonnes ont `default true`, **tous les projets existants gardent leurs trois onglets visibles immédiatement après la migration** — aucun changement visible pour les utilisateurs actuels tant qu'ils ne désactivent pas explicitement un module. `client_id` existant sur chaque projet reste inchangé (aucune ligne n'est mise à `null` par cette migration).

## Ce qui ne change pas

- L'assignation de personnes à un projet (`project.members`) reste telle quelle — individus uniquement pour ce chantier, Groupes reportés.
- Le système de permission client (`project_client_access`, propagation automatique) n'est pas touché ici — chantier séparé à venir.
- Aucune donnée n'est supprimée ni convertie de force ; ce chantier n'ajoute que des colonnes nullables/à valeur par défaut permissive.
