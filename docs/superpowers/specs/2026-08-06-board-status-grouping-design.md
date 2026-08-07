# Tableau — organiser par catégorie ou par statut — Design

**Status:** Approuvé par l'utilisateur (2026-08-06).

## Contexte

La vue Tableau (`TravailBoard.tsx`) organise aujourd'hui les tâches en colonnes par **section** (glisser une carte vers une autre colonne change sa section). L'utilisateur veut un mode inspiré de Trello, où les colonnes représentent l'avancement (statut) plutôt que la catégorie — sans perdre le fonctionnement actuel pour ceux qui ne s'en servent pas.

Décisions prises pendant le brainstorm (dans l'ordre où elles ont été tranchées) :

1. **Le statut reste un champ fixe, app-wide** — pas de statuts personnalisables par projet. Le statut alimente déjà des vues transversales (Dashboard, Mes tâches, notifications) ; le rendre personnalisable casserait ces agrégats et viderait de son sens la nouvelle vue par statut. Un futur système de champs personnalisés, si souhaité, sera un chantier séparé et n'est pas dans ce spec.
2. **Ce n'est pas un 3ᵉ mode de vue** — le sélecteur de vue reste Liste / Tableau. À l'intérieur du Tableau, un toggle « Organiser par : Catégorie / Statut » change la clé de regroupement des colonnes.
3. **La colonne "Statut" de la vue Liste devient masquable** — comme les autres colonnes (Priorité, Assigné, Activité, Date) — via un menu "colonnes affichées", préférence par personne (pas par projet).
4. **Renommage "section" → "catégorie"** dans tout le texte visible par l'utilisateur (libellés, placeholders, menus). Le code interne garde `section`/`SectionData`/`sectionLabel` — seul le texte affiché change.
5. **La préférence de vue (Liste/Tableau) et d'organisation (Catégorie/Statut) est individuelle et par projet** — chaque personne garde son propre choix, projet par projet. Utilise le mécanisme existant `useSyncedViewState` (synchronisé par utilisateur via Supabase), en incluant l'id du projet dans la clé de préférence.

## Architecture

### Regroupement par statut dans TravailBoard.tsx

`TravailBoard.tsx` construit aujourd'hui ses colonnes directement à partir de `sections: SectionData[]` (un tableau ordonné de `{ label, tasks, completed }`). Pour supporter les deux regroupements sans dupliquer tout le composant :

- Un nouveau statut de regroupement `boardGroupBy: 'category' | 'status'`, lu/écrit via `useSyncedViewState<'category' | 'status'>('sf_board_groupby_' + projectId, 'category')`.
- Quand `boardGroupBy === 'category'` : comportement actuel, inchangé (colonnes = sections telles que gérées aujourd'hui — création, suppression, renommage, réordonnancement de colonnes restent des opérations de section).
- Quand `boardGroupBy === 'status'` : les colonnes sont dérivées de `STATUS_OPTIONS` (Sans statut, À faire, En cours, Complété, En retard, En révision) — **pas éditables** (pas de renommer/supprimer/réordonner une colonne statut, ce sont les 6 valeurs fixes de l'app). Chaque colonne contient les tâches de **tous les sections confondus** dont `task.status` correspond à la colonne.
- Le composant colonne (`SortableColumn` ou équivalent) reçoit soit une section réelle, soit une "pseudo-section" synthétique `{ label: t(statusOption.labelKey), tasks: [...], completed: false }` construite à la volée pour le rendu — même forme de données, pas de nouveau composant de colonne à écrire.
- **Carte en mode Statut** : affiche en plus une petite étiquette avec le nom de la catégorie (section) d'origine de la tâche — un tag, pas cliquable, purement informatif. En mode Catégorie, pas de changement (comportement actuel).

### Glisser-déposer en mode Statut

Le handler de drop existant (`onTaskDrop` / `handleTaskDrop`, aujourd'hui : retire la tâche de la section source, l'ajoute à la section cible) devient conditionnel sur `boardGroupBy` :

- **Mode Catégorie** : comportement actuel inchangé — `moveTask(projectId, taskId, fromSectionLabel, toSectionLabel)`.
- **Mode Statut** : ne touche PAS à la section de la tâche. Appelle plutôt `updateTask(projectId, taskId, { status: targetStatus, statusLabel: t(targetStatusLabelKey), checked: targetStatus === 'ok' })`.
  - Déposer dans la colonne "Complété" (`status: 'ok'`) coche aussi la tâche (`checked: true`), pour rester cohérent avec la case à cocher utilisée ailleurs dans l'app (compteurs de tâches complétées, Mes tâches, Dashboard).
  - Sortir une tâche de la colonne "Complété" vers une autre colonne statut la décoche (`checked: false`).
  - Retirer une tâche de son statut actuel pour la mettre "Sans statut" est autorisé (dépose dans la colonne "Sans statut" → `status: ''`).

### Colonnes masquables — vue Liste

Nouveau menu (icône colonnes, à côté du sélecteur de vue Liste/Tableau existant) avec une case à cocher par colonne masquable : Statut, Priorité, Assigné à, Activité, Date. Titre et Actions ne sont jamais masquables (colonnes structurelles).

- Préférence stockée via `useSyncedViewState<Record<string, boolean>>('sf_travail_columns', {...toutes visibles par défaut})` — **pas** de suffixe projet (c'est une préférence d'affichage personnelle, pas liée au contenu d'un projet particulier).
- Le rendu du tableau (`<table>` dans `Travail.tsx`, vue Liste) filtre les colonnes affichées à partir de cette préférence, aussi bien pour l'en-tête que pour chaque ligne.

### Renommage "section" → "catégorie"

Recherche/remplacement du texte utilisateur uniquement, dans les fichiers de traduction (`fr.json`/`en.json`) et tout texte en dur restant (`DocumentReview.tsx` n'est pas concerné, aucun texte de section n'y apparaît). Exemples de clés concernées : `board.newSection`, menus contextuels "Renommer la section" / "Supprimer la section", placeholder de création. Les noms de variables, fonctions et types (`SectionData`, `getSections`, `sectionLabel`) ne changent pas.

## Ce qui NE change PAS

- Les vues Mes tâches (`Taches.tsx`), Dashboard, et le modèle de données `Task`/`SectionData` restent inchangés — aucune migration de données.
- La vue Kanban en mode Catégorie garde 100 % de son comportement actuel (création/suppression/renommage/réordonnancement de colonnes, drag inter-catégorie).
- Aucun champ personnalisé n'est introduit dans ce chantier.

## Hors scope

- Champs personnalisés par projet (idée mentionnée pendant le brainstorm, explicitement écartée pour ce chantier — `[[custom-fields-idea-deferred]]` si jamais reconsidéré).
- Statuts personnalisables par projet.
