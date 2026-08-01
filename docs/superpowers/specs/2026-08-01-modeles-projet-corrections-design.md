# Modèles de projet — trois corrections — design

## Contexte

Trois problèmes confirmés en lisant le code réel sur `origin/master` (pas seulement en se fiant à un résumé écrit avant ce chantier) :

1. Aucun modèle d'Aperçu de base n'existe → le sélecteur de modèle d'Aperçu (assistant « Nouveau projet », éditeur de modèle) disparaît tant qu'un utilisateur n'a pas créé le sien.
2. L'édition d'une tâche de modèle (titre, priorité, assignation) n'existe pas du tout dans l'interface — ni dans l'aperçu de `TemplateProjectView`, ni dans celui de `TemplateResourceView`. Le composant `ProjectTaskRow.tsx`, construit pour porter l'assignation multiple, n'est importé nulle part.
3. Appliquer un modèle à un projet ne respecte `removedSystemModules` (une section système supprimée manuellement) que pour Vision — Livrables, Factures, Fichiers et Notes peuvent réapparaître après un changement de modèle même si l'utilisateur les avait explicitement retirées.

Hors scope : le tableau de bord client (`/mon-espace`) est terminé et en ligne, attend seulement un test utilisateur — aucun travail de code ici.

## Point 1 — Modèle d'Aperçu de base

Ajouter une entrée dans `BUILT_IN_RESOURCE_TEMPLATES` (`app/src/data/templates.ts`), à la suite des entrées `type: 'moodboard'` existantes :

```ts
{
  id: 'res-overview-base',
  type: 'overview',
  name: 'Aperçu standard',
  description: 'Structure de base pour l\'onglet Aperçu — les modules Vision, Livrables, Factures, Fichiers et Notes internes s\'appliquent déjà automatiquement à tout projet, ce modèle n\'a donc rien à ajouter.',
  color: '#6b7280',
  icon: 'layout-grid',
  tags: ['Standard'],
  builtIn: true,
  createdAt: '2025-01-01',
  overviewSections: [],
},
```

`overviewSections: []` est correct et suffisant : les 5 modules système (Vision/Livrables/Factures/Fichiers/Notes) sont insérés automatiquement à la migration de lecture d'un projet (`SYSTEM_MODULES` dans `projectContentStore.ts`), indépendamment du modèle appliqué. Ce modèle sert uniquement à peupler le sélecteur — texte français en dur, cohérent avec les 10 entrées déjà présentes dans ce tableau.

Aucun autre fichier à toucher : les trois consommateurs déjà identifiés (`ProjectsListView.tsx` l.102-104, `Modeles.tsx` l.1123, `TravailOverview.tsx` l.669/799) filtrent sur `type === 'overview'` et afficheront cette entrée sans changement de leur côté.

## Point 2 — Édition de tâche de modèle (titre, priorité, assignation)

### Où l'édition doit vivre

`TemplateResourceView` (`Modeles.tsx`), branche `tpl.type === 'tasks'`, est le seul endroit qui possède et sauvegarde réellement `template.sections` (`handleSave` y écrit `updated.sections`). `TemplateProjectView` ne fait qu'afficher un aperçu du modèle de tâches lié et route déjà vers cet éditeur via son bouton « Ouvrir » — elle n'a donc rien à gagner en édition propre, seulement en affichage (voir ci-dessous).

### Adapter `ProjectTaskRow.tsx`

Son prop `task: Task` exige des champs que `TemplateTask` n'a pas (`id`, `projectId`, `checked`, `status`/`statusLabel` obligatoires). Comme ce composant n'est importé nulle part aujourd'hui, élargir son typage ne casse rien.

- Introduire un type minimal couvrant les deux contextes :
  ```ts
  type RowTask = Pick<Task, 'title' | 'priority' | 'assignees'> & {
    checked?: boolean;
    status?: string;
    statusLabel?: string;
    dueDate?: string;
    subtasks?: RowTask[];
  };
  ```
  et changer la prop `task: Task` en `task: RowTask`. Les endroits qui lisent `task.checked`/`task.status` avec la certitude qu'ils existent (case à cocher, pastille de statut) doivent gérer leur absence proprement — case à cocher masquée si `checked === undefined`, statut affiché seulement si `status` a une valeur (déjà le comportement existant pour un statut vide).
- Colonne « Activité » (compteur de notifications) : sans objet pour une tâche de modèle — masquée quand `onSelect`/le contexte l'indique absent, via un prop `context?: 'project' | 'template'` (défaut `'project'`) plutôt que de deviner depuis la forme des données.
- `allSections`/`onMoveToSection` (déplacer vers une autre section) : optionnels déjà, restent inutilisés en contexte modèle — pas de changement nécessaire.

### Câblage dans `TemplateResourceView`

Suivre exactement le patron déjà utilisé pour `type === 'overview'` (état local + réécriture au `handleSave`) :

```ts
const [taskSections, setTaskSections] = useState<TemplateSection[]>(tpl.sections ?? []);
```

Dans `renderContentEditor`, remplacer le rendu figé (`<span>{task.title}</span>` + icône) par `ProjectTaskRow` en mode `context="template"`, avec `onUpdate` qui applique le patch à la tâche correspondante dans `taskSections` (immutable update par index de section + index de tâche).

**Point ouvert, pas tranché ici :** la demande initiale portait sur l'édition des champs d'une tâche existante (titre/priorité/assignation) — ce que ce câblage couvre. Ajouter/supprimer une tâche ou une section n'a pas été demandé ni confirmé ; à trancher explicitement en phase de plan si l'éditeur doit aussi permettre de construire la structure, pas seulement modifier des tâches déjà présentes dans le modèle.

Dans `handleSave` :
```ts
if (tpl.type === 'tasks') {
  updated.sections = taskSections;
}
```

### `TemplateProjectView` (aperçu)

Reste un aperçu en lecture seule — mais lui ajouter l'affichage (non éditable) des avatars assignés à côté du badge de priorité déjà présent, pour cohérence visuelle avec ce que l'éditeur montrera désormais. Le lien « Ouvrir » reste le seul chemin vers l'édition.

### Hors scope (assumé, à confirmer en revue)

- Ne pas migrer `Travail.tsx`/`Taches.tsx` vers `ProjectTaskRow.tsx` — bien que ce soit l'intention d'origine du chantier multi-assignés, c'est un changement à plus haut risque sur des vues en production, distinct des trois corrections demandées ici.
- Le mécanisme de « brouillon jetable » (`openTemplateDraft`) n'est pas touché — il reste un aperçu « essayer en conditions réelles », désormais redondant avec l'édition inline mais pas nuisible.

## Point 3 — Étendre `removedSystemModules` à Livrables/Factures/Fichiers/Notes

Dans `TravailOverview.tsx`, `applyTemplateById` (~l.660-687) applique déjà la garde pour Vision :

```ts
const vision = removedSystemModules.includes(VISION_SECTION_ID)
  ? null
  : (customSections.find(s => s.id === VISION_SECTION_ID) ?? getDefaultVisionSection());
```

Généraliser ce test aux 4 autres ids système (`DELIVERABLES_SECTION_ID`, `INVOICES_SECTION_ID`, `FILES_SECTION_ID`, `NOTES_SECTION_ID`) — soit en dupliquant le même bloc pour chacun, soit (préférable, moins de répétition) en itérant sur `SYSTEM_MODULES` (déjà exporté par `projectContentStore.ts`) :

```ts
const systemSections = SYSTEM_MODULES
  .filter(m => !removedSystemModules.includes(m.id))
  .map(m => customSections.find(s => s.id === m.id) ?? m.factory());
const newSections = [
  ...systemSections,
  ...(tpl?.overviewSections ?? []).filter(s => !SYSTEM_SECTION_IDS.includes(s.id)),
];
```

Vérifier au passage qu'aucun autre point d'insertion des modules système (migration à la lecture, `applyLoadedContent`) ne duplique cette logique avec la même limitation à corriger séparément — sinon la corriger au même endroit pour éviter une deuxième source de vérité.

## Vérification

Pas de tests automatisés dans ce projet — vérification via le serveur de preview, dans un worktree dédié :
- Point 1 : le sélecteur de modèle d'Aperçu affiche « Aperçu standard » dans l'assistant Nouveau projet et dans l'éditeur de modèle.
- Point 2 : dans l'éditeur d'un modèle de tâches, renommer une tâche, changer sa priorité, assigner plusieurs personnes — recharger la page et confirmer la persistance.
- Point 3 : sur un projet réel, supprimer manuellement Factures, appliquer un modèle qui ne la mentionne pas, confirmer qu'elle ne réapparaît pas. Répéter pour Fichiers et Notes.
