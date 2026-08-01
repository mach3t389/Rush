# Modèles de projet — quatre corrections — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger quatre problèmes confirmés dans le système de modèles de projet de Rush : (1) aucun modèle d'Aperçu de base disponible, (2) aucune édition possible du contenu d'un modèle de tâches, (3) `removedSystemModules` respecté seulement pour Vision au lieu des 5 modules système, (4) les boutons « Ouvrir »/« Nouveau modèle » routent vers un mécanisme de brouillon jetable au lieu des éditeurs qui sauvegardent réellement, pour 7 des 8 types de modèle de ressource.

**Architecture:** Tout le travail se fait dans `app/src/screens/Modeles.tsx` (2653 lignes), `app/src/components/ProjectTaskRow.tsx` (élargi pour accepter les tâches de modèle en plus des vraies tâches), `app/src/data/templates.ts` (nouveau modèle intégré + type élargi) et `app/src/screens/TravailOverview.tsx` (une fonction). Aucune migration Supabase, aucun nouveau fichier.

**Tech Stack:** React 19 + TypeScript, pas de tests automatisés — vérification via le serveur de preview (voir CLAUDE.md du dépôt).

## Global Constraints

- Travailler dans un worktree neuf créé avec l'outil natif `EnterWorktree` (jamais éditer `D:\Vibe Coding\Rush` directement — dossier partagé avec d'autres sessions). Si la session est déjà dans un worktree, `ExitWorktree action:"keep"` d'abord.
- Le dossier local est régulièrement en retard sur `origin/master` — le worktree neuf part de `origin/master` à jour, donc les numéros de ligne cités dans ce plan doivent correspondre. S'ils ne correspondent pas exactement, chercher par le texte cité, pas par le numéro de ligne seul.
- Copier `app/.env` et `app/.env.local` depuis le dépôt principal dans le worktree neuf juste après sa création (gitignorés, absents d'un worktree neuf — sans eux React ne monte pas du tout, page blanche sans erreur console).
- Vérification : `"$WORKTREE/app/node_modules/.bin/tsc" --noEmit -p "$WORKTREE/app/tsconfig.app.json"` doit être propre (0 sortie) après chaque tâche. `npx tsc --noEmit` seul donne un faux positif (0 fichier compilé) — toujours passer `-p tsconfig.app.json`.
- Aucun texte utilisateur en dur avec `t()` requis pour CE chantier : les modèles intégrés (`BUILT_IN_RESOURCE_TEMPLATES`) utilisent déjà du texte français en dur par convention établie (voir les 10 entrées existantes dans `templates.ts`) — ne pas introduire de clé i18n pour la nouvelle entrée du Point 1.
- Ordre obligatoire : Tâche 2 (routage) avant Tâche 3 (édition des tâches) — la Tâche 3 câble une interface dans un éditeur qui doit d'abord être atteignable. Tâches 1 et 4 sont indépendantes, faisables dans n'importe quel ordre.
- Chaque tâche se termine par un commit séparé.

---

### Task 1: Modèle d'Aperçu de base

**Files:**
- Modify: `app/src/data/templates.ts`

**Interfaces:**
- Consumes: rien (tâche indépendante)
- Produces: rien consommé par une autre tâche de ce plan

- [ ] **Step 1: Localiser le point d'insertion**

Dans `app/src/data/templates.ts`, trouver le tableau `BUILT_IN_RESOURCE_TEMPLATES`. Chercher le texte `// ── Tâches ──` (commentaire de section précédant les 4 entrées `type: 'tasks'`). L'entrée à ajouter va juste avant ce commentaire, à la suite de la dernière entrée `type: 'moodboard'` (id `res-moodboard-corporate`).

- [ ] **Step 2: Ajouter l'entrée**

Insérer ce bloc juste avant `// ── Tâches ──` :

```ts
  // ── Aperçu ──
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

- [ ] **Step 3: Vérifier le typecheck**

```bash
"$WORKTREE/app/node_modules/.bin/tsc" --noEmit -p "$WORKTREE/app/tsconfig.app.json"
```
Expected: aucune sortie.

- [ ] **Step 4: Vérifier en direct**

Démarrer le serveur de preview du worktree (voir Global Constraints pour `.env`/launch.json). Se connecter (compte démo), ouvrir l'assistant « Nouveau projet » → onglet départ → confirmer que « Aperçu standard » apparaît maintenant comme option (ou, plus simple : dans la page Modèles, filtrer par type « Aperçu », confirmer qu'une entrée « Aperçu standard » (badge Officiel) apparaît dans la liste).

- [ ] **Step 5: Commit**

```bash
git add app/src/data/templates.ts
git commit -m "feat(templates): ajoute le modèle d'Aperçu de base manquant"
```

---

### Task 2: Rebrancher les boutons "Ouvrir"/"Nouveau modèle" vers les vrais éditeurs

**Files:**
- Modify: `app/src/screens/Modeles.tsx`

**Interfaces:**
- Consumes: rien
- Produces: pour les 7 types de modèle de ressource (`file`, `tasks`, `overview`, `document`, `screenplay`, `moodboard`, `video_review`), « Nouveau modèle » ouvre désormais `ResourceTemplateEditor` (au lieu de `openNewTemplateDraft`) et « Ouvrir » sur un modèle existant ouvre `TemplateResourceView` (au lieu de `openTemplateDraft`). La Tâche 3 s'appuie sur cette atteignabilité pour câbler l'édition du contenu Tâches.

- [ ] **Step 1: Simplifier `handleNew`**

Chercher (dans `app/src/screens/Modeles.tsx`) :

```ts
    else if (typeFilter === 'file' || typeFilter === 'tasks' || typeFilter === 'overview' || typeFilter === 'document' || typeFilter === 'screenplay' || typeFilter === 'moodboard' || typeFilter === 'video_review') { void openNewTemplateDraft(typeFilter); }
    else { setResEditorData({ type: typeFilter }); setResEditorOpen(true); }
```

Remplacer par (supprime la branche spéciale — tous les types de ressource non-projet/non-formulaire passent désormais par le même chemin) :

```ts
    else { setResEditorData({ type: typeFilter }); setResEditorOpen(true); }
```

- [ ] **Step 2: Simplifier `ResourceTemplateDetail.onOpen`**

Chercher :

```tsx
                  onOpen={() => {
                    if (selectedRes.type === 'file' || selectedRes.type === 'tasks' || selectedRes.type === 'overview' || selectedRes.type === 'document' || selectedRes.type === 'screenplay' || selectedRes.type === 'moodboard' || selectedRes.type === 'video_review') {
                      void openTemplateDraft(selectedRes);
                    } else {
                      setTemplateResViewTpl(selectedRes);
                    }
                  }}
```

Remplacer par :

```tsx
                  onOpen={() => setTemplateResViewTpl(selectedRes)}
```

- [ ] **Step 3: Rebrancher `TemplateProjectView`'s `onOpenResourceTemplate`**

Chercher :

```tsx
          onOpenResourceTemplate={async tpl => { const ok = await openTemplateDraft(tpl); if (ok) setPreviewTpl(null); }}
```

Remplacer par (ferme l'éditeur de modèle de projet, ouvre le vrai éditeur du modèle de ressource lié à la place — `handleSave()` a déjà été appelé par le bouton « Ouvrir » avant cet appel, donc le modèle de projet est sauvegardé avant la navigation) :

```tsx
          onOpenResourceTemplate={tpl => { setPreviewTpl(null); setTemplateResViewTpl(tpl); }}
```

- [ ] **Step 4: Supprimer le code mort**

`openTemplateDraft` et `openNewTemplateDraft` n'ont plus aucun appelant après les steps 1-3 (vérifié : ce sont les 3 seuls sites d'appel dans tout le fichier). Ce sont des fonctions locales non exportées — supprimer leurs définitions complètes :
- Supprimer la fonction `openTemplateDraft` (signature `const openTemplateDraft = async (tpl: ...): Promise<boolean> => { ... }`).
- Supprimer la fonction `openNewTemplateDraft` (signature `const openNewTemplateDraft = async (type: ...) => { ... }`).

Avant de supprimer, relancer `grep -n "openTemplateDraft\|openNewTemplateDraft" app/src/screens/Modeles.tsx` dans le worktree pour confirmer qu'il ne reste aucun appel — si un appel apparaît que ce plan n'a pas anticipé, ne pas supprimer cette fonction-là, le signaler dans le rapport de tâche.

Si `createTemplateDraft` (importé depuis `../data/projectStore`) n'est plus utilisé nulle part ailleurs dans `Modeles.tsx` après cette suppression, retirer aussi son import. Vérifier avec `grep -n "createTemplateDraft" app/src/screens/Modeles.tsx` — s'il ne reste que la ligne d'import, la supprimer.

- [ ] **Step 5: Vérifier le typecheck**

```bash
"$WORKTREE/app/node_modules/.bin/tsc" --noEmit -p "$WORKTREE/app/tsconfig.app.json"
```
Expected: aucune sortie. Si des erreurs « déclaré mais jamais utilisé » apparaissent pour d'autres helpers désormais orphelins (ex. `addFolderTree`, `registerDraftResource`, `createDraftResource` s'ils n'étaient utilisés QUE par ces deux fonctions supprimées), les retirer aussi — mais vérifier d'abord qu'ils ne sont pas utilisés ailleurs dans le fichier avant de les enlever.

- [ ] **Step 6: Vérifier en direct**

Dans la page Modèles :
1. Filtrer par type « Tâches », cliquer « Nouveau modèle » → doit ouvrir un formulaire d'édition en overlay (nom/description/couleur + section contenu), PAS naviguer vers un projet.
2. Ouvrir un modèle de Tâches existant (bouton « Ouvrir » sur sa fiche) → même overlay, en mode édition d'un modèle existant.
3. Répéter rapidement pour au moins deux autres types parmi Fichiers/Aperçu/Document/Scénario/Moodboard/Revue vidéo — même comportement.
4. Depuis l'éditeur d'un modèle de PROJET (onglet Modèles → un modèle de projet → Modifier), sur l'onglet Tâches, cliquer « Ouvrir » à côté du modèle de tâches lié → doit fermer l'éditeur de modèle de projet et ouvrir l'éditeur du modèle de tâches lié (pas un projet brouillon).

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/Modeles.tsx
git commit -m "fix(modeles): route Ouvrir/Nouveau modèle vers les éditeurs réels au lieu du brouillon jetable"
```

---

### Task 3: Édition du contenu d'un modèle de tâches (titre, priorité, assignation)

**Files:**
- Modify: `app/src/components/ProjectTaskRow.tsx`
- Modify: `app/src/data/templates.ts`
- Modify: `app/src/screens/Modeles.tsx`

**Interfaces:**
- Consumes: la Tâche 2 doit être faite en premier (sans elle, `TemplateResourceView` et `ResourceTemplateEditor` ne sont pas atteignables pour `type: 'tasks'`).
- Produces: `ProjectTaskRow` accepte désormais `task: RowTask` (export nommé depuis `ProjectTaskRow.tsx`) au lieu de `task: Task` — toute future réutilisation ailleurs doit passer par ce type élargi.

#### Partie A — Élargir `ProjectTaskRow.tsx` pour accepter les tâches de modèle

- [ ] **Step 1: Ajouter le type `RowTask` et élargir l'import**

Dans `app/src/components/ProjectTaskRow.tsx`, la ligne d'import actuelle est :

```ts
import type { Task, Priority, SectionData } from '../types';
```

Remplacer par :

```ts
import type { Task, Priority, SectionData, User } from '../types';
```

Juste après le bloc `PRIORITY_COLOR`/`PRIORITY_LABEL_KEY`/`PRIORITY_OPTIONS`/`STATUS_OPTIONS` (avant `export const GRID = ...`), ajouter :

```ts
// Type minimal partagé entre une vraie tâche de projet et une tâche de
// modèle (TemplateTask, plus légère — pas d'id/projectId, champs optionnels).
// ProjectTaskRow ne lit jamais id/projectId/projectName/projectColor/
// priorityLabel en interne (vérifié) — ils sont donc absents d'ici plutôt
// que gardés optionnels sans usage. `subtasks` n'est lu que via `.length`
// (badge de comptage, jamais rendu récursivement) — typé en tableau
// générique plutôt que `RowTask[]` pour éviter d'exiger que les sous-tâches
// imbriquées d'une TemplateTask (elles-mêmes des TemplateTask, sans
// `assignees` obligatoire) satisfassent structurellement RowTask.
export interface RowTask {
  title: string;
  priority: Priority;
  assignees: User[];
  checked?: boolean;
  status?: string;
  statusLabel?: string;
  // Non lu par le rendu (la priorité affichée vient de PRIORITY_LABEL_KEY[priority]
  // via t(), pas de ce champ) mais ÉCRIT par le composant lui-même dans le patch
  // du sélecteur de priorité (`onUpdate({ priority, priorityLabel })`) — doit donc
  // faire partie du type sous peine d'erreur TS sur ce onUpdate interne.
  priorityLabel?: string;
  dueDate?: string;
  subtasks?: unknown[];
  activityCount?: number;
}
```

- [ ] **Step 2: Élargir `MoveTaskModal`**

Chercher :

```ts
export function MoveTaskModal({ task, sections, onMove, onClose }: {
  task: Task;
  sections: SectionData[];
  onMove: (toSectionLabel: string) => void;
  onClose: () => void;
}) {
```

Remplacer `task: Task;` par `task: RowTask;` (le composant ne lit que `task.title`, compatible sans autre changement).

- [ ] **Step 3: Élargir `ProjectTaskRow`**

Chercher :

```ts
export function ProjectTaskRow({
  task,
  selected,
  onSelect,
  onUpdate,
  onTaskDragStart,
  onTaskDragEnd,
  allSections,
  onMoveToSection,
  onDelete,
}: {
  task: Task;
  selected: boolean;
  onSelect: (t: Task) => void;
  onUpdate: (patch: Partial<Task>) => void;
  onTaskDragStart?: () => void;
  onTaskDragEnd?: () => void;
  allSections?: SectionData[];
  onMoveToSection?: (toSectionLabel: string) => void;
  onDelete?: () => void;
}) {
```

Remplacer les trois occurrences de `Task` (celle de `task:`, celle de `onSelect:`, celle de `onUpdate:`) par `RowTask` :

```ts
export function ProjectTaskRow({
  task,
  selected,
  onSelect,
  onUpdate,
  onTaskDragStart,
  onTaskDragEnd,
  allSections,
  onMoveToSection,
  onDelete,
}: {
  task: RowTask;
  selected: boolean;
  onSelect: (t: RowTask) => void;
  onUpdate: (patch: Partial<RowTask>) => void;
  onTaskDragStart?: () => void;
  onTaskDragEnd?: () => void;
  allSections?: SectionData[];
  onMoveToSection?: (toSectionLabel: string) => void;
  onDelete?: () => void;
}) {
```

- [ ] **Step 4: Corriger l'appel non protégé à `parseYMD`**

Chercher (dans le bloc « Due date » du rendu) :

```tsx
            value={parseYMD(dueDate) ? dueDate : ''}
```

Remplacer par (`dueDate` est désormais optionnel — `Task` l'avait requis, donc cet appel n'était jamais exercé avec `undefined`) :

```tsx
            value={parseYMD(dueDate ?? '') ? dueDate : ''}
```

- [ ] **Step 5: Vérifier le typecheck**

```bash
"$WORKTREE/app/node_modules/.bin/tsc" --noEmit -p "$WORKTREE/app/tsconfig.app.json"
```
Expected: aucune sortie. (`Task` peut désormais être un import inutilisé dans ce fichier si rien d'autre ne le référence — si le typecheck ou un avertissement le signale, retirer `Task` de la ligne d'import du Step 1.)

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ProjectTaskRow.tsx
git commit -m "refactor(ProjectTaskRow): élargit le typage pour accepter les tâches de modèle (RowTask)"
```

#### Partie B — Élargir `TemplateTask.assignees` vers `User[]`

- [ ] **Step 1: Élargir le type**

Dans `app/src/data/templates.ts`, la ligne d'import en tête de fichier est :

```ts
import type { Priority } from '../types';
```

Remplacer par :

```ts
import type { Priority, User } from '../types';
```

Chercher la définition de `TemplateTask` :

```ts
export interface TemplateTask {
  title: string;
  priority: Priority;
  description?: string;
  status?: string;
  statusLabel?: string;
  dueDate?: string;
  assignees?: { id: string; name: string; initials: string; avatarColor: string }[];
  subtasks?: TemplateTask[];
}
```

Remplacer la ligne `assignees?: ...` par :

```ts
  assignees?: User[];
```

(Sans risque : vérifié qu'aucune entrée de `BUILT_IN_RESOURCE_TEMPLATES` ne définit `assignees` aujourd'hui — rien à backfiller.)

- [ ] **Step 2: Vérifier le typecheck**

```bash
"$WORKTREE/app/node_modules/.bin/tsc" --noEmit -p "$WORKTREE/app/tsconfig.app.json"
```
Expected: aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/templates.ts
git commit -m "refactor(templates): TemplateTask.assignees passe de la forme allégée à User[]"
```

#### Partie C — Câbler l'édition dans `TemplateResourceView` (édition d'un modèle existant)

- [ ] **Step 1: Ajouter l'état local**

Dans `app/src/screens/Modeles.tsx`, fonction `TemplateResourceView`, juste après :

```ts
  const [overviewSections, setOverviewSections] = useState<CustomOverviewSection[]>(tpl.overviewSections ?? []);
```

Ajouter :

```ts
  const [taskSections, setTaskSections] = useState<TemplateSection[]>(tpl.sections ?? []);
```

- [ ] **Step 2: Écrire au save**

Chercher, dans `handleSave` de ce même composant :

```ts
    if (tpl.type === 'overview') {
      updated.overviewSections = overviewSections;
    }
```

Ajouter juste après :

```ts
    if (tpl.type === 'tasks') {
      updated.sections = taskSections;
    }
```

- [ ] **Step 3: Remplacer le rendu figé par l'éditeur**

Chercher (toujours dans `TemplateResourceView`) :

```tsx
    if (type === 'tasks') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={labelStyle()}>{t('models.resTypeTasks')}</p>
        {(template.sections ?? []).map((section, si) => (
          <div key={si} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 600 }}>{section.label}</p>
            {(section.tasks ?? []).map((task, ti) => (
              <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
                <SFIcon name="circle" size={10} color="var(--text-3)" />
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{task.title}</span>
              </div>
            ))}
          </div>
        ))}
        {(template.sections ?? []).length === 0 && <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune section dans ce modèle.</p>}
      </div>
    );
```

**Attention :** ce bloc exact (avec `template.sections`, pas `tpl.sections`) appartient à `ResourceTemplateEditor`, pas à `TemplateResourceView` — les deux fichiers ont un bloc quasi identique. Dans `TemplateResourceView`, chercher la variable réellement en scope : c'est `tpl`, pas `template`. Le bloc à remplacer dans CE composant utilise `tpl.sections` (vérifier en lisant les ~10 lignes autour avant de remplacer — si le texte ci-dessus ne correspond pas caractère pour caractère avec `tpl.` à la place de `template.`, chercher par `t('models.resTypeTasks')` pour localiser le bon bloc dans CE fichier).

Remplacer par :

```tsx
    if (type === 'tasks') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={labelStyle()}>{t('models.resTypeTasks')}</p>
        {taskSections.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune section dans ce modèle.</p>}
        {taskSections.map((section, si) => (
          <div key={si} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 600 }}>{section.label}</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {section.tasks.map((task, ti) => (
                <ProjectTaskRow
                  key={ti}
                  task={{ ...task, assignees: task.assignees ?? [] }}
                  selected={false}
                  onSelect={() => {}}
                  onUpdate={patch => {
                    // checked/priorityLabel/activityCount n'existent pas sur
                    // TemplateTask (checked n'a pas de sens pour un modèle
                    // statique, priorityLabel/activityCount ne sont jamais
                    // lus) — écartés explicitement plutôt que persistés.
                    const { checked: _checked, priorityLabel: _priorityLabel, activityCount: _activityCount, ...persisted } = patch;
                    setTaskSections(prev => prev.map((s, i) => i !== si ? s : {
                      ...s,
                      tasks: s.tasks.map((tsk, j) => j !== ti ? tsk : { ...tsk, ...persisted }),
                    }));
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
```

- [ ] **Step 4: Importer `ProjectTaskRow`**

En tête de `app/src/screens/Modeles.tsx`, ajouter (à la suite des imports existants) :

```ts
import { ProjectTaskRow } from '../components/ProjectTaskRow';
```

- [ ] **Step 5: Vérifier le typecheck**

```bash
"$WORKTREE/app/node_modules/.bin/tsc" --noEmit -p "$WORKTREE/app/tsconfig.app.json"
```
Expected: aucune sortie.

- [ ] **Step 6: Vérifier en direct**

Page Modèles → filtrer Tâches → ouvrir un modèle existant (ex. un des 4 modèles intégrés « Tâches — … ») → confirmer que chaque tâche affiche maintenant les contrôles Assigné/Priorité/Statut/Échéance/Titre cliquables (interface identique à une vraie ligne de tâche de projet). Renommer une tâche, changer sa priorité, assigner quelqu'un. Cliquer Enregistrer. Recharger la page (Ctrl+Shift+R), rouvrir le même modèle, confirmer que les changements ont persisté.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/Modeles.tsx
git commit -m "feat(modeles): édition réelle des tâches d'un modèle existant via ProjectTaskRow"
```

#### Partie D — Câbler l'édition dans `ResourceTemplateEditor` (création d'un nouveau modèle)

- [ ] **Step 1: Ajouter l'état local**

Dans `app/src/screens/Modeles.tsx`, fonction `ResourceTemplateEditor`, juste après :

```ts
  const [ovSections, setOvSections] = useState<CustomOverviewSection[]>(template.overviewSections ?? []);
```

Ajouter :

```ts
  // tasks
  const [taskSections, setTaskSections] = useState<TemplateSection[]>(template.sections ?? []);
```

- [ ] **Step 2: Écrire au save**

Chercher, dans `handleSave` de ce composant :

```ts
    if (type === 'tasks') content = { sections: template.sections ?? [] };
```

Remplacer par :

```ts
    if (type === 'tasks') content = { sections: taskSections };
```

- [ ] **Step 3: Remplacer le rendu figé**

Chercher, dans `renderContentEditor` de ce même composant :

```tsx
    if (type === 'tasks') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={labelStyle()}>{t('models.resTypeTasks')}</p>
        {(template.sections ?? []).map((section, si) => (
          <div key={si} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 600 }}>{section.label}</p>
            {(section.tasks ?? []).map((task, ti) => (
              <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
                <SFIcon name="circle" size={10} color="var(--text-3)" />
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{task.title}</span>
              </div>
            ))}
          </div>
        ))}
        {(template.sections ?? []).length === 0 && <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune section dans ce modèle.</p>}
      </div>
    );
```

Remplacer par (identique à la Partie C, `template.sections` remplacé par l'état local `taskSections`) :

```tsx
    if (type === 'tasks') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={labelStyle()}>{t('models.resTypeTasks')}</p>
        {taskSections.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune section dans ce modèle.</p>}
        {taskSections.map((section, si) => (
          <div key={si} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 600 }}>{section.label}</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {section.tasks.map((task, ti) => (
                <ProjectTaskRow
                  key={ti}
                  task={{ ...task, assignees: task.assignees ?? [] }}
                  selected={false}
                  onSelect={() => {}}
                  onUpdate={patch => {
                    // checked/priorityLabel/activityCount n'existent pas sur
                    // TemplateTask (checked n'a pas de sens pour un modèle
                    // statique, priorityLabel/activityCount ne sont jamais
                    // lus) — écartés explicitement plutôt que persistés.
                    const { checked: _checked, priorityLabel: _priorityLabel, activityCount: _activityCount, ...persisted } = patch;
                    setTaskSections(prev => prev.map((s, i) => i !== si ? s : {
                      ...s,
                      tasks: s.tasks.map((tsk, j) => j !== ti ? tsk : { ...tsk, ...persisted }),
                    }));
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
```

**Point ouvert non traité ici** (déjà signalé dans la spec, non tranché par l'utilisateur) : ni cette Partie D ni la Partie C n'ajoutent de bouton pour créer une nouvelle section ou une nouvelle tâche — seules les tâches déjà présentes dans `template.sections`/`tpl.sections` deviennent éditables. Un modèle de type Tâches créé via « Nouveau modèle » démarre donc avec zéro section, sans moyen d'en ajouter une par l'interface. Si c'est bloquant à l'usage, ouvrir une décision séparée avant de considérer ce point du chantier terminé — ne pas ajouter cette fonctionnalité de son propre chef ici.

- [ ] **Step 4: Vérifier le typecheck**

```bash
"$WORKTREE/app/node_modules/.bin/tsc" --noEmit -p "$WORKTREE/app/tsconfig.app.json"
```
Expected: aucune sortie.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Modeles.tsx
git commit -m "feat(modeles): édition réelle des tâches lors de la création d'un nouveau modèle"
```

---

### Task 4: Étendre `removedSystemModules` à Livrables/Factures/Fichiers/Notes

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes: rien (indépendante des tâches 1-3)
- Produces: rien consommé par une autre tâche de ce plan

- [ ] **Step 1: Localiser `applyTemplateById`**

Dans `app/src/screens/TravailOverview.tsx`, chercher le commentaire :

```
  // TODO connu : appliquer un modèle ne modifie pas removedSystemModules pour
  // invoices/files/notes — un module supprimé avant le changement de modèle
  // peut donc réapparaître si le nouveau modèle ne le mentionne pas non plus.
  // Décision de conception à trancher séparément.
```

Juste en dessous se trouve `const applyTemplateById = (id: string | null) => { ... }`, avec ce bloc à remplacer :

```ts
    const vision = removedSystemModules.includes(VISION_SECTION_ID)
      ? null
      : (customSections.find(s => s.id === VISION_SECTION_ID) ?? getDefaultVisionSection());
    const newSections = [
      ...(vision ? [vision] : []),
      ...(tpl?.overviewSections ?? []).filter(s => s.id !== VISION_SECTION_ID),
    ];
```

- [ ] **Step 2: Généraliser à `SYSTEM_MODULES`**

Remplacer par :

```ts
    const systemSections = SYSTEM_MODULES
      .filter(m => !removedSystemModules.includes(m.id))
      .map(m => customSections.find(s => s.id === m.id) ?? m.factory());
    const newSections = [
      ...systemSections,
      ...(tpl?.overviewSections ?? []).filter(s => !SYSTEM_SECTION_IDS.includes(s.id)),
    ];
```

`SYSTEM_MODULES` et `SYSTEM_SECTION_IDS` sont déjà importés en tête de `TravailOverview.tsx` (ligne d'import de `../data/projectContentStore`) — aucun nouvel import nécessaire. Supprimer aussi le commentaire TODO devenu obsolète (le bloc au-dessus de `const applyTemplateById`), en gardant le reste du commentaire explicatif qui précède (celui qui explique le comportement général de la fonction).

- [ ] **Step 3: Vérifier qu'aucun autre point d'insertion ne duplique la même limitation**

Chercher, dans `app/src/screens/TravailOverview.tsx`, toute autre fonction qui insère un module système en lisant `removedSystemModules` (chercher `removedSystemModules.includes(` dans tout le fichier — Step 2 vient d'en corriger un usage ; s'il y en a d'autres, en particulier dans la migration à la lecture `applyLoadedContent`, appliquer le même principe : filtrer via `SYSTEM_MODULES`/`SYSTEM_SECTION_IDS` plutôt qu'un test isolé sur `VISION_SECTION_ID`). Documenter dans le rapport de tâche si un autre site a été trouvé et corrigé, ou confirmer qu'il n'y en a qu'un.

- [ ] **Step 4: Vérifier le typecheck**

```bash
"$WORKTREE/app/node_modules/.bin/tsc" --noEmit -p "$WORKTREE/app/tsconfig.app.json"
```
Expected: aucune sortie.

- [ ] **Step 5: Vérifier en direct**

Sur un projet réel (pas démo, si possible — sinon démo suffit pour vérifier le comportement en mémoire) : ouvrir l'Aperçu, supprimer manuellement le module Factures (menu "..." → Supprimer). Appliquer un modèle d'Aperçu qui ne mentionne pas Factures. Confirmer qu'elle ne réapparaît PAS. Répéter pour Fichiers et Notes. Confirmer aussi que Livrables et Vision continuent de fonctionner comme avant (non-régression).

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "fix(overview): étend removedSystemModules aux 4 modules système restants"
```

---

## Vérification finale (whole-branch)

Après les 4 tâches, avant de fusionner :
- Typecheck propre sur le résultat complet.
- Rejouer les 4 scénarios de vérification en direct listés ci-dessus, dans l'ordre, dans une session de navigateur fraîche (pas d'onglet pollué par du HMR accumulé).
- `git log --oneline` doit montrer 4 tâches × leurs commits respectifs (Task 3 en a 4, une par partie) = 7 commits au total sur la branche.
- Fusionner `origin/master` dans la branche du worktree avant de pousser (d'autres sessions poussent en parallèle sur ce dépôt) et revérifier le typecheck sur le résultat fusionné avant de pousser.
