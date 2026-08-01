# Modèles de projet — quatre corrections — design

## Contexte

Quatre problèmes confirmés en lisant le code réel sur `origin/master` (pas seulement en se fiant à un résumé écrit avant ce chantier). Le point 4 est apparu pendant le brainstorming, en creusant une question de l'utilisateur — il est plus large et plus grave que les trois premiers.

1. Aucun modèle d'Aperçu de base n'existe → le sélecteur de modèle d'Aperçu (assistant « Nouveau projet », éditeur de modèle) disparaît tant qu'un utilisateur n'a pas créé le sien.
2. L'édition d'une tâche de modèle (titre, priorité, assignation) n'existe pas du tout dans l'interface. Le composant `ProjectTaskRow.tsx`, construit pour porter l'assignation multiple, n'est importé nulle part.
3. Appliquer un modèle à un projet ne respecte `removedSystemModules` (une section système supprimée manuellement) que pour Vision — Livrables, Factures, Fichiers et Notes peuvent réapparaître après un changement de modèle même si l'utilisateur les avait explicitement retirées.
4. **Aucun modèle de ressource (Tâches, Fichiers, Aperçu, Document, Scénario, Moodboard, Revue vidéo) n'est éditable de façon durable, nulle part dans l'application.** Le seul bouton « Ouvrir » disponible (que ce soit depuis l'éditeur de modèle de projet ou depuis l'onglet Ressources) route systématiquement vers un mécanisme de « brouillon » jetable — un projet temporaire supprimé dès qu'on quitte l'écran, sans aucune sauvegarde. L'éditeur qui sauvegarde vraiment (`TemplateResourceView`, avec `handleSave`/`saveRes` fonctionnels) existe dans le code mais n'est atteignable, via l'interface, que pour le type Checklist.

Hors scope : le tableau de bord client (`/mon-espace`) est terminé et en ligne, attend seulement un test utilisateur — aucun travail de code ici.

## Correction de trajectoire pendant le brainstorming

Deux erreurs de lecture corrigées en cours de route, consignées ici pour éviter de les refaire en phase de plan :

- **Le point 2 a été mal cadré au premier passage.** `TemplateProjectView` (l'éditeur de modèle de projet) a déjà trois onglets Tâches/Fichiers/Aperçu, chacun affichant le modèle lié — rien à construire de ce côté. Le vrai trou est ailleurs : l'éditeur qui pourrait modifier le CONTENU d'un modèle de tâches (titres, priorités, assignation) n'est branché nulle part (voir point 4).
- **Une question de l'utilisateur** (« si je modifie la section tâches depuis un modèle de projet, ça modifie quoi ? ») a révélé que la question n'avait pas de bonne réponse : ça ne modifie ni l'un ni l'autre, faute de sauvegarde. D'où le point 4.

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

## Point 4 — Rebrancher l'accès à l'éditeur réel (préalable au point 2)

Traité avant le point 2 dans ce document parce que le point 2 en dépend directement : sans ça, une interface d'édition de tâche n'aurait toujours nulle part où sauvegarder.

### Décision de portée

Corriger pour les 7 types de modèle de ressource d'un coup (Tâches, Fichiers, Aperçu, Document, Scénario, Moodboard, Revue vidéo), pas seulement les 3 liés aux modèles de projet — même bouton, même bug, pas de raison de le corriger à moitié.

### Décision de partage

Un modèle de ressource reste un objet **partagé par id** — le modifier depuis n'importe quel point d'entrée modifie l'unique exemplaire, donc tous les modèles de projet qui le référencent voient le changement. Pas de copie privée par modèle de projet. C'est le comportement déjà implicite dans la donnée (référence par id, pas par valeur) — on ne fait que rendre l'édition atteignable, pas changer la sémantique.

### Ce qui change concrètement

- `ResourceTemplateDetail`, prop `onOpen` (`Modeles.tsx`, ~l.2551-2559) : la condition qui route vers `openTemplateDraft` pour `file`/`tasks`/`overview`/`document`/`screenplay`/`moodboard`/`video_review` est supprimée. Tous les types routent vers `setTemplateResViewTpl(selectedRes)` (l'éditeur réel), comme le fait déjà `checklist` implicitement par l'absence de ce type dans la condition actuelle.
- `TemplateProjectView`, prop `onOpenResourceTemplate` (câblée à l'unique site d'appel, `Modeles.tsx` ~l.2647) : actuellement `async tpl => { const ok = await openTemplateDraft(tpl); if (ok) setPreviewTpl(null); }`. À remplacer par une navigation vers le même éditeur réel (`setTemplateResViewTpl(tpl)`), cohérent avec le changement ci-dessus. Décision UX à trancher en phase de plan : fermer l'éditeur de modèle de projet en l'ouvrant, ou garder les deux accessibles (retour possible) — les deux sont défendables, pas bloquant pour la conception.
- `openTemplateDraft`/`createTemplateDraft` : plus jamais appelés depuis ces boutons une fois le correctif fait. À vérifier en phase de plan s'ils ont un autre usage légitime ailleurs (ex. « essayer en conditions réelles » distinct d'éditer) avant de les considérer comme du code mort à retirer — ne pas le faire à l'aveugle, une simple recherche d'usages suffit à trancher.

## Point 2 — Édition de tâche de modèle (titre, priorité, assignation)

Rendu possible par le point 4 : une fois `TemplateResourceView` atteignable pour le type `tasks`, il faut qu'il sache réellement éditer une tâche (aujourd'hui, sa branche `tpl.type === 'tasks'` n'affiche qu'un rendu figé — titre en texte brut, aucune interaction — et `handleSave` n'écrit même pas `sections`).

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
- Colonne « Activité » (compteur de notifications) : sans objet pour une tâche de modèle — masquée via un prop `context?: 'project' | 'template'` (défaut `'project'`) plutôt que de deviner depuis la forme des données.
- `allSections`/`onMoveToSection` (déplacer vers une autre section) : optionnels déjà, restent inutilisés en contexte modèle — pas de changement nécessaire.

### Câblage dans `TemplateResourceView`

Suivre exactement le patron déjà utilisé pour `type === 'overview'` (état local + réécriture au `handleSave`) :

```ts
const [taskSections, setTaskSections] = useState<TemplateSection[]>(tpl.sections ?? []);
```

Dans `renderContentEditor`, remplacer le rendu figé (`<span>{task.title}</span>` + icône) par `ProjectTaskRow` en mode `context="template"`, avec `onUpdate` qui applique le patch à la tâche correspondante dans `taskSections` (immutable update par index de section + index de tâche).

Dans `handleSave` :
```ts
if (tpl.type === 'tasks') {
  updated.sections = taskSections;
}
```

**Point ouvert, pas tranché ici :** la demande initiale portait sur l'édition des champs d'une tâche existante (titre/priorité/assignation) — ce que ce câblage couvre. Ajouter/supprimer une tâche ou une section n'a pas été demandé ni confirmé ; à trancher explicitement en phase de plan si l'éditeur doit aussi permettre de construire la structure, pas seulement modifier des tâches déjà présentes.

### Hors scope (assumé, à confirmer en revue)

- Ne pas migrer `Travail.tsx`/`Taches.tsx` vers `ProjectTaskRow.tsx` — bien que ce soit l'intention d'origine du chantier multi-assignés, c'est un changement à plus haut risque sur des vues en production, distinct de ce chantier.

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

## Ordre d'implémentation

Le point 4 doit être fait avant le point 2 (sans lui, rien à câbler dans un éditeur inatteignable). Les points 1 et 3 sont indépendants et peuvent être faits dans n'importe quel ordre par rapport aux deux autres.

## Vérification

Pas de tests automatisés dans ce projet — vérification via le serveur de preview, dans un worktree dédié :
- Point 1 : le sélecteur de modèle d'Aperçu affiche « Aperçu standard » dans l'assistant Nouveau projet et dans l'éditeur de modèle.
- Point 4 : pour chacun des 7 types de modèle de ressource, ouvrir depuis l'onglet Ressources ET (pour Tâches/Fichiers/Aperçu) depuis l'éditeur de modèle de projet — confirmer l'arrivée dans `TemplateResourceView`, pas dans un projet brouillon.
- Point 2 : dans l'éditeur d'un modèle de tâches, renommer une tâche, changer sa priorité, assigner plusieurs personnes — recharger la page et confirmer la persistance. Ouvrir un DEUXIÈME modèle de projet qui référence le même modèle de tâches, confirmer que le changement y apparaît aussi (édition partagée, décidée explicitement).
- Point 3 : sur un projet réel, supprimer manuellement Factures, appliquer un modèle qui ne la mentionne pas, confirmer qu'elle ne réapparaît pas. Répéter pour Fichiers et Notes.
