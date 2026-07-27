# Sections d'Aperçu personnalisables + modèles d'Aperçu indépendants

Date : 2026-07-27

## Motivation

La page Aperçu d'un projet (`TravailOverview.tsx`) a une structure figée : Vision du projet (5 champs fixes, repliée par défaut), Factures, Livrables client, Fichiers, Notes internes. Trois problèmes soulevés :

1. Vision du projet devrait être dépliée par défaut, et l'état replié/déplié devrait être mémorisé plutôt que réinitialisé à chaque montage.
2. Les champs de Vision sont figés — impossible d'en renommer, ajouter ou retirer.
3. Impossible d'ajouter de nouvelles sections à la page Aperçu.
4. La structure d'Aperçu devrait pouvoir être réutilisée comme modèle, au même titre que la structure de dossiers (`ProjectTemplate.defaultFolderStructureId`) l'est déjà — mais ce précédent n'a pas non plus de moyen de changer de modèle après la création du projet.

## Décisions confirmées avec l'utilisateur

- Personnalisation des champs de Vision **et** ajout de sections entières à la page — bibliothèque de types de blocs, extensible dans le futur, avec 2 types au départ : **Champs personnalisés** (liste de champs texte/texte long qu'on définit) et **Note libre** (une seule zone de texte).
- État ouvert/fermé d'une section : **par utilisateur**, stocké localement (même esprit que le repli de la barre latérale) — pas une préférence partagée par toute l'équipe.
- La structure d'Aperçu doit être un **modèle indépendant**, au même titre que les modèles de formulaire/ressource déjà présents dans Modèles — pas embarquée directement dans le modèle de projet. Un modèle de projet **référence** un modèle d'Aperçu par id (exactement comme il référence déjà un modèle de structure de dossiers via `defaultFolderStructureId`).
- Après la création du projet, on doit pouvoir **changer le modèle d'Aperçu appliqué à CE projet spécifique** sans toucher au reste du projet (tâches, factures, etc.). Cette capacité de changement post-création n'existe pas encore pour les dossiers non plus ; ce chantier l'introduit pour l'Aperçu, avec une architecture générale que la structure de dossiers pourra adopter plus tard (hors scope ici).
- Pas de réordonnancement/masquage des cartes système (Factures, Livrables, Fichiers, Notes) dans cette itération — seulement des sections personnalisées ajoutées après elles.
- Pas de permissions par section — tout le monde sur le projet voit/édite tout, comme aujourd'hui.

## Modèle de données

### Définition d'une section personnalisée

```ts
type OverviewSectionKind = 'fields' | 'note';

interface OverviewFieldDef {
  id: string;
  label: string;
  multiline?: boolean; // texte simple vs texte long
}

interface CustomOverviewSection {
  id: string;
  kind: OverviewSectionKind;
  title: string;
  icon: string;                 // choisi dans la palette d'icônes déjà utilisée ailleurs (Card icon)
  fields?: OverviewFieldDef[];   // uniquement pour kind: 'fields'
}
```

### Nouveau type de modèle : `OverviewTemplate`

Même statut que `FormTemplate`/`ResourceTemplate` — géré dans Modèles, stocké dans une nouvelle table `custom_overview_templates` qui reproduit exactement le pattern déjà utilisé par `custom_project_templates`/`custom_form_templates` (une ligne par modèle, colonne `data jsonb`, remplacement intégral au save — voir `templates.ts` lignes ~503-569 pour le pattern exact à reproduire).

```ts
interface OverviewTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  tags: string[];
  customSections: CustomOverviewSection[]; // structure seulement, jamais de données
  builtIn?: boolean;
  createdAt: string;
}
```

Quelques modèles `builtIn` de départ peuvent être fournis (ex. "Aperçu standard" = vide, juste Vision ; "Aperçu client corporatif" = avec une section Contacts), mais ce n'est pas un prérequis bloquant du chantier — un modèle vide (aucune section personnalisée) est un état parfaitement valide.

### Extensions aux types existants

```ts
// ProjectTemplate (templates.ts) — un nouveau champ optionnel, même pattern que defaultFolderStructureId
interface ProjectTemplate {
  // ...champs existants inchangés...
  defaultOverviewTemplateId?: string;
}

// Project (types/index.ts) — quel modèle d'Aperçu est actuellement appliqué à CE projet
interface Project {
  // ...champs existants inchangés...
  overviewTemplateId?: string;
}
```

`Project.overviewTemplateId` n'est qu'une référence de confort (pour pré-sélectionner le bon modèle si on rouvre le sélecteur plus tard, et pour l'affichage dans Infos du projet) — la source de vérité de la structure RÉELLEMENT appliquée à un projet donné reste `project_content.customSections` (voir plus bas), pas le modèle. Changer de modèle recopie sa structure dans `project_content` ; modifier ensuite une section directement sur le projet ne « casse » pas de lien vivant vers le modèle (comportement cohérent avec les modèles de tâches : un modèle est un point de départ, pas une contrainte permanente).

### Stockage des données réelles d'un projet

Réutilise la table `project_content` déjà migrée cette session (aucune nouvelle migration nécessaire pour cette partie) :

```ts
// ProjectContent (projectContentStore.ts) — étendu
interface ProjectContent {
  notes?: string;
  vision?: ProjectVision;                                        // inchangé, reste la section fixe "Vision du projet"
  customSections?: CustomOverviewSection[];                       // définitions actives, dans l'ordre d'affichage
  customSectionData?: Record<string, string | Record<string, string>>; // valeurs saisies, clé = section.id
}
```

## UI / UX

### Page Aperçu (`TravailOverview.tsx`)

- **Vision du projet** : `defaultOpen: true` (au lieu de `false`).
- L'état ouvert/fermé de **chaque** carte à bascule (Vision + sections personnalisées) est persisté par utilisateur via une clé locale `sf_overview_section_open_<projectId>_<sectionId>` (le composant `Card` local à ce fichier gagne cette persistance au lieu d'un simple `useState(defaultOpen)` qui s'oublie à chaque montage).
- Bouton **« + Ajouter une section »** en bas de la colonne gauche → ouvre un petit picker de bibliothèque (Champs personnalisés / Note libre), demande un titre + icône, puis pour « Champs personnalisés » un mini-éditeur de champs (ajouter/renommer/supprimer/réordonner un champ — même esprit que le form-builder de Modèles).
- Chaque section personnalisée a un menu « ... » : renommer, changer l'icône, modifier les champs (si kind: fields), supprimer.
- Un seul bouton **« Changer de modèle d'Aperçu »**, au niveau de la page (à côté de « + Ajouter une section », pas sur une carte individuelle) → ouvre un sélecteur des `OverviewTemplate` disponibles ; en choisir un remplace l'ensemble de `customSections` (structure) pour CE projet. La carte Vision elle-même n'est jamais affectée par ce changement (elle n'est pas un `CustomOverviewSection`, elle reste toujours présente et indépendante des modèles d'Aperçu).

### Création de projet

Le flux de création de projet (actuellement dans `ProjectsListView.tsx`) gagne, une fois qu'un modèle de projet est choisi, un pré-remplissage `overviewTemplateId = template.defaultOverviewTemplateId` — avec une option de le changer avant de valider (menu déroulant secondaire, comme il en existe déjà un pour la structure de dossiers si `defaultFolderStructureId` est présent).

### Modèles (`Modeles.tsx`)

Nouvelle catégorie **« Modèles d'Aperçu »**, au même niveau que Projets/Formulaires/Ressources — liste, créer, dupliquer, supprimer, éditer (l'éditeur reprend le même mini-éditeur de sections que celui utilisé directement dans l'Aperçu d'un projet, pour ne pas dupliquer l'UI).

Le bouton existant « Enregistrer comme modèle » (aujourd'hui dans `Travail.tsx`, alimenté seulement par les sections de tâches) n'a **pas** besoin d'être étendu pour embarquer les sections d'Aperçu — puisque l'Aperçu est maintenant un modèle séparé et référencé, pas des données embarquées. Ce bouton continue de créer/mettre à jour un `ProjectTemplate` (tâches + `defaultFolderStructureId` + `defaultOverviewTemplateId` s'il y en a un actuellement appliqué au projet).

## Migrations Supabase nécessaires

Une seule nouvelle table + une colonne, toutes deux à exécuter manuellement (comme d'habitude, voir la section correspondante de CLAUDE.md) :

```sql
-- Nouvelle table, même pattern exact que custom_project_templates
create table custom_overview_templates (
  id text primary key,
  studio_id uuid not null references studios(id),
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table custom_overview_templates enable row level security;
create policy "studio members manage their overview templates" on custom_overview_templates
  for all using (studio_id in (select my_studio_ids())) with check (studio_id in (select my_studio_ids()));
grant select, insert, update, delete on custom_overview_templates to authenticated;

-- Nouvelle colonne sur projects
alter table projects add column overview_template_id text;
```

`project_content.content` (jsonb) n'a besoin d'aucune migration — `customSections`/`customSectionData` sont de nouvelles clés dans un blob jsonb déjà existant.

## Hors scope (explicitement, pour cette itération)

- Réordonnancement ou masquage des cartes système (Factures, Livrables, Fichiers, Notes internes).
- Types de blocs au-delà de Champs personnalisés / Note libre.
- Permissions par section.
- Appliquer la même architecture de « modèle par section, changeable après coup » à la structure de dossiers (Fichiers) — mentionné par l'utilisateur comme une direction future, pas à construire maintenant. L'architecture choisie ici (référence par id + donnée réelle séparée dans project_content) est délibérément généralisable à ce cas plus tard, sans le construire prématurément.
