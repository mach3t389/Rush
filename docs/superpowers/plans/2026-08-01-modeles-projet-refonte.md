# Modèles de projet — refonte de l'architecture — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le système actuel de modèles de projet composés par référence (`tasksTemplateId`/`defaultFolderStructureId`/`defaultOverviewTemplateId` → `ResourceTemplate` séparés) par un `ProjectTemplate` qui possède directement son contenu, édité exclusivement via un vrai projet-brouillon sur les vraies pages de l'app (`Travail.tsx`/`Fichiers.tsx`/`TravailOverview.tsx`), jamais via une interface bespoke.

**Architecture:** `ProjectTemplate` gagne `sections`/`folderStructure`/`overviewSections`. Éditer un modèle = créer un brouillon réel (`createTemplateDraft`, déjà existant), le pré-remplir avec le contenu du modèle, naviguer vers `/projets/:draftId`. Le brouillon n'est plus jetable. Une action unique « Créer un modèle depuis ce projet », accessible depuis `ProjectHeaderBar` sur n'importe quel projet, capture (sélectivement, via 3 cases à cocher) l'état courant du projet dans un `ProjectTemplate`.

**Tech Stack:** React 19 + TypeScript, pas de tests automatisés — vérification par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) et preview navigateur.

## Global Constraints

- Aucune nouvelle interface d'édition de contenu (tâches/dossiers/aperçu) — toujours réutiliser `Travail.tsx`/`Fichiers.tsx`/`TravailOverview.tsx` tels quels.
- `ProjectTemplate` n'a plus de champs de liaison (`tasksTemplateId`/`defaultFolderStructureId`/`defaultOverviewTemplateId`) — contenu direct uniquement (`sections`/`folderStructure`/`overviewSections`).
- Pas de partage d'un bloc de tâches entre plusieurs modèles de projet.
- Les modèles personnalisés déjà créés en ancien format doivent continuer à fonctionner (migration silencieuse à la lecture, jamais de réécriture de l'ancien format tant que l'utilisateur ne resauvegarde pas).
- Les types Document/Scénario/Moodboard/Revue vidéo restent des `ResourceTemplate` indépendants, inchangés — ne pas toucher `RES_TYPES`, le groupe « Ressources » de `Modeles.tsx`, ni `ResourceRouter.tsx`.
- Assistant Nouveau projet : `Step` passe de 4 valeurs à 3 (`'start' | 'info' | 'team'`), plus d'étape Fichiers.
- Différé, explicitement hors scope de ce plan : granularité fine des options de sauvegarde (sous-tâches, commentaires…), refonte de la fiche de détail d'un modèle de projet dans `Modeles.tsx`.
- **Contexte important pour l'implémenteur :** `docs/superpowers/plans/2026-08-01-modeles-projet-corrections.md` (le chantier précédent, 4 tâches) a été planifié mais **son code n'a jamais atterri sur `master`** — vérifié par grep (`RowTask`, `res-overview-base` : zéro occurrence dans `app/src`) et par diff (`git show --stat` sur le commit qui prétendait le contenir ne montre que 5 fichiers de locales/écrans sans rapport). Ce plan part donc directement de l'état actuel de `master`, sans code à « annuler » — les 3 champs de liaison, `TemplateProjectView`, `TemplateResourceView`, `ResourceTemplateEditor`, `openTemplateDraft`/`openNewTemplateDraft` sont tous présents et fonctionnels tels que décrits ci-dessous. **Ignorer entièrement ce plan précédent** (docs seulement, pas de code réel à considérer).
- **Décision d'implémentation notable, à valider en revue :** les 3 instances de `TemplateMenuButton` dans `Travail.tsx`, `Fichiers.tsx`, `TravailOverview.tsx` (bouton « enregistrer/charger un modèle » par page, pour Tâches/Fichiers/Aperçu spécifiquement) sont **supprimées entièrement** (save ET load) — le save est remplacé par l'action unique ; le load n'a plus de sens puisque Tâches/Fichiers/Aperçu ne sont plus des objets `ResourceTemplate` sélectionnables indépendamment. La 4ᵉ instance (`ResourceRouter.tsx`, pour Document/Scénario/Moodboard/Revue vidéo) n'est **pas** touchée.

---

## File Structure

- **Modifier `app/src/data/templates.ts`** — modèle de données `ProjectTemplate`, migration built-in + custom, `resolveTasksSections`.
- **Modifier `app/src/data/fileStore.ts`** — aucun changement de logique, juste un export déjà présent (`getFolderTreeForProject`) réutilisé.
- **Créer `app/src/components/CreateTemplateFromProjectModal.tsx`** — nouvel écran dédié pour l'action « Créer un modèle depuis ce projet ».
- **Modifier `app/src/components/ProjectHeaderBar.tsx`** — retire l'auto-suppression du brouillon, ajoute l'entrée de menu + le bouton « Fermer sans enregistrer ».
- **Modifier `app/src/screens/Modeles.tsx`** — retire `TemplateProjectView`, `TemplateResourceView`/`ResourceTemplateEditor` (branches 'tasks'/'file'/'overview' seulement), les 3 catégories de nav top-level, ajoute `openProjectTemplateDraft`.
- **Modifier `app/src/screens/Travail.tsx`** — retire `TemplateMenuButton`/`SaveAsTemplateModal` (tâches).
- **Modifier `app/src/screens/Fichiers.tsx`** — retire `TemplateMenuButton`/modal de sauvegarde (fichiers).
- **Modifier `app/src/screens/TravailOverview.tsx`** — retire `TemplateMenuButton`/modal de sauvegarde (aperçu).
- **Modifier `app/src/components/ProjectsListView.tsx`** — retire l'étape `'fichiers'`, simplifie `create()`.
- **Modifier `app/src/locales/fr.json` et `en.json`** — nouvelles clés pour le nouvel écran, retrait des clés devenues orphelines si trivial à repérer (ne pas chasser activement les clés orphelines — YAGNI, hors scope si non bloquant).

---

### Task 1 : Modèle de données — `ProjectTemplate` direct + migration

**Files:**
- Modify: `app/src/data/templates.ts:62-76` (interface `ProjectTemplate`), `:131-188` (`BUILT_IN_TEMPLATES`), `:437-495` (load/save/resolve), `:757-907` (`BUILT_IN_RESOURCE_TEMPLATES`, bloc Tâches)

**Interfaces:**
- Produces: `ProjectTemplate.sections?: TemplateSection[]`, `ProjectTemplate.folderStructure?: FolderNode[]`, `ProjectTemplate.overviewSections?: CustomOverviewSection[]` ; `resolveTasksSections(tpl: ProjectTemplate): TemplateSection[]` (signature inchangée, corps simplifié).

- [ ] **Step 1 : Remplacer l'interface `ProjectTemplate`**

Dans `app/src/data/templates.ts`, remplacer les lignes 62-76 :

```ts
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  tags: string[];
  builtIn?: boolean;
  createdAt: string;
  sections?: TemplateSection[];
  folderStructure?: FolderNode[];
  overviewSections?: CustomOverviewSection[];
  /** @deprecated Ancien format — lu par migrateLegacyProjectTemplate(), jamais écrit. */
  tasksTemplateId?: string;
  /** @deprecated */
  defaultFolderStructureId?: string;
  /** @deprecated */
  defaultOverviewTemplateId?: string;
}
```

`FolderNode` (ligne ~590) et `CustomOverviewSection` (déjà importé ligne 6 depuis `./projectContentStore`) sont déjà accessibles dans ce fichier — aucun nouvel import requis.

- [ ] **Step 2 : Migrer les 4 modèles built-in `BUILT_IN_TEMPLATES` (lignes 131-188)**

Pour chacun des 4 modèles non-vierges (`tpl-video-sociale`, `tpl-film-institutionnel`, `tpl-shoot-photo`, `tpl-motion-design`), retirer `tasksTemplateId: '...'` et (pour les 2 premiers) `defaultFolderStructureId: 'res-file-structure'`, et ajouter à la place :
- `sections:` avec le contenu **copié verbatim** depuis l'entrée `BUILT_IN_RESOURCE_TEMPLATES` correspondante avant suppression à l'étape 4 (`res-tasks-video-sociale` → `tpl-video-sociale.sections`, etc. — même correspondance par nom de projet).
- Pour `tpl-video-sociale`/`tpl-film-institutionnel` : `folderStructure:` copié depuis l'entrée `ResourceTemplate` référencée par `defaultFolderStructureId` (chercher son id `'res-file-structure'` dans `BUILT_IN_RESOURCE_TEMPLATES`, copier son `folderStructure`).
- `tpl-vierge` (le 5ᵉ, sans `tasksTemplateId`) : ne change pas.

Aucun des 5 modèles built-in n'avait de `defaultOverviewTemplateId` (confirmé par lecture du fichier) — ne rien ajouter pour `overviewSections` (reste `undefined`, équivalent à `[]` pour l'affichage, cf. étape 4).

- [ ] **Step 3 : Simplifier `resolveTasksSections` (lignes 491-495)**

```ts
export function resolveTasksSections(tpl: ProjectTemplate): TemplateSection[] {
  return tpl.sections ?? [];
}
```

- [ ] **Step 4 : Retirer les 4 entrées `type: 'tasks'` de `BUILT_IN_RESOURCE_TEMPLATES`**

Supprimer les 4 blocs `res-tasks-video-sociale` (lignes 758-797), `res-tasks-film-institutionnel` (798-840), `res-tasks-shoot-photo` (841-871), `res-tasks-motion-design` (872-907), ainsi que le commentaire `// ── Tâches ──` (ligne 757) qui les précédait. Vérifier qu'aucun autre code du fichier ne référence encore ces 4 ids (`grep -n "res-tasks-" app/src/data/templates.ts` doit ne rien retourner après ce step).

- [ ] **Step 5 : Migration silencieuse des modèles personnalisés à la lecture**

Ajouter, juste avant `loadAllTemplates` (ligne 487), une fonction de migration et l'appliquer dans `loadAllTemplates` :

```ts
function migrateLegacyProjectTemplate(tpl: ProjectTemplate): ProjectTemplate {
  if (!tpl.tasksTemplateId && !tpl.defaultFolderStructureId && !tpl.defaultOverviewTemplateId) return tpl;
  const resources = loadAllResourceTemplates();
  const migrated = { ...tpl };
  if (tpl.tasksTemplateId && !tpl.sections) {
    migrated.sections = resources.find(r => r.id === tpl.tasksTemplateId && r.type === 'tasks')?.sections ?? [];
  }
  if (tpl.defaultFolderStructureId && !tpl.folderStructure) {
    migrated.folderStructure = resources.find(r => r.id === tpl.defaultFolderStructureId && r.type === 'file')?.folderStructure ?? [];
  }
  if (tpl.defaultOverviewTemplateId && !tpl.overviewSections) {
    migrated.overviewSections = resources.find(r => r.id === tpl.defaultOverviewTemplateId && r.type === 'overview')?.overviewSections ?? [];
  }
  return migrated;
}

export function loadAllTemplates(): ProjectTemplate[] {
  return [...getVisibleBuiltInTemplates(), ...loadCustomTemplates().map(migrateLegacyProjectTemplate)];
}
```

Cette fonction remplace l'appel existant `loadCustomTemplates().map(migrateLegacyTasksTemplate)` (ligne 488) — supprimer aussi l'ancienne `migrateLegacyTasksTemplate` (lignes 465-485) puisqu'elle gérait un format encore plus ancien (sections embarquées directement, pas de `tasksTemplateId`) : lire son corps avant de la retirer et vérifier avec l'utilisateur/dans un commentaire de commit si un format antérieur à `tasksTemplateId` existe encore en pratique. **Si `migrateLegacyTasksTemplate` gère un cas non couvert par `migrateLegacyProjectTemplate` ci-dessus** (ex. `sections` déjà présent directement dans un vieux JSON sans passer par `tasksTemplateId`), composer les deux plutôt que remplacer : `loadCustomTemplates().map(migrateLegacyTasksTemplate).map(migrateLegacyProjectTemplate)`.

- [ ] **Step 6 : Vérifier la compilation**

Depuis `app/`, lancer :
```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : des erreurs dans `Modeles.tsx`, `ProjectsListView.tsx`, `Travail.tsx`, `Fichiers.tsx`, `TravailOverview.tsx` référençant les champs retirés — normal, ces fichiers sont traités aux tâches suivantes. Confirmer qu'aucune erreur ne provient de `templates.ts` lui-même.

- [ ] **Step 7 : Commit**

```bash
git add app/src/data/templates.ts
git commit -m "refactor(templates): ProjectTemplate possède directement sections/folderStructure/overviewSections"
```

---

### Task 2 : Ouvrir un modèle de projet comme brouillon réel (remplace `TemplateProjectView`)

**Files:**
- Modify: `app/src/screens/Modeles.tsx:1101-1471` (supprime `TemplateProjectView`), `:1901-1955` (state `previewTpl`/`saveTpl`), `:2239-2248` (`handleNew`), `:2497-2501` (boutons `onEdit`/`onPreview` de la carte modèle projet), `:2634-2645` (invocation `TemplateProjectView`)

**Interfaces:**
- Consumes: `createTemplateDraft(name, originTemplateId?): Promise<string>` (`app/src/data/projectStore.ts:278-300`), `setSections(projectId, sections)` (`app/src/data/taskStore.ts:250`), `addFolderTree(nodes, {projectId})` (`app/src/data/fileStore.ts:301`), `setProjectContent(projectId, content)` (`app/src/data/projectContentStore.ts:219-229`).
- Produces: `openProjectTemplateDraft(tpl: ProjectTemplate): Promise<void>` — nouvelle fonction locale à `Modeles.tsx`, utilisée aussi par Task 5 (bouton « Fermer sans enregistrer » n'en a pas besoin, mais la carte modèle projet et `handleNew('projets')` en dépendent).

- [ ] **Step 1 : Ajouter `openProjectTemplateDraft` dans `Modeles.tsx`**

Ajouter, à côté des fonctions `openTemplateDraft`/`openNewTemplateDraft` existantes (autour de la ligne 2134), une nouvelle fonction (elle importe `useNavigate` — vérifier que `Modeles.tsx` a déjà `const navigate = useNavigate()` en haut du composant ; sinon l'ajouter avec `import { useNavigate } from 'react-router-dom'`) :

```ts
async function openProjectTemplateDraft(tpl: ProjectTemplate) {
  const draftId = await createTemplateDraft(tpl.name, tpl.id);
  if (tpl.sections?.length) setSections(draftId, tpl.sections.map(sec => ({
    label: sec.label,
    progress: 0,
    tasks: sec.tasks.map((tt, i): Task => ({
      id: `${draftId}-${sec.label}-${i}`,
      title: tt.title,
      projectId: draftId,
      projectName: tpl.name,
      projectColor: tpl.color,
      assignees: tt.assignees ?? [],
      status: 'warn',
      statusLabel: 'En attente',
      priority: tt.priority ?? 'normal',
      priorityLabel: tt.priority === 'high' ? 'Élevée' : tt.priority === 'low' ? 'Basse' : 'Normale',
      dueDate: tt.dueDate ?? '',
      checked: false,
      subtasks: [],
    })),
  })));
  if (tpl.folderStructure?.length) addFolderTree(tpl.folderStructure, { projectId: draftId });
  if (tpl.overviewSections?.length) setProjectContent(draftId, { customSections: tpl.overviewSections });
  navigate(`/projets/${draftId}`);
}
```

Réutiliser le même mapping tâche que celui déjà présent dans `ProjectsListView.tsx:create()` (lignes 155-172, cf. rapport de recherche) pour rester cohérent — types `Task`/`SectionData` déjà importés dans `Modeles.tsx` (vérifier ; sinon les importer depuis `../types`). Importer `setSections` depuis `../data/taskStore`, `addFolderTree` depuis `../data/fileStore`, `setProjectContent` depuis `../data/projectContentStore` (ajouter ces imports en haut du fichier s'ils manquent).

- [ ] **Step 2 : Retirer `TemplateProjectView` et son invocation**

Supprimer entièrement le composant `TemplateProjectView` (lignes 1101-1471) et son bloc d'invocation (lignes 2634-2645, `{previewTpl && (<TemplateProjectView .../>)}`).

- [ ] **Step 3 : Rebrancher la création/l'édition d'un modèle de projet sur `openProjectTemplateDraft`**

Dans `handleNew` (ligne 2244), remplacer :
```ts
if (typeFilter === 'projets') { setPreviewTpl({ id: `tpl-${Date.now()}`, name: 'Nouveau modèle', ... }); }
```
par : créer l'objet `ProjectTemplate` vide comme avant, l'écrire immédiatement via `saveTpl` (pour qu'il existe avant qu'on y navigue), puis appeler `openProjectTemplateDraft` :
```ts
if (typeFilter === 'projets') {
  const tpl: ProjectTemplate = { id: `tpl-${Date.now()}`, name: 'Nouveau modèle', description: '', color: '#6366f1', icon: 'layout-template', tags: [], builtIn: false, createdAt: new Date().toISOString().split('T')[0] };
  saveTpl(tpl);
  void openProjectTemplateDraft(tpl);
}
```

Dans la carte de détail d'un modèle projet (lignes ~2497-2501), remplacer les handlers `onEdit`/`onPreview` (qui appelaient `setPreviewTpl`) par un seul bouton « Modifier » appelant `void openProjectTemplateDraft(selectedTpl)` — dupliquer un modèle built-in en copie personnalisable reste utile : conserver la logique de duplication existante (`{ ...selectedTpl, id: 'tpl-'+Date.now(), builtIn: false, ... }`), l'écrire via `saveTpl`, puis ouvrir le brouillon sur la copie :
```tsx
onEdit={() => {
  const target = selectedTpl.builtIn
    ? { ...selectedTpl, id: `tpl-${Date.now()}`, name: `${selectedTpl.name} (copie)`, builtIn: false, createdAt: new Date().toISOString().split('T')[0] }
    : selectedTpl;
  if (selectedTpl.builtIn) saveTpl(target);
  void openProjectTemplateDraft(target);
}}
```
Retirer l'ancien bouton `onPreview` séparé s'il n'a plus d'usage distinct (vérifier son rôle exact dans la carte avant de le retirer — s'il servait à un simple aperçu lecture-seule sans édition, il n'a plus de sens puisqu'ouvrir = éditer maintenant).

- [ ] **Step 4 : Retirer l'état `previewTpl` s'il n'est plus utilisé ailleurs**

`grep -n "previewTpl" app/src/screens/Modeles.tsx` — si toutes les occurrences ont été traitées aux steps précédents, retirer la déclaration `useState` (ligne 1901).

- [ ] **Step 5 : Compiler et vérifier**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : plus d'erreur provenant de `TemplateProjectView`/`previewTpl`. Des erreurs peuvent subsister ailleurs (Tasks 3-6 pas encore faites).

- [ ] **Step 6 : Commit**

```bash
git add app/src/screens/Modeles.tsx
git commit -m "refactor(modeles): édition d'un modèle de projet via un vrai brouillon, retire TemplateProjectView"
```

---

### Task 3 : Nettoyer la navigation de la page Modèles + les éditeurs Tâches/Fichiers/Aperçu devenus morts

**Files:**
- Modify: `app/src/screens/Modeles.tsx:2346-2389` (nav top-level), `:195-331` (`TemplateResourceView`), `:1660-1857` (`ResourceTemplateEditor`), `:2239-2248` (`handleNew`, branches non-projets), `:2550-2556` (`ResourceTemplateDetail.onOpen`)

**Interfaces:**
- Consumes: `openProjectTemplateDraft` (Task 2), les fonctions existantes `openTemplateDraft`/`openNewTemplateDraft` — inchangées, toujours utilisées pour Document/Scénario/Moodboard/Revue vidéo.

- [ ] **Step 1 : Retirer Aperçu/Tâches/Fichiers de la nav top-level**

Dans le bloc de rendu (lignes ~2364-2367), supprimer les 3 lignes :
```ts
{navItem('overview', 'layout-grid', t('models.resTypeOverview'), overviewCount)}
{navItem('tasks', 'list-checks', t('models.resTypeTasks'), tasksCount)}
{navItem('file', 'folder', 'Fichiers', fileCount)}
```
Garder `navItem('projets', ...)` et le groupe « Ressources » (`RES_TYPES`, lignes 2346-2352 et 2384-2386) intacts. Retirer aussi les variables devenues inutilisées `fileCount`/`overviewCount`/`tasksCount` (lignes ~2358-2360) si plus référencées ailleurs dans le fichier (`grep -n "fileCount\|overviewCount\|tasksCount" app/src/screens/Modeles.tsx`).

- [ ] **Step 2 : Retirer les branches `'tasks'`/`'file'`/`'overview'` de `TemplateResourceView` et `ResourceTemplateEditor`**

Ces deux composants restent nécessaires pour Document/Scénario/Moodboard/Revue vidéo — ne pas les supprimer entièrement. Dans chacun, localiser le bloc `if (type === 'tasks') return (...)`, `if (type === 'file') return (...)`, `if (type === 'overview') return (...)` (rendu lecture-seule des sections/dossiers/aperçu) et les retirer, puisque ces 3 types de `ResourceTemplate` ne sont plus jamais sélectionnables (ils ont disparu de `BUILT_IN_RESOURCE_TEMPLATES` à la Task 1 et de la nav à ce Step). Si le type union `ResourceTemplateType` doit rester `'document' | 'screenplay' | 'video_review' | 'file' | 'moodboard' | 'overview' | 'tasks'` pour la compatibilité de lecture des vieux modèles personnalisés (cf. Task 1 Step 5, qui lit encore `resources.find(r => r.type === 'tasks')` etc.), ne PAS retirer ces valeurs du type — seulement le code de rendu mort dans ces deux composants.

- [ ] **Step 3 : Confirmer que `handleNew` et `ResourceTemplateDetail.onOpen` ne routent plus jamais vers un type Tâches/Fichiers/Aperçu**

Puisque ces types ont disparu de la nav (Step 1) et de `BUILT_IN_RESOURCE_TEMPLATES` (Task 1), `typeFilter` ne peut plus valoir `'tasks'`/`'file'`/`'overview'` et `selectedRes` ne peut plus être de ce type — aucun changement de code n'est requis dans `handleNew` (lignes 2239-2248) ou `ResourceTemplateDetail.onOpen` (lignes 2550-2556) au-delà de ce que Task 2 a déjà fait pour `'projets'`. Vérifier par lecture que la branche `else` (types Document/Scénario/etc., qui appelle `openTemplateDraft`/`openNewTemplateDraft`) reste inchangée et continue de fonctionner pour ces 4 types.

- [ ] **Step 4 : Compiler et vérifier**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 5 : Commit**

```bash
git add app/src/screens/Modeles.tsx
git commit -m "refactor(modeles): retire Aperçu/Tâches/Fichiers de la navigation et des éditeurs de ressource"
```

---

### Task 4 : Nouvel écran « Créer un modèle depuis ce projet »

**Files:**
- Create: `app/src/components/CreateTemplateFromProjectModal.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (nouvelles clés)

**Interfaces:**
- Consumes: `getSections(projectId)` (`taskStore.ts:213`), `getFolderTreeForProject(projectId)` (`fileStore.ts:416`, retourne `FolderTreeNodeWithId[]` — compatible `FolderNode[]`, le champ `id` en trop ne gêne pas puisque `FolderNode` a aussi un `id`), `getProjectContent(projectId)` (`projectContentStore.ts:213`, `.customSections` donne `CustomOverviewSection[]`), `loadCustomTemplates`/`saveCustomTemplates` (`templates.ts:437/443`).
- Produces: composant `CreateTemplateFromProjectModal({ project, onClose }: { project: Project; onClose: () => void })`, exporté, monté conditionnellement depuis `ProjectHeaderBar` (Task 5).

- [ ] **Step 1 : Créer le composant**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFButton, SFIcon } from './ui';
import { getSections } from '../data/taskStore';
import { getFolderTreeForProject } from '../data/fileStore';
import { getProjectContent } from '../data/projectContentStore';
import { loadCustomTemplates, saveCustomTemplates, loadAllTemplates, type ProjectTemplate, type TemplateSection } from '../data/templates';
import type { Project } from '../types';

const TEMPLATE_COLORS = ['#5B8AF5', '#34C98A', '#A05BE8', '#F5975B', '#E85B7A', '#5BC4E8', '#F5C05B'];

export function CreateTemplateFromProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useTranslation();
  const originTemplate = project.draftOriginTemplateId
    ? loadAllTemplates().find(tpl => tpl.id === project.draftOriginTemplateId)
    : undefined;

  const [mode, setMode] = useState<'update' | 'new'>(originTemplate ? 'update' : 'new');
  const [name, setName] = useState(originTemplate?.name ?? project.name);
  const [description, setDescription] = useState(originTemplate?.description ?? '');
  const [color, setColor] = useState(originTemplate?.color ?? TEMPLATE_COLORS[0]);
  const [tags, setTags] = useState(originTemplate?.tags?.join(', ') ?? '');
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [includeOverview, setIncludeOverview] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return;
    const sections: TemplateSection[] | undefined = includeTasks
      ? getSections(project.id).map(s => ({ label: s.label, tasks: s.tasks.map(t => ({ title: t.title, priority: t.priority, description: t.description, status: t.status, statusLabel: t.statusLabel, dueDate: t.dueDate, assignees: t.assignees, subtasks: [] })) }))
      : undefined;
    const folderStructure = includeFiles ? getFolderTreeForProject(project.id) : undefined;
    const overviewSections = includeOverview ? getProjectContent(project.id).customSections : undefined;

    const targetId = mode === 'update' && originTemplate ? originTemplate.id : `tpl-${Date.now()}`;
    const tpl: ProjectTemplate = {
      id: targetId,
      name: name.trim(),
      description,
      color,
      icon: originTemplate?.icon ?? 'layout-template',
      tags: tags.split(',').map(x => x.trim()).filter(Boolean),
      builtIn: false,
      createdAt: originTemplate?.createdAt ?? new Date().toISOString().split('T')[0],
      sections,
      folderStructure,
      overviewSections,
    };
    const existing = loadCustomTemplates();
    const updated = mode === 'update' && originTemplate
      ? existing.map(t2 => t2.id === targetId ? tpl : t2)
      : [...existing, tpl];
    saveCustomTemplates(updated);
    setSaved(true);
  };

  if (saved) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 420, textAlign: 'center' }}>
          <SFIcon name="check-circle-2" size={32} color="var(--ok)" />
          <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text)' }}>{t('projectTemplates.saveSuccess')}</p>
          <SFButton variant="primary" onClick={onClose} style={{ marginTop: 16 }}>{t('common.close')}</SFButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontSize: 17, fontFamily: 'var(--ff-display)', color: 'var(--text)', margin: 0 }}>{t('projectTemplates.createFromProjectTitle')}</h2>

        {originTemplate && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMode('update')} style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: `1px solid ${mode === 'update' ? 'var(--accent)' : 'var(--border)'}`, background: mode === 'update' ? 'rgba(249,255,0,0.08)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
              {t('projectTemplates.updateExisting', { name: originTemplate.name })}
            </button>
            <button onClick={() => setMode('new')} style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: `1px solid ${mode === 'new' ? 'var(--accent)' : 'var(--border)'}`, background: mode === 'new' ? 'rgba(249,255,0,0.08)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
              {t('projectTemplates.createNew')}
            </button>
          </div>
        )}

        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('projectTemplates.namePlaceholder')} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }} />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('projectTemplates.descriptionPlaceholder')} rows={2} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical' }} />
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder={t('projectTemplates.tagsPlaceholder')} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {TEMPLATE_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: 7, background: c, border: color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeTasks} onChange={e => setIncludeTasks(e.target.checked)} />
            {t('projectTemplates.includeTasks')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeFiles} onChange={e => setIncludeFiles(e.target.checked)} />
            {t('projectTemplates.includeFiles')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeOverview} onChange={e => setIncludeOverview(e.target.checked)} />
            {t('projectTemplates.includeOverview')}
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <SFButton variant="secondary" onClick={onClose}>{t('common.cancel')}</SFButton>
          <SFButton variant="primary" onClick={handleSave}>{t('common.save')}</SFButton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Ajouter les clés i18n**

Dans `app/src/locales/fr.json`, ajouter un namespace `projectTemplates` :
```json
"projectTemplates": {
  "createFromProjectTitle": "Créer un modèle depuis ce projet",
  "updateExisting": "Mettre à jour « {{name}} »",
  "createNew": "Créer un nouveau modèle",
  "namePlaceholder": "Nom du modèle",
  "descriptionPlaceholder": "Description (optionnel)",
  "tagsPlaceholder": "Tags séparés par des virgules",
  "includeTasks": "Tâches",
  "includeFiles": "Fichiers",
  "includeOverview": "Aperçu",
  "saveSuccess": "Modèle enregistré."
}
```
Dans `app/src/locales/en.json`, ajouter l'équivalent anglais avec les mêmes clés (`"Create a template from this project"`, `"Update \"{{name}}\""`, `"Create new template"`, `"Template name"`, `"Description (optional)"`, `"Comma-separated tags"`, `"Tasks"`, `"Files"`, `"Overview"`, `"Template saved."`). Vérifier que `common.close`/`common.cancel`/`common.save` existent déjà dans les deux fichiers (`grep -n "\"close\"\|\"cancel\"\|\"save\"" app/src/locales/fr.json` sous le namespace `common`) — sinon les ajouter aussi.

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : aucune nouvelle erreur provenant de ce fichier (il n'est pas encore monté nulle part — Task 5 le fait).

- [ ] **Step 4 : Commit**

```bash
git add app/src/components/CreateTemplateFromProjectModal.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(templates): écran « Créer un modèle depuis ce projet »"
```

---

### Task 5 : `ProjectHeaderBar` — brouillon non-jetable + action unique

**Files:**
- Modify: `app/src/components/ProjectHeaderBar.tsx:44-67` (auto-suppression), `:223-292` (menu d'options + bouton brouillon)

**Interfaces:**
- Consumes: `CreateTemplateFromProjectModal` (Task 4), `removeProject(id)` (déjà importé dans ce fichier, utilisé par l'ancienne auto-suppression).

- [ ] **Step 1 : Retirer l'auto-suppression du brouillon**

Supprimer entièrement le `useEffect` des lignes 44-67 (`pendingRemovalRef`/`setTimeout(() => removeProject(draftId), 0)`) et son commentaire explicatif précédent (lignes 33-43). Vérifier que `useRef` reste utilisé ailleurs dans le fichier avant de retirer son import — sinon retirer l'import devenu inutile.

- [ ] **Step 2 : Ajouter l'état local pour le nouveau modal**

En haut du composant, à côté des autres `useState` (ex. `menuOpen`, `editOpen`) :
```ts
const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
```
Importer `CreateTemplateFromProjectModal` depuis `./CreateTemplateFromProjectModal`.

- [ ] **Step 3 : Ajouter l'entrée de menu « Créer un modèle depuis ce projet »**

Dans le bloc `menuOpen && (...)` (lignes 228-285), juste après l'item « Modifier le projet » (ligne 238) et avant la divider suivante (ligne 239), insérer un nouvel item avec le même style que les boutons voisins :
```tsx
<button onClick={() => { setMenuOpen(false); setCreateTemplateOpen(true); }} style={/* même objet de style que le bouton "Modifier le projet" ligne 232-238, copié verbatim */}>
  <SFIcon name="layout-template" size={14} color="var(--text-3)" />
  {t('projectTemplates.createFromProjectMenuItem')}
</button>
```
Ajouter la clé `projectTemplates.createFromProjectMenuItem` (`"Créer un modèle depuis ce projet"` / `"Create a template from this project"`) dans les deux fichiers de locale.

- [ ] **Step 4 : Monter le modal**

En bas du composant, à côté des autres modals conditionnels (`editOpen && <...>` etc.) :
```tsx
{createTemplateOpen && project && <CreateTemplateFromProjectModal project={project} onClose={() => setCreateTemplateOpen(false)} />}
```

- [ ] **Step 5 : Remplacer le bouton « Terminer » du brouillon par « Fermer sans enregistrer » avec confirmation**

Remplacer le bloc des lignes 288-292 :
```tsx
{project.isTemplateDraft && (
  <SFButton variant="secondary" size="sm" icon="check" onClick={() => navigate('/modeles')}>
    {t('projects.templateDraftFinish')}
  </SFButton>
)}
```
par deux boutons — un pour créer/mettre à jour le modèle directement depuis le brouillon, un pour l'abandonner :
```tsx
{project.isTemplateDraft && (
  <>
    <SFButton variant="primary" size="sm" icon="layout-template" onClick={() => setCreateTemplateOpen(true)}>
      {t('projectTemplates.saveDraftAsTemplate')}
    </SFButton>
    <SFButton
      variant="secondary"
      size="sm"
      icon="trash-2"
      onClick={() => {
        if (!confirm(t('projectTemplates.confirmDiscardDraft'))) return;
        removeProject(project.id);
        navigate('/modeles');
      }}
    >
      {t('projectTemplates.discardDraft')}
    </SFButton>
  </>
)}
```
Ajouter les 3 nouvelles clés (`projectTemplates.saveDraftAsTemplate` = « Enregistrer comme modèle », `projectTemplates.confirmDiscardDraft` = « Supprimer ce brouillon ? Cette action est irréversible. », `projectTemplates.discardDraft` = « Fermer sans enregistrer ») dans les deux fichiers de locale. La clé `projects.templateDraftFinish` devenue orpheline peut rester (YAGNI — pas de chasse aux clés mortes dans ce plan) ou être retirée si triviale à repérer sans casser d'autre usage (`grep -rn "templateDraftFinish" app/src` doit ne montrer que ce fichier avant de la retirer).

- [ ] **Step 6 : Compiler et vérifier**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 7 : Vérification manuelle en preview**

Ouvrir un modèle de projet existant depuis `/modeles` (via le flux de la Task 2) → confirmer que la page Travail s'ouvre sur un vrai projet, que le menu « ... » de `ProjectHeaderBar` est masqué (comportement `!project.isTemplateDraft` inchangé), et que les 2 boutons « Enregistrer comme modèle »/« Fermer sans enregistrer » apparaissent à la place. Cliquer « Enregistrer comme modèle » → le modal de la Task 4 s'ouvre, propose bien « Mettre à jour » par défaut. Quitter l'écran (naviguer ailleurs) sans cliquer « Fermer sans enregistrer » → recharger `/modeles`, confirmer que le brouillon existe toujours quelque part en base (il ne doit plus être supprimé automatiquement) — note : les brouillons ne sont volontairement jamais listés dans `/projets` (`getProjects()` les filtre), donc cette vérification se fait en rouvrant le même modèle et en confirmant que le contenu déjà tapé est toujours là, pas en cherchant le brouillon dans une liste.

- [ ] **Step 8 : Commit**

```bash
git add app/src/components/ProjectHeaderBar.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(projectHeaderBar): brouillon de modèle non-jetable + action Créer un modèle depuis ce projet"
```

---

### Task 6 : Retirer les boutons « enregistrer/charger un modèle » par page (Tâches/Fichiers/Aperçu)

**Files:**
- Modify: `app/src/screens/Travail.tsx:1498-1546` (`SaveAsTemplateModal`), `:1773` (`originTasksTemplate`), `:1914` (`saveTemplateOpen`), `:1943-1960` (`handleLoadTasksTemplate`), `:2210-2220` (bouton `TemplateMenuButton`), `:2469-2477` (modal)
- Modify: `app/src/screens/Fichiers.tsx` (bloc équivalent — `TemplateMenuButton`, modal de sauvegarde locale au fichier, `handleLoadFileTemplate`)
- Modify: `app/src/screens/TravailOverview.tsx:793-805` (`TemplateMenuButton`) + son modal de sauvegarde associé (`setSaveOverviewTemplateModalOpen`)

**Interfaces:**
- Ne consomme ni ne produit rien de nouveau — retrait pur. `TemplateMenuButton` (`components/TemplateMenuButton.tsx`) reste utilisé par `ResourceRouter.tsx` — ne pas le supprimer, ne pas modifier son fichier.

- [ ] **Step 1 : `Travail.tsx` — retirer le bouton, le modal, et le code de chargement**

Retirer le bloc `<TemplateMenuButton .../>` (lignes 2213-2220 environ, dans le fragment `{!selectedTask && <>...</>}`) et le bloc `{saveTemplateOpen && (<SaveAsTemplateModal .../>)}` (lignes 2469-2477). Retirer la fonction `handleLoadTasksTemplate` (lignes 1943-1960 environ) et le composant `SaveAsTemplateModal` (lignes 1498-1546 environ) s'ils ne sont plus référencés ailleurs dans le fichier après ce retrait (`grep -n "SaveAsTemplateModal\|handleLoadTasksTemplate\|saveTemplateOpen\|originTasksTemplate" app/src/screens/Travail.tsx` doit ne plus rien retourner). Retirer aussi la déclaration `const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)` (ligne 1914) et `const originTasksTemplate = project.draftOriginTemplateId ? ... ` (ligne 1773) si devenus orphelins. Retirer l'import `TemplateMenuButton` (ligne 18) de ce fichier une fois toutes ses utilisations retirées.

- [ ] **Step 2 : `Fichiers.tsx` — retirer le bloc équivalent**

Lire le fichier en entier pour repérer précisément (les numéros de ligne exacts n'ont pas été extraits en amont) : le composant/état de modal de sauvegarde (mêmes champs `name`/`description`/`color`/`tags` que documenté dans le rapport de recherche, lignes ~20-50, utilisant `getFolderTreeForProject`), le bouton `TemplateMenuButton` qui l'ouvre, et `handleLoadFileTemplate` (lignes ~137-141). Retirer les trois, ainsi que l'import `TemplateMenuButton` si plus utilisé. **Ne pas retirer** `getFolderTreeForProject`/`addFolderTree` des imports de `fileStore.ts` eux-mêmes (Task 4 en dépend depuis un autre fichier) — seulement leurs usages locaux à `Fichiers.tsx` s'ils ne servent plus qu'à cette fonctionnalité retirée (vérifier qu'ils ne sont pas utilisés ailleurs dans ce même fichier avant de retirer leurs imports).

- [ ] **Step 3 : `TravailOverview.tsx` — retirer le bloc équivalent**

Retirer le bloc `<TemplateMenuButton .../>` (lignes 795-805) à l'intérieur de `<ProjectHeaderBar projectId={project.id}>`. Localiser et retirer `setSaveOverviewTemplateModalOpen`/le modal associé et `applyTemplateById`'s branche de chargement si elle ne sert plus qu'à ce bouton (vérifier avec `grep -n "applyTemplateById" app/src/screens/TravailOverview.tsx` — si cette fonction est aussi utilisée par le mécanisme `removedSystemModules`/application de template lors de la création de projet, la conserver et ne retirer que le `TemplateMenuButton` qui l'invoque). Retirer l'import `TemplateMenuButton` (ligne 21) si plus utilisé.

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : zéro erreur liée à ces 3 fichiers. Des imports `loadAllResourceTemplates`/`loadCustomResourceTemplates`/`saveCustomResourceTemplates` peuvent devenir inutilisés dans ces 3 fichiers — les retirer si TypeScript les signale (`noUnusedLocals`, si activé — sinon vérifier manuellement par grep).

- [ ] **Step 5 : Vérification manuelle en preview**

Ouvrir un vrai projet existant (pas un brouillon) → onglets Travail, Fichiers, Aperçu : confirmer qu'aucun bouton « modèle » n'apparaît plus dans la barre d'en-tête de ces 3 vues, et que le reste de chaque page fonctionne normalement (ajout de tâche, de dossier, édition d'aperçu).

- [ ] **Step 6 : Commit**

```bash
git add app/src/screens/Travail.tsx app/src/screens/Fichiers.tsx app/src/screens/TravailOverview.tsx
git commit -m "refactor: retire les boutons de modèle par page (Tâches/Fichiers/Aperçu), remplacés par l'action unique"
```

---

### Task 7 : Assistant « Nouveau projet » — retirer l'étape Fichiers

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:33` (`type Step`), `:102` (`folderStructTemplates`, à retirer), `:116-134` (`next`/`back`), `:136-199` (`create`), `:201` (`STEP_ORDER`), `:214-225` (header/step-dots), `:294` et `:411` (aperçus utilisant `resolveTasksSections`), `:423-500+` (bloc JSX `step === 'fichiers'`)

**Interfaces:**
- Consumes: `ProjectTemplate.sections`/`.folderStructure`/`.overviewSections` (Task 1).

- [ ] **Step 1 : Simplifier le type `Step` et `STEP_ORDER`**

```ts
type Step = 'start' | 'info' | 'team';
```
```ts
const STEP_ORDER: Step[] = ['start', 'info', 'team'];
```

- [ ] **Step 2 : Retirer le bloc JSX de l'étape Fichiers**

Supprimer entièrement `{step === 'fichiers' && (...)}` (lignes 423 à la fin du bloc). Retirer `folderStructTemplates` (ligne 102) et tout état local qui ne servait qu'à ce step (`folderStructTplId` si son seul rôle était cette étape — vérifier s'il est aussi lu dans `create()` : d'après le rapport de recherche il l'est, ligne ~184-190 ; dans ce cas, retirer entièrement la logique `folderStructTplId` de `create()` aussi, cf. Step 4 ci-dessous, plutôt que de la garder orpheline).

- [ ] **Step 3 : Mettre à jour `next()`/`back()` et les step-dots**

Dans `next()` (lignes 116-129), retirer la transition `info → fichiers` et `fichiers → team` ; la nouvelle séquence est `start → info → team → create()`. Vérifier si `next()` pré-remplissait `folderStructTplId`/`tasksTplId`/`overviewTplId` depuis `selectedTemplate` lors du passage `start → info` (mentionné dans le rapport de recherche) — si oui, ce pré-remplissage n'est plus nécessaire puisque `create()` va lire `selectedTemplate.sections`/`.folderStructure`/`.overviewSections` directement (Step 4) ; le retirer. Dans le header (lignes 217-225), retirer le `StepDot` « Fichiers » (3ᵉ sur 4) — la séquence devient Départ(1)/Infos(2)/Équipe(3). Mettre à jour le switch des sous-titres (ligne 214) en conséquence.

- [ ] **Step 4 : Simplifier `create()`**

Remplacer les trois blocs séparés de résolution (tâches via `resolveTasksSections({ ...selectedTemplate, tasksTemplateId: tasksTplId ?? ... })`, dossiers via `fileTpl.folderStructure` cherché par `folderStructTplId`, aperçu via `overviewTpl.overviewSections` cherché par `overviewTplId`) par une lecture directe des 3 champs sur `selectedTemplate` :

```ts
const create = async () => {
  const allClients = getClients();
  const client = allClients.find(c => c.id === clientId) ?? allClients[0];
  const members = team.filter(u => memberIds.includes(u.id));
  const projectId = `pj${Date.now()}`;
  const templateSections = selectedTemplate?.sections ?? [];
  const newProject: Project = {
    id: projectId,
    name: name.trim(),
    clientId: client.id,
    clientName: client.name,
    clientColor: color,
    phase: 'preproduction',
    phaseLabel: 'Préproduction',
    progress: 0,
    taskCount: templateSections.reduce((n, s) => n + s.tasks.length, 0),
    deliverableCount: 0,
    members,
    deliveryDate: deliveryDate ? formatDisplay(deliveryDate) : '—',
    status: 'info',
    statusLabel: 'En cours',
    modifiedAt: new Date().toISOString(),
  };
  if (selectedTemplate?.sections?.length) {
    const sections: SectionData[] = templateSections.map(sec => ({
      label: sec.label,
      progress: 0,
      tasks: sec.tasks.map((tt, i): Task => ({
        id: `${projectId}-${sec.label}-${i}`,
        title: tt.title,
        projectId,
        projectName: newProject.name,
        projectColor: color,
        assignees: [members[0] ?? USERS.lea],
        status: 'warn',
        statusLabel: 'En attente',
        priority: tt.priority ?? 'normal',
        priorityLabel: tt.priority === 'high' ? 'Élevée' : tt.priority === 'low' ? 'Basse' : 'Normale',
        dueDate: '',
        checked: false,
        subtasks: [],
      })),
    }));
    setSections(projectId, sections);
  }
  if (selectedTemplate?.folderStructure?.length) {
    addFolderTree(selectedTemplate.folderStructure, { projectId });
  }
  // `project_content.project_id` référence `projects(id)` : la ligne projet doit
  // exister AVANT d'écrire le contenu d'Aperçu (sinon violation de clé étrangère
  // en session réelle). On attend donc la création avant setProjectContent.
  await onCreate(newProject);
  if (selectedTemplate?.overviewSections?.length) {
    setProjectContent(projectId, { customSections: selectedTemplate.overviewSections });
  }
  onClose();
};
```

Noter le retrait des deux champs `folderStructureTemplateId`/`overviewTemplateId` sur `newProject` (ils référençaient des `ResourceTemplate` par id — n'ont plus de sens puisque le contenu est copié directement, pas lié). Vérifier dans `types/index.ts` si `Project.folderStructureTemplateId`/`overviewTemplateId` sont lus ailleurs dans le code avant de les omettre ici (`grep -rn "folderStructureTemplateId\|overviewTemplateId" app/src` côté lecture) — si un autre écran en dépend pour un affichage quelconque, garder les champs sur le type mais ne plus les peupler ici plutôt que de les retirer du type (moindre risque).

- [ ] **Step 5 : Mettre à jour les 2 aperçus de comptage (lignes 294 et 411)**

Remplacer chaque `resolveTasksSections({ ...selectedTemplate, tasksTemplateId: tasksTplId ?? selectedTemplate.tasksTemplateId })` (ou équivalent) par `selectedTemplate.sections ?? []` directement, ou par `resolveTasksSections(selectedTemplate)` (la fonction, simplifiée à la Task 1, fait exactement ça) — préférer réutiliser `resolveTasksSections(selectedTemplate)` pour rester cohérent avec le reste du code qui passe par cette fonction.

- [ ] **Step 6 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 7 : Vérification manuelle en preview**

`/projets` → « Nouveau projet » → confirmer 3 étapes seulement (Départ/Infos/Équipe), plus d'étape Fichiers. Choisir un modèle de projet existant à l'étape Départ (un des 4 modèles built-in migrés à la Task 1, avec tâches + dossiers) → créer le projet → confirmer que les tâches ET la structure de dossiers apparaissent bien dans le nouveau projet (onglets Travail et Fichiers).

- [ ] **Step 8 : Commit**

```bash
git add app/src/components/ProjectsListView.tsx
git commit -m "refactor(nouveauProjet): retire l'étape Fichiers, lit sections/folderStructure/overviewSections directement du modèle"
```

---

### Task 8 : Revue finale et vérification bout-en-bout

**Files:** aucun fichier propre à cette tâche — revue transversale.

- [ ] **Step 1 : Typecheck complet**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Zéro erreur attendue.

- [ ] **Step 2 : Grep de contrôle — aucune référence morte**

```bash
grep -rn "tasksTemplateId\|defaultFolderStructureId\|defaultOverviewTemplateId" app/src --include="*.tsx" --include="*.ts" | grep -v "migrateLegacyProjectTemplate\|@deprecated"
```
Attendu : vide, à l'exception du bloc de migration écrit à la Task 1 (Step 5) et des champs `@deprecated` conservés sur le type.

```bash
grep -rn "TemplateProjectView\|openTemplateDraft\b" app/src
```
Attendu : `TemplateProjectView` n'apparaît plus nulle part ; `openTemplateDraft` (sans le `New`) n'apparaît que dans `Modeles.tsx` (toujours utilisé pour Document/Scénario/Moodboard/Revue vidéo) et sa mention en commentaire dans `ResourceRouter.tsx`.

- [ ] **Step 3 : Parcours de vérification complet en preview (reprend la checklist de la spec)**

1. Page Modèles : seuls des modèles de Projet apparaissent dans la navigation principale (plus de catégories Aperçu/Tâches/Fichiers en haut, le groupe « Ressources » reste intact avec Document/Scénario/Moodboard/Revue vidéo/Formulaires).
2. Créer un nouveau modèle de projet → un brouillon s'ouvre sur la vraie page Travail, vide. Ajouter une section et une tâche. Aller dans Fichiers, ajouter un dossier. Aller dans Aperçu, modifier Vision. Cliquer « Enregistrer comme modèle » (bouton `ProjectHeaderBar`) avec les 3 cases cochées → confirmer que le modèle créé contient bien les 3 en rouvrant `/modeles`.
3. Sur un projet RÉEL existant (pas un brouillon) : ouvrir le menu « ... » de `ProjectHeaderBar` → « Créer un modèle depuis ce projet » fonctionne, propose bien « Créer un nouveau modèle » (pas de mise à jour proposée, ce projet n'a pas de `draftOriginTemplateId`).
4. Rouvrir un modèle existant pour le modifier → le brouillon s'ouvre avec le contenu déjà là. Réenregistrer en décochant « Fichiers » → l'écran propose par défaut de mettre à jour ce même modèle ; confirmer qu'il perd sa structure de fichiers mais garde tâches et aperçu.
5. Cliquer « Fermer sans enregistrer » sur un brouillon → confirmation demandée, puis le brouillon disparaît réellement (rouvrir le même modèle depuis `/modeles` recrée un brouillon vide, pas l'ancien contenu non sauvegardé).
6. Assistant Nouveau projet : confirmer que l'étape Fichiers a disparu (3 étapes), et qu'un projet créé depuis un modèle a bien ses tâches, ses fichiers et son aperçu préremplis.
7. (Si un modèle personnalisé en ancien format existe encore dans les données de test) : un modèle personnalisé créé avant ce chantier (ancien format `tasksTemplateId`) s'ouvre et se matérialise toujours correctement (migration à la lecture) — sinon, créer manuellement un objet de test dans `localStorage`/Supabase avec l'ancien format pour vérifier la migration, puis le retirer.

- [ ] **Step 4 : Dispatcher la revue finale de branche**

Utiliser `superpowers:requesting-code-review` avec le SHA de départ du worktree (`git merge-base main HEAD` ou équivalent) et `HEAD`, sur le modèle le plus capable disponible, avant `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Couverture de la spec :** Décision 1 (nav simplifiée) → Task 3. Décision 2 (un seul objet) → Task 1. Décision 3 (édition = brouillon réel) → Task 2. Décision 4 (sauvegarde sélective) → Task 4/5. Décision 5 (assistant simplifié) → Task 7. Migration modèles personnalisés → Task 1 Step 5. Brouillon non-jetable + fermeture explicite → Task 5. Migration built-in (4 modèles Tâches) → Task 1 Step 2/4. Vérification → Task 8.

**Placeholders :** aucun — chaque step porte du code concret ou une commande exacte ; les quelques instructions « localiser précisément » (Task 6 Step 2, lignes non extraites en amont pour `Fichiers.tsx`) sont accompagnées d'assez de contexte (noms de fonctions/imports à chercher) pour ne pas être une ambiguïté bloquante.

**Cohérence des types :** `ProjectTemplate.sections`/`.folderStructure`/`.overviewSections` (Task 1) utilisés identiquement dans Task 2 (`openProjectTemplateDraft`), Task 4 (`CreateTemplateFromProjectModal`), Task 7 (`create()`). `resolveTasksSections(tpl)` signature inchangée partout. `getFolderTreeForProject` retourne `FolderTreeNodeWithId[]` (a un `id` en plus de `FolderNode`) — compatible en lecture puisque `FolderNode` a aussi `id`/`name`/`children?`, aucune conversion nécessaire.
