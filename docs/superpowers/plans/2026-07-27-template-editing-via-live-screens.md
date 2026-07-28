# Édition de modèles via les vrais écrans (projet brouillon) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Éditer un modèle de Fichiers/Tâches/Aperçu en ouvrant le vrai écran de projet (Fichiers/Travail/TravailOverview) sur un projet brouillon invisible pré-rempli, plutôt qu'un éditeur maison séparé. Supprimer au passage l'onglet "Ressources" mort du modèle Projet.

**Architecture:** Voir `docs/superpowers/specs/2026-07-27-template-editing-via-live-screens-design.md`. Un `Project` gagne deux champs (`isTemplateDraft`, `draftOriginTemplateId`). `getProjects()` (liste) filtre les brouillons ; `findProject()` (résolution par id) reste non filtré en interne, donc les écrans de projet continuent de résoudre un brouillon normalement. `ProjectHeaderBar` détecte le mode brouillon, adapte son affichage, et supprime le brouillon (`removeProject`, déjà cascade-safe) quand l'utilisateur quitte l'écran. Chaque écran (Fichiers/Travail/TravailOverview) apprend à **écraser** (au lieu de toujours créer) le modèle d'origine quand `draftOriginTemplateId` est renseigné.

## Global Constraints

- `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) doit rester à 0 erreur après chaque tâche.
- Ne jamais casser le flux existant "Enregistrer comme modèle" sur un **vrai** projet (pas de régression sur `SaveFolderTemplateModal`/`SaveAsTemplateModal`/`SaveOverviewTemplateModal` quand `project.isTemplateDraft` est `undefined`/`false`) — tout le nouveau comportement est additif, gated par `draftOriginTemplateId`.
- Un projet brouillon ne doit jamais apparaître dans une liste de projets (Dashboard, `/projets`, sidebar, fiche client, palette de commande, portail client) — uniquement filtré côté `getProjects()`.
- `removeProject(id)` cascade déjà correctement (sections, événements, fichiers, factures) — ne pas dupliquer cette logique ailleurs.
- Les 3 sous-modèles concernés par ce chantier sont uniquement `file`/`tasks`/`overview`. Les types `document`/`screenplay`/`video_review`/`moodboard`/`form` gardent leur éditeur actuel (`ResourceTemplateEditor`/`TemplateResourceView`), inchangé.

---

### Task 1: Champs `Project` + `projectStore.ts` (brouillon + création)

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/data/projectStore.ts`
- Create: `docs/superpowers/specs/2026-07-27-template-draft-columns-migration.sql`

**Interfaces:**
- Produces: `Project.isTemplateDraft?: boolean`, `Project.draftOriginTemplateId?: string` ; `createTemplateDraft(name: string, originTemplateId?: string): Promise<string>` (retourne l'id du brouillon créé) — exportée depuis `projectStore.ts`, consommée par la Task 3.
- `getProjects()` garde exactement sa signature actuelle mais exclut désormais les brouillons ; `findProject(id)` garde exactement sa signature actuelle et continue de résoudre un brouillon (résolution non filtrée).

- [ ] **Step 1:** Dans `app/src/types/index.ts`, ajouter les deux champs à `Project` (après `completed?: boolean;`, ligne 68) :
  ```ts
  export interface Project {
    // ... champs existants inchangés ...
    completed?: boolean;
    /** Projet invisible créé pour éditer un modèle via le vrai écran (Fichiers/Tâches/Aperçu) — jamais listé, supprimé en quittant l'écran. */
    isTemplateDraft?: boolean;
    /** Présent uniquement sur un brouillon : id du ResourceTemplate à écraser en sauvegardant, plutôt que d'en créer un nouveau. */
    draftOriginTemplateId?: string;
  }
  ```

- [ ] **Step 2:** Dans `app/src/data/projectStore.ts`, ajouter les deux colonnes à `ProjectRow` (après `completed: boolean;` — chercher le champ existant dans l'interface, lignes 42-65) :
  ```ts
    is_template_draft: boolean | null;
    draft_origin_template_id: string | null;
  ```

- [ ] **Step 3:** Dans `toProject` (la fonction qui mappe `ProjectRow` → `Project`, à côté de `toRow`), ajouter :
  ```ts
    isTemplateDraft: row.is_template_draft ?? undefined,
    draftOriginTemplateId: row.draft_origin_template_id ?? undefined,
  ```
  Et dans `toRow` (mapping `Project` → row pour l'insert, lignes 93-118), ajouter :
  ```ts
    is_template_draft: p.isTemplateDraft ?? false,
    draft_origin_template_id: p.draftOriginTemplateId ?? null,
  ```

- [ ] **Step 4:** Renommer l'usage interne pour séparer liste filtrée et résolution non filtrée. Remplacer les lignes 210-226 par :
  ```ts
  function getAllProjectsUnfiltered(): Project[] {
    if (isDemoSession()) {
      return [...PROJECTS, ..._added].map(p =>
        _overrides[p.id] ? { ...p, ..._overrides[p.id] } : p
      );
    }
    ensureSupabaseFetchStarted();
    return _supabaseProjects;
  }

  export function getProjects(): Project[] {
    return getAllProjectsUnfiltered().filter(p => !p.isTemplateDraft);
  }

  export function getProjectsByClient(clientId: string): Project[] {
    return getProjects().filter(p => p.clientId === clientId);
  }

  export function findProject(id: string): Project | undefined {
    return getAllProjectsUnfiltered().find(p => p.id === id);
  }
  ```
  Ce découpage est le point critique du chantier : `getProjects()` (toutes les listes de l'app) exclut les brouillons sans qu'aucun des ~20 sites d'appel n'ait besoin d'être touché, tandis que `findProject()` (utilisé par `Fichiers.tsx`/`Travail.tsx`/`TravailOverview.tsx`/`ProjectHeaderBar.tsx` pour résoudre le projet courant par id) continue de résoudre un brouillon normalement.

- [ ] **Step 5:** Ajouter `createTemplateDraft`, à la suite de `addProject` :
  ```ts
  export function createTemplateDraft(name: string, originTemplateId?: string): Promise<string> {
    const id = `draft-${Date.now()}`;
    const draft: Project = {
      id,
      name,
      clientId: '',
      clientName: '',
      clientColor: '#6b7280',
      phase: 'production',
      phaseLabel: '',
      progress: 0,
      taskCount: 0,
      deliverableCount: 0,
      members: [],
      deliveryDate: '',
      status: 'info',
      statusLabel: '',
      modifiedAt: new Date().toISOString(),
      isTemplateDraft: true,
      draftOriginTemplateId: originTemplateId,
    };
    return addProject(draft).then(() => id);
  }
  ```

- [ ] **Step 6:** Créer `docs/superpowers/specs/2026-07-27-template-draft-columns-migration.sql` (migration manuelle — à coller dans Supabase → SQL Editor par l'utilisateur, comme toute migration de ce projet ; ne pas l'exécuter soi-même) :
  ```sql
  -- À exécuter manuellement dans Supabase → SQL Editor.
  alter table projects
    add column if not exists is_template_draft boolean not null default false,
    add column if not exists draft_origin_template_id text;
  ```

- [ ] **Step 7:** `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) → 0 erreur.

- [ ] **Step 8:** Commit:
  ```bash
  git add app/src/types/index.ts app/src/data/projectStore.ts docs/superpowers/specs/2026-07-27-template-draft-columns-migration.sql
  git commit -m "feat(templates): add draft-project fields + createTemplateDraft to projectStore"
  ```

---

### Task 2: Supprimer l'onglet "Ressources" mort du modèle Projet

**Files:**
- Modify: `app/src/data/templates.ts`
- Modify: `app/src/screens/Modeles.tsx`
- Modify: `app/src/screens/Travail.tsx`

**Interfaces:**
- Consumes: rien de nouveau.
- Removes: `ProjectTemplate.resources`, `TemplateResource` (type), `LResource` (Modeles.tsx), l'onglet "Ressources" de `TemplateProjectView`.

- [ ] **Step 1:** Dans `app/src/data/templates.ts`, supprimer l'interface `TemplateResource` (lignes 62-66) et le champ `resources: TemplateResource[];` de `ProjectTemplate` (ligne 75). Chercher tous les littéraux `resources: [...]`/`resources: []` dans les seeds `BUILT_IN_TEMPLATES` (lignes ~148, 165, 183, 198, 215 d'après la recherche précédente) et les retirer de chaque objet.

- [ ] **Step 2:** Dans `app/src/screens/Modeles.tsx`, dans `TemplateProjectView` :
  - Retirer `{ key: 'resources', label: 'Ressources' }` du tableau `tabs` (ligne 1179).
  - Retirer le bloc `activeTab === 'resources'` en entier (lignes 1316-1357, le contenu de l'onglet) et le modal "Ajouter une ressource" (lignes 1360-1433, `showAddResource`).
  - Retirer l'entrée `{ icon: 'paperclip', label: 'Ressources', value: resources.length }` du tableau de stats de l'onglet "Vue d'ensemble" (ligne ~1197) — ne garder que Sections et Tâches dans ce tableau.
  - Retirer l'état `const [resources, setResources] = useState<LResource[]>(...)` (lignes 1117-1119), `showAddResource`/`resTypeFilter` (lignes ~1125-1126), et le type `LResource` + `RESOURCE_TYPE_ICONS_TPV`/`RESOURCE_TYPE_LABELS_TPV` (lignes 1082-1093) — plus rien ne les utilise une fois l'onglet retiré.
  - Dans `handleSave` (ligne ~1138), retirer la ligne `resources: resources.map(({ id: _id, ...r }) => r),`.
  - Retirer `activeTab` de son union `'overview' | 'tasks' | 'resources'` → `'overview' | 'tasks'` (ligne 1122), et son défaut reste `'tasks'`.

- [ ] **Step 3:** Dans `app/src/screens/Travail.tsx`, dans `SaveAsTemplateModal.handleSave`, retirer la ligne `resources: [],` du littéral `ProjectTemplate` construit (dans le bloc identifié en recherche, autour de la ligne 1618-1620).

- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur (le retrait du champ `resources` du type `ProjectTemplate` doit faire échouer la compilation sur tout site qui l'écrit encore — s'assurer qu'il n'en reste aucun).

- [ ] **Step 5:** Vérifier en direct dans le navigateur (session démo) : ouvrir un modèle Projet existant dans Modèles → seuls les onglets "Vue d'ensemble" et "Tâches" apparaissent, plus de "Ressources".

- [ ] **Step 6:** Commit:
  ```bash
  git add app/src/data/templates.ts app/src/screens/Modeles.tsx app/src/screens/Travail.tsx
  git commit -m "refactor(templates): remove dead 'Ressources' tab/field from Project template (never consumed at project creation)"
  ```

---

### Task 3: Rediriger "Modifier"/"Nouveau modèle" (Fichiers/Tâches/Aperçu) vers un brouillon

**Files:**
- Modify: `app/src/screens/Modeles.tsx`

**Interfaces:**
- Consumes: `createTemplateDraft` (Task 1, `../data/projectStore`), `addFolderTree` (déjà importé), `setSections` (déjà importé), `setProjectContent`/`VISION_SECTION_ID`/`getDefaultVisionSection` (`../data/projectContentStore`, à importer), `useNavigate` (déjà importé dans le fichier, mais pas encore instancié dans le composant `Modeles()`).

- [ ] **Step 1:** Ajouter l'import manquant en haut du fichier, à côté de `import type { CustomOverviewSection } from '../data/projectContentStore';` (ligne 22) :
  ```ts
  import { setProjectContent, VISION_SECTION_ID, getDefaultVisionSection } from '../data/projectContentStore';
  import { createTemplateDraft } from '../data/projectStore';
  ```

- [ ] **Step 2:** Dans le composant `Modeles()` (commence ligne 1840), ajouter `const navigate = useNavigate();` juste après `const plan = usePlan();` (ligne 1842).

- [ ] **Step 3:** Toujours dans `Modeles()`, ajouter la fonction suivante (par exemple juste avant `handleNew`, autour de la ligne 2063) :
  ```ts
  const openTemplateDraft = async (tpl: { id: string; name: string; type: ResourceTemplateType } & Partial<ResourceTemplate>) => {
    const draftId = await createTemplateDraft(tpl.name, tpl.id);
    if (tpl.type === 'file') {
      addFolderTree(tpl.folderStructure ?? [], { projectId: draftId });
      navigate(`/projets/${draftId}/fichiers`);
    } else if (tpl.type === 'tasks') {
      const newSections: SectionData[] = (tpl.sections ?? []).map(sec => ({
        label: sec.label,
        progress: 0,
        tasks: sec.tasks.map((tt, i): Task => ({
          id: `${draftId}-${sec.label}-${i}-${Date.now()}`,
          title: tt.title,
          projectId: draftId,
          projectName: tpl.name,
          projectColor: '#6b7280',
          assignee: USERS.lea,
          status: 'warn',
          statusLabel: 'En attente',
          priority: tt.priority ?? 'normal',
          priorityLabel: tt.priority === 'high' ? 'Élevée' : tt.priority === 'low' ? 'Basse' : 'Normale',
          dueDate: '',
          checked: false,
          subtasks: [],
        })),
      }));
      setSections(draftId, newSections);
      navigate(`/projets/${draftId}`);
    } else if (tpl.type === 'overview') {
      const vision = getDefaultVisionSection();
      const reusable = (tpl.overviewSections ?? []).filter(s => s.id !== VISION_SECTION_ID);
      setProjectContent(draftId, { customSections: [vision, ...reusable], customSectionData: {} });
      navigate(`/projets/${draftId}/overview`);
    }
  };

  const openNewTemplateDraft = async (type: 'file' | 'tasks' | 'overview') => {
    const draftId = await createTemplateDraft('Nouveau modèle');
    if (type === 'file') navigate(`/projets/${draftId}/fichiers`);
    else if (type === 'tasks') navigate(`/projets/${draftId}`);
    else navigate(`/projets/${draftId}/overview`);
  };
  ```
  Note : `openNewTemplateDraft` ne passe pas de `originTemplateId` à `createTemplateDraft` (deuxième argument omis) — le brouillon n'a donc pas de `draftOriginTemplateId`, ce qui fait retomber la sauvegarde (Tasks 5/6/7) sur le comportement "créer un nouveau modèle" déjà existant, sans code spécial à écrire pour ce cas.

- [ ] **Step 4:** Brancher "Modifier" (ligne 2372-2373) — remplacer :
  ```tsx
  onOpen={() => setTemplateResViewTpl(selectedRes)}
  ```
  par :
  ```tsx
  onOpen={() => {
    if (selectedRes.type === 'file' || selectedRes.type === 'tasks' || selectedRes.type === 'overview') {
      void openTemplateDraft(selectedRes);
    } else {
      setTemplateResViewTpl(selectedRes);
    }
  }}
  ```

- [ ] **Step 5:** Brancher "Nouveau modèle" dans `handleNew` (lignes 2063-2072) — remplacer la branche `else` :
  ```ts
  const handleNew = () => {
    if (!canUseFeature(plan, 'customTemplates')) {
      requestUpgrade({ feature: 'customTemplates' });
      return;
    }
    if (typeFilter === 'projets') { setPreviewTpl({ id: `tpl-${Date.now()}`, name: 'Nouveau modèle', description: '', color: '#6366f1', icon: 'layout-template', tags: [], builtIn: false, createdAt: new Date().toISOString().split('T')[0] }); }
    else if (typeFilter === 'formulaires') { setFormViewData({}); setFormViewOpen(true); }
    else if (typeFilter === 'file' || typeFilter === 'tasks' || typeFilter === 'overview') { void openNewTemplateDraft(typeFilter); }
    else { setResEditorData({ type: typeFilter }); setResEditorOpen(true); }
  };
  ```
  (Le littéral `ProjectTemplate` de la branche `'projets'` perd `resources: []` — cohérent avec la Task 2.)

- [ ] **Step 6:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 7:** Vérifier en direct (session démo) : Modèles → catégorie "Fichiers" → cliquer un modèle existant → "Ouvrir/modifier le contenu" (ou équivalent) → l'app navigue vers `/projets/draft-.../fichiers`, un vrai écran Fichiers s'affiche avec les dossiers du modèle déjà présents. Répéter pour Tâches (sections/tâches déjà présentes) et Aperçu (sections déjà présentes, Vision incluse). Tester aussi "Nouveau modèle" pour chacun des 3 types → écran vide.

- [ ] **Step 8:** Commit:
  ```bash
  git add app/src/screens/Modeles.tsx
  git commit -m "feat(templates): edit/create Fichiers/Tâches/Aperçu templates via a draft project on the real screens"
  ```

---

### Task 4: `ProjectHeaderBar` — mode brouillon + nettoyage automatique

**Files:**
- Modify: `app/src/components/ProjectHeaderBar.tsx`

**Interfaces:**
- Consumes: `removeProject` (`../data/projectStore`, à importer).

- [ ] **Step 1:** Importer `removeProject` à côté de l'import existant de `findProject`/`subscribeProjects` en haut du fichier.

- [ ] **Step 2:** Juste après la résolution de `project` (ligne 30, `const project = findProject(projectId);`) et avant le `if (!project) return null;` (ligne 45), ajouter l'effet de nettoyage :
  ```ts
  // Un projet brouillon (édition de modèle) est jetable : il disparaît dès qu'on
  // quitte cet écran, quel que soit le chemin de sortie (bouton "Terminer",
  // navigation ailleurs, retour arrière). removeProject() cascade déjà
  // correctement (sections/fichiers/événements) — rien d'autre à nettoyer ici.
  useEffect(() => {
    if (!project?.isTemplateDraft) return;
    const draftId = project.id;
    return () => { removeProject(draftId); };
  }, [project?.id, project?.isTemplateDraft]);
  ```

- [ ] **Step 3:** Adapter le rendu pour le mode brouillon. Remplacer le bloc du fil d'Ariane (lignes 65-132, la `<div>` contenant client/Projets/pastille couleur/nom de projet) par un rendu conditionnel :
  ```tsx
  {project.isTemplateDraft ? (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: 'var(--ff-mono)', fontSize: 11,
      color: 'var(--text-3)', marginBottom: 8,
    }}>
      <SFIcon name="layout-template" size={12} color="var(--accent)" />
      <span>Édition du modèle « {project.name} »</span>
    </div>
  ) : (
    /* fil d'Ariane existant, lignes 66-132, inchangé */
  )}
  ```
  (Garder le titre du projet / nom éditable existant sous le fil d'Ariane tel quel — seule la ligne fil d'Ariane change.)

- [ ] **Step 4:** Filtrer les onglets pour un brouillon — n'afficher que celui correspondant à l'écran courant. Ajouter `import { useLocation } from 'react-router-dom';` en haut du fichier si pas déjà présent, puis `const location = useLocation();` avec les autres hooks du composant. Remplacer la construction de `tabs` (lignes 47-55) par :
  ```ts
  const allTabs = [
    { label: t('projects.tabOverview'),   path: `/projets/${projectId}/overview`,   end: true,  badge: 0 },
    { label: t('projects.tabTasks'),      path: `/projets/${projectId}`,            end: true,  badge: taskNotifs },
    { label: t('projects.tabCalendar'),   path: `/projets/${projectId}/calendrier`, end: false, badge: 0 },
    { label: t('projects.tabFiles'),      path: `/projets/${projectId}/fichiers`,   end: false, badge: 0 },
    { label: t('projects.tabFinance'),    path: `/projets/${projectId}/finances`,   end: false, badge: 0 },
    { label: t('projects.tabTeam'),       path: `/projets/${projectId}/membres`,    end: false, badge: 0 },
    { label: t('projects.tabActivity'),   path: `/projets/${projectId}/activite`,   end: false, badge: 0 },
  ];
  const tabs = project.isTemplateDraft
    ? allTabs.filter(tb => tb.end ? location.pathname === tb.path : location.pathname.startsWith(tb.path))
    : allTabs;
  ```

- [ ] **Step 5:** Masquer le menu projet (couleur/déplacer/archiver/supprimer) pour un brouillon, et ajouter un bouton "Terminer" à la place. Repérer le bloc du menu projet (lignes 179-233, le bouton "..." + son dropdown) et l'englober : `{!project.isTemplateDraft && ( /* bloc existant inchangé */ )}`. Juste après ce bloc conditionnel, ajouter :
  ```tsx
  {project.isTemplateDraft && (
    <SFButton variant="secondary" size="sm" icon="check" onClick={() => navigate('/modeles')}>
      Terminer
    </SFButton>
  )}
  ```
  (`navigate` est déjà disponible dans ce composant — vérifier l'import `useNavigate`/l'instanciation existante avant d'en ajouter une deuxième.)

- [ ] **Step 6:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 7:** Vérifier en direct : ouvrir un modèle de Fichiers en édition (via Task 3) → l'en-tête affiche "Édition du modèle « X »" au lieu du fil d'Ariane client, un seul onglet (Fichiers), pas de menu "...", un bouton "Terminer". Cliquer "Terminer" → retour à `/modeles`, revenir sur `/projets` → le brouillon n'y apparaît pas (confirme le filtre `getProjects()` de la Task 1). Vérifier aussi qu'un vrai projet (non-brouillon) garde exactement son affichage actuel (fil d'Ariane, 7 onglets, menu "...").

- [ ] **Step 8:** Commit:
  ```bash
  git add app/src/components/ProjectHeaderBar.tsx
  git commit -m "feat(project-header): draft-project mode (banner, single tab, no project menu, auto-cleanup on exit)"
  ```

---

### Task 5: `Fichiers.tsx` — écraser le modèle d'origine en mode brouillon

**Files:**
- Modify: `app/src/screens/Fichiers.tsx`

**Interfaces:**
- Consumes: `project.draftOriginTemplateId` (Task 1), `loadAllResourceTemplates` (déjà importé).
- `SaveFolderTemplateModal` gagne une prop optionnelle `originTemplate?: ResourceTemplate`.

- [ ] **Step 1:** Modifier la signature de `SaveFolderTemplateModal` (lignes 17-21) :
  ```ts
  function SaveFolderTemplateModal({ projectId, projectName, originTemplate, onClose }: {
    projectId: string;
    projectName: string;
    originTemplate?: ResourceTemplate;
    onClose: () => void;
  }) {
  ```

- [ ] **Step 2:** Préremplir depuis `originTemplate` quand présent. Remplacer les lignes d'initialisation d'état (`name`/`description`/`color`/`tags`) :
  ```ts
  const [name, setName] = useState(originTemplate?.name ?? projectName);
  const [description, setDescription] = useState(originTemplate?.description ?? '');
  const [color, setColor] = useState(originTemplate?.color ?? TEMPLATE_COLORS[0]);
  const [tags, setTags] = useState(originTemplate?.tags?.join(', ') ?? '');
  ```

- [ ] **Step 3:** Dans `handleSave`, écraser au lieu de créer quand `originTemplate` est présent :
  ```ts
  const handleSave = () => {
    if (!name.trim()) return;
    const tpl: ResourceTemplate = {
      id: originTemplate?.id ?? `res-${Date.now()}`,
      type: 'file',
      name: name.trim(),
      description: description.trim(),
      color,
      icon: 'folder',
      tags: tags.split(',').map(x => x.trim()).filter(Boolean),
      builtIn: false,
      createdAt: originTemplate?.createdAt ?? new Date().toISOString().split('T')[0],
      folderStructure: tree,
    };
    const existing = loadCustomResourceTemplates();
    const updated = originTemplate
      ? existing.map(t2 => t2.id === tpl.id ? tpl : t2)
      : [...existing, tpl];
    saveCustomResourceTemplates(updated);
    setSaved(true);
    setTimeout(onClose, 1400);
  };
  ```

- [ ] **Step 4:** Dans le composant `Fichiers()`, calculer `originTemplate` et le passer au modal. Là où `project` est résolu (ligne 127) et où `<SaveFolderTemplateModal>` est rendu (lignes 156-162), ajouter :
  ```ts
  const originTemplate = project?.draftOriginTemplateId
    ? loadAllResourceTemplates().find(t2 => t2.id === project.draftOriginTemplateId && t2.type === 'file')
    : undefined;
  ```
  puis passer `originTemplate={originTemplate}` en prop à `<SaveFolderTemplateModal>`.

- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 6:** Vérifier en direct : ouvrir un modèle de Fichiers existant en édition (Task 3), modifier l'arborescence (ajouter un dossier), cliquer "Modèles" → "Enregistrer comme modèle" → le formulaire est prérempli avec le nom/description du modèle d'origine ; sauvegarder ; retourner dans Modèles → catégorie Fichiers → le **même** modèle (pas un doublon) reflète le nouveau dossier. Vérifier aussi qu'un vrai projet (non-brouillon) garde le comportement "toujours créer un nouveau modèle" inchangé.

- [ ] **Step 7:** Commit:
  ```bash
  git add app/src/screens/Fichiers.tsx
  git commit -m "feat(files): overwrite the origin template when saving from a draft-project edit session"
  ```

---

### Task 6: `Travail.tsx` — écraser le modèle de Tâches d'origine en mode brouillon

**Files:**
- Modify: `app/src/screens/Travail.tsx`

**Interfaces:**
- Consumes: `project.draftOriginTemplateId` (Task 1), `loadAllResourceTemplates` (déjà importé).
- `SaveAsTemplateModal` gagne une prop optionnelle `originTasksTemplate?: ResourceTemplate`.

**Global constraint spécifique à cette tâche :** ne pas toucher au comportement existant de `SaveAsTemplateModal` sur un **vrai** projet (il continue de créer un nouveau `ResourceTemplate` type `tasks` **et** un nouveau `ProjectTemplate` qui le référence — comportement historique inchangé). La branche "écraser" ajoutée ici ne fait QUE mettre à jour le `ResourceTemplate` existant et ne crée **aucun** `ProjectTemplate` — cohérent avec le fait qu'on édite ici un modèle de Tâches autonome (catégorie "Tâches" de Modèles), pas un modèle Projet composite.

- [ ] **Step 1:** Modifier la signature de `SaveAsTemplateModal` (lignes 1566-1570) :
  ```ts
  function SaveAsTemplateModal({ projectName, sections, originTasksTemplate, onClose }: {
    projectName: string;
    sections: SectionData[];
    originTasksTemplate?: ResourceTemplate;
    onClose: () => void;
  }) {
  ```

- [ ] **Step 2:** Préremplir `name` depuis `originTasksTemplate` quand présent (chercher l'initialisation `useState` du nom dans ce composant, juste après la signature) :
  ```ts
  const [name, setName] = useState(originTasksTemplate?.name ?? projectName);
  ```
  (`description`/`color`/`tags` gardent leur initialisation actuelle — `originTasksTemplate` n'a pas d'équivalent direct pour tous ces champs côté `ResourceTemplate` type `tasks`, pas besoin de les préremplir différemment.)

- [ ] **Step 3:** Dans `handleSave` (lignes 1594-1630), brancher sur `originTasksTemplate` avant la construction actuelle :
  ```ts
  const handleSave = () => {
    if (!name.trim()) return;
    const createdAt = new Date().toISOString().split('T')[0];

    if (originTasksTemplate) {
      const updatedTasksTpl: ResourceTemplate = {
        ...originTasksTemplate,
        name: name.trim(),
        sections: sections.map(s => ({
          label: s.label,
          tasks: s.tasks.map(convertTask),
        })),
      };
      const existing = loadCustomResourceTemplates();
      saveCustomResourceTemplates(existing.map(t2 => t2.id === updatedTasksTpl.id ? updatedTasksTpl : t2));
      setSaved(true);
      setTimeout(onClose, 1400);
      return;
    }

    const tasksTpl: ResourceTemplate = {
      id: `tasks-${Date.now()}`,
      type: 'tasks',
      name: `Tâches — ${name.trim()}`,
      description: '',
      color,
      icon: 'list-checks',
      tags: [],
      builtIn: false,
      createdAt,
      sections: sections.map(s => ({
        label: s.label,
        tasks: s.tasks.map(convertTask),
      })),
    };
    const existingResTpls = loadCustomResourceTemplates();
    saveCustomResourceTemplates([...existingResTpls, tasksTpl]);
    const tpl: ProjectTemplate = {
      id: `tpl-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      color,
      icon: 'folder',
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      tasksTemplateId: tasksTpl.id,
      builtIn: false,
      createdAt,
    };
    const existing = loadCustomTemplates();
    saveCustomTemplates([...existing, tpl]);
    setSaved(true);
    setTimeout(onClose, 1400);
  };
  ```
  (Le littéral `tpl` perd `resources: []`, cohérent avec la Task 2.)

- [ ] **Step 4:** Dans le composant principal de `Travail.tsx`, calculer `originTasksTemplate` et le passer au modal. Là où `project` est résolu (ligne 1820) et où `<SaveAsTemplateModal>` est instancié (via `saveTemplateOpen`, cf. le rendu autour de la `TemplateMenuButton`), ajouter :
  ```ts
  const originTasksTemplate = project.draftOriginTemplateId
    ? loadAllResourceTemplates().find(t2 => t2.id === project.draftOriginTemplateId && t2.type === 'tasks')
    : undefined;
  ```
  puis passer `originTasksTemplate={originTasksTemplate}` en prop à `<SaveAsTemplateModal>`.

- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 6:** Vérifier en direct : ouvrir un modèle de Tâches existant en édition (Task 3), modifier une section, "Modèles" → "Enregistrer comme modèle" → prérempli avec le nom du modèle d'origine ; sauvegarder ; retourner dans Modèles → catégorie Tâches → le même modèle reflète le changement, et **aucun** nouveau modèle Projet composite n'est apparu dans la catégorie "Projets". Vérifier qu'un vrai projet garde le comportement actuel inchangé (crée un `ResourceTemplate` Tâches + un `ProjectTemplate`).

- [ ] **Step 7:** Commit:
  ```bash
  git add app/src/screens/Travail.tsx
  git commit -m "feat(tasks): overwrite the origin Tâches template when saving from a draft-project edit session"
  ```

---

### Task 7: `TravailOverview.tsx` — écraser le modèle d'Aperçu d'origine en mode brouillon

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes: `project.draftOriginTemplateId` (Task 1), `loadAllResourceTemplates` (déjà importé).
- `SaveOverviewTemplateModal` gagne une prop optionnelle `originTemplate?: ResourceTemplate`.

- [ ] **Step 1:** Modifier la signature de `SaveOverviewTemplateModal` (lignes 162-166) :
  ```ts
  function SaveOverviewTemplateModal({ projectName, customSections, originTemplate, onClose }: {
    projectName: string;
    customSections: CustomOverviewSection[];
    originTemplate?: ResourceTemplate;
    onClose: () => void;
  }) {
  ```

- [ ] **Step 2:** Préremplir depuis `originTemplate` quand présent :
  ```ts
  const [name, setName] = useState(originTemplate?.name ?? projectName);
  const [description, setDescription] = useState(originTemplate?.description ?? '');
  const [color, setColor] = useState(originTemplate?.color ?? OVERVIEW_TEMPLATE_COLORS[0]);
  const [tags, setTags] = useState(originTemplate?.tags?.join(', ') ?? '');
  ```

- [ ] **Step 3:** Dans `handleSave`, écraser au lieu de créer quand `originTemplate` est présent :
  ```ts
  const handleSave = () => {
    if (!name.trim()) return;
    const tpl: ResourceTemplate = {
      id: originTemplate?.id ?? `res-${Date.now()}`,
      type: 'overview',
      name: name.trim(),
      description: description.trim(),
      color,
      icon: 'layout-grid',
      tags: tags.split(',').map(x => x.trim()).filter(Boolean),
      builtIn: false,
      createdAt: originTemplate?.createdAt ?? new Date().toISOString().split('T')[0],
      overviewSections: reusableSections,
    };
    const existing = loadCustomResourceTemplates();
    const updated = originTemplate
      ? existing.map(t2 => t2.id === tpl.id ? tpl : t2)
      : [...existing, tpl];
    saveCustomResourceTemplates(updated);
    setSaved(true);
    setTimeout(onClose, 1400);
  };
  ```

- [ ] **Step 4:** Dans le composant `TravailOverview()`, calculer `originTemplate` et le passer au modal. Là où `project` est résolu (ligne 274) et où `<SaveOverviewTemplateModal>` est rendu (gated par `saveOverviewTemplateModalOpen`), ajouter :
  ```ts
  const originTemplate = project.draftOriginTemplateId
    ? loadAllResourceTemplates().find(t2 => t2.id === project.draftOriginTemplateId && t2.type === 'overview')
    : undefined;
  ```
  puis passer `originTemplate={originTemplate}` en prop à `<SaveOverviewTemplateModal>`.

- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 6:** Vérifier en direct : ouvrir un modèle d'Aperçu existant en édition (Task 3), ajouter/modifier une section, "Modèles" → "Enregistrer comme modèle" → prérempli, sauvegarder → le même modèle (catégorie Aperçu de Modèles) reflète le changement, sans doublon. Vérifier que le comportement "Charger un modèle" existant sur un vrai projet (préservation de Vision, `confirm()`, `updateProject(..., {overviewTemplateId})`) reste inchangé — ce chantier ne touche pas `applyTemplateById`.

- [ ] **Step 7:** Commit:
  ```bash
  git add app/src/screens/TravailOverview.tsx
  git commit -m "feat(overview): overwrite the origin Aperçu template when saving from a draft-project edit session"
  ```

---

## Self-Review

- **Couverture spec :** brouillon invisible + vrais écrans (Task 1/3/4), une seule interface par domaine au lieu de deux (Task 3 retire les anciens chemins d'édition pour file/tasks/overview), ressources-modèles utilisables "gratuitement" dans un modèle de Fichiers (conséquence directe de la Task 3 — l'écran Fichiers sait déjà créer une ressource dans un dossier, aucun code supplémentaire nécessaire), suppression de l'onglet Ressources mort (Task 2), écraser au lieu de dupliquer en sauvegardant un modèle édité (Tasks 5/6/7), nettoyage automatique du brouillon en quittant (Task 4) — tout couvert.
- **Ordre des dépendances :** Task 1 est un prérequis strict pour 3/4/5/6/7. Task 2 est indépendante de tout le reste (peut se faire avant ou après). Task 3 dépend de Task 1. Task 4 dépend de Task 1. Tasks 5/6/7 dépendent de Task 1 et bénéficient de Task 3 pour être testables de bout en bout, mais leur code ne dépend pas techniquement de Task 3 (elles lisent juste `project.draftOriginTemplateId`, peu importe qui l'a posé).
- **Risque identifié en recherche et traité explicitement :** `findProject` était défini comme `getProjects().find(...)` — filtrer `getProjects()` sans séparer la résolution par id aurait cassé silencieusement l'édition de brouillon (retour sur un projet aléatoire via le pattern `findProject(id) ?? getProjects()[0]!` déjà présent dans `Travail.tsx`/`TravailOverview.tsx`/`Portail.tsx`). Réglé par `getAllProjectsUnfiltered()` en Task 1, Step 4.
- **Aucune nouvelle table Supabase** — une migration `ALTER TABLE` sur `projects` (Task 1, manuelle, comme toute migration de ce projet).
