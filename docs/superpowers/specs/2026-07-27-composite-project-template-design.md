# Modèle "Projet" composite — design

## Contexte

Dans Modèles, la catégorie "Projets" édite aujourd'hui un `ProjectTemplate` qui
embarque directement `sections: TemplateSection[]` (la structure de tâches) en
plus de pointeurs `defaultFolderStructureId`/`defaultOverviewTemplateId` vers
des `ResourceTemplate` de type 'file'/'overview'. Le nom "Projets" est trompeur
: son onglet par défaut ('tasks') montre que c'est en fait un éditeur de
structure de tâches, pas un assembleur de modèle de projet.

Demande utilisateur : séparer clairement les deux notions.
1. Ce qui gère aujourd'hui les tâches/sections doit s'appeler "Tâches" et
   devenir un type de modèle réutilisable au même titre que Fichiers/Aperçu.
2. "Projet" doit devenir une chose à part : un modèle composite qui assemble
   un modèle Tâches + un modèle Fichiers + un modèle Aperçu (+ ressources par
   défaut, inchangé).

## Design retenu

### 1. Nouveau type de modèle réutilisable : `'tasks'`

- `ResourceTemplateType` gagne `'tasks'`.
- `ResourceTemplate` gagne `sections?: TemplateSection[]` (le même type
  `TemplateSection` déjà utilisé par `ProjectTemplate.sections` aujourd'hui).
- Traité exactement comme `'overview'` (précédent : Task 7 du chantier Aperçu)
  dans `Modeles.tsx` : nav item, itemCount, `resActive`, `saveCopy`,
  filtre du sélecteur de ressources, aperçu. Icône `list-checks`, label i18n
  `models.resTypeTasks` = "Tâches".
- `BUILT_IN_RESOURCE_TEMPLATES` gagne une entrée `'tasks'` par modèle projet
  intégré existant (ex. `res-tasks-video-sociale`), contenant les `sections`
  aujourd'hui embarquées dans chaque `BUILT_IN_TEMPLATES[i]`.

### 2. `ProjectTemplate` redevient un pur composite ("Projet")

```ts
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  tags: string[];
  resources: TemplateResource[]; // ressources par défaut — inchangé
  builtIn?: boolean;
  createdAt: string;
  tasksTemplateId?: string;            // référence un ResourceTemplate type 'tasks'
  defaultFolderStructureId?: string;   // référence un ResourceTemplate type 'file' — inchangé
  defaultOverviewTemplateId?: string;  // référence un ResourceTemplate type 'overview' — inchangé
}
```

`sections: TemplateSection[]` est retiré de `ProjectTemplate`. Les `BUILT_IN_TEMPLATES`
intégrés sont mis à jour pour référencer `tasksTemplateId` au lieu d'embarquer
`sections`.

### 3. Résolution des sections

```ts
export function resolveTasksSections(tpl: ProjectTemplate): TemplateSection[] {
  if (!tpl.tasksTemplateId) return [];
  const rt = loadAllResourceTemplates().find(r => r.id === tpl.tasksTemplateId && r.type === 'tasks');
  return rt?.sections ?? [];
}
```

Utilisée par `CreateProjectModal` (création du projet) et par l'onglet
"Structure des tâches" de l'éditeur de modèle Projet (lecture seule + bouton
"Changer" pour swapper `tasksTemplateId`, même pattern que le bouton "Changer
de modèle d'Aperçu" déjà construit dans Aperçu).

### 4. Migration des données existantes (custom, non-builtIn)

Les `ProjectTemplate` custom déjà sauvegardés (localStorage démo ou Supabase
réel) ont encore `sections` à l'ancien format, sans `tasksTemplateId`.
Migration **à la lecture uniquement** (même pattern que `migrateLegacyVision`)
dans `loadAllTemplates()` : si un `ProjectTemplate` a des `sections` non vides
mais pas de `tasksTemplateId`, générer à la volée un `ResourceTemplate` de
type `'tasks'` synthétique (id dérivé, ex. `tasks-legacy-${tpl.id}`), l'ajouter
en mémoire à la liste retournée par `loadAllResourceTemplates()`, et faire
pointer `tpl.tasksTemplateId` vers cet id dans l'objet renvoyé par
`loadAllTemplates()`. Purement une lecture de confort — n'écrit rien tant que
l'utilisateur ne resauvegarde pas explicitement le modèle Projet.

### 5. Nav et UI de Modèles.tsx

- Nouvelle catégorie nav "Tâches" (clé `tasks`), gérée par le mécanisme
  générique déjà utilisé pour 'file'/'overview' (éditeur de ressource
  générique, pas de nouvel écran dédié).
- La catégorie "Projets" garde son nom et sa place, mais son contenu change :
  ses onglets deviennent "Structure des tâches" (affiche/permet de changer
  `tasksTemplateId`), "Structure de fichiers" (idem `defaultFolderStructureId`,
  déjà en grande partie câblé), "Aperçu" (idem `defaultOverviewTemplateId`,
  déjà câblé Task 7/8), "Ressources par défaut" (onglet `resources` existant,
  inchangé).
- Label `models.resTypeOverview` déjà renommé "Aperçu" (fait, hors chantier).

### 6. Wizard nouveau projet (`ProjectsListView.tsx`)

- Le choix du modèle "Projet" (composite) reste la première étape, inchangée.
- Les pickers "structure de fichiers" et "modèle d'Aperçu" existants restent
  (override ponctuel à la création), valeur par défaut inchangée
  (`tpl.defaultFolderStructureId`/`tpl.defaultOverviewTemplateId`).
- Nouveau : picker "Structure de tâches" ajouté au même endroit, par défaut
  `tpl.tasksTemplateId`, override possible — pour cohérence avec les deux
  autres.
- `CreateProjectModal` utilise `resolveTasksSections()` au lieu de lire
  `tpl.sections` directement.

## Hors scope (explicitement laissé de côté)

- Pas de renommage de `defaultFolderStructureId` → `filesTemplateId` (touche
  trop de sites pour un gain cosmétique).
- Pas de migration destructive des données existantes — uniquement une
  résolution à la lecture.
- `resources: TemplateResource[]` (ressources par défaut du projet — scénario,
  moodboard, etc.) reste embarqué tel quel sur `ProjectTemplate`, ce n'est pas
  l'une des trois catégories nommées par l'utilisateur.
