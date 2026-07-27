# Modèle "Projet" composite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraire la structure de tâches (`sections`) de `ProjectTemplate` vers un nouveau type de modèle réutilisable `'tasks'` (même traitement que `'file'`/`'overview'`), pour que `ProjectTemplate` devienne un pur assembleur composite référençant Tâches + Fichiers + Aperçu.

**Architecture:** Voir `docs/superpowers/specs/2026-07-27-composite-project-template-design.md` (design approuvé). Réutilise exactement le pattern déjà en place pour `ResourceTemplateType: 'overview'` (chantier précédent, commits 5f4a554/de7efaa/3509dd0/7cd3ce9) : nav générique, `itemCount`, `resActive`, `saveCopy` dual-path, filtre du picker de ressources, migration read-only à la lecture.

**Tech Stack:** React 19 + TypeScript, Vite, Supabase (aucune nouvelle table — `ResourceTemplate`/`ProjectTemplate` restent stockés comme aujourd'hui via `custom_resource_templates`/`custom_project_templates`).

## Global Constraints

- Aucune migration destructive : les `ProjectTemplate` custom déjà sauvegardés avec `sections` embarquées doivent continuer de fonctionner sans action utilisateur (migration à la lecture uniquement, pattern `migrateLegacyVision`).
- `resources: TemplateResource[]` reste embarqué sur `ProjectTemplate` tel quel — hors scope.
- Ne pas renommer `defaultFolderStructureId` — garder le nom existant.
- Label i18n `models.resTypeOverview` = "Aperçu" déjà fait (hors ce plan, ne pas y retoucher).
- `npx tsc --noEmit -p tsconfig.app.json` doit rester à 0 erreur après chaque tâche.

---

### Task 1: Modèle de données — type `'tasks'` + composite `ProjectTemplate`

**Files:**
- Modify: `app/src/data/templates.ts`

**Interfaces:**
- Produces: `ResourceTemplateType` += `'tasks'` ; `ResourceTemplate.sections?: TemplateSection[]` ; `ProjectTemplate.tasksTemplateId?: string` ; `ProjectTemplate.sections` retiré ; `resolveTasksSections(tpl: ProjectTemplate): TemplateSection[]` exporté ; migration read-only dans `loadAllTemplates()`.

- [ ] **Step 1:** Dans `ResourceTemplateType` (ligne ~683), ajouter `'tasks'` :
  ```ts
  export type ResourceTemplateType = 'document' | 'screenplay' | 'video_review' | 'file' | 'moodboard' | 'overview' | 'tasks';
  ```
  Dans `ResourceTemplate` (ligne ~691), ajouter :
  ```ts
  sections?: TemplateSection[]; // uniquement quand type === 'tasks'
  ```

- [ ] **Step 2:** Ajouter à `BUILT_IN_RESOURCE_TEMPLATES` (dans le même fichier) une entrée `type: 'tasks'` par `ProjectTemplate` intégré existant dans `BUILT_IN_TEMPLATES` (5 au total), en copiant leur champ `sections` actuel tel quel. Convention d'id : `res-tasks-<slug>` (ex. `res-tasks-video-sociale` pour `tpl-video-sociale`). Icône `list-checks`, `color` au choix cohérent avec la palette existante, `tags: []`, `builtIn: true`, `createdAt: '2025-01-01'`.

- [ ] **Step 3:** Dans `ProjectTemplate` (ligne ~68), retirer `sections: TemplateSection[];` et ajouter :
  ```ts
  tasksTemplateId?: string; // référence un ResourceTemplate type 'tasks'
  ```
  Mettre à jour chaque entrée de `BUILT_IN_TEMPLATES` : retirer son champ `sections` embarqué, ajouter `tasksTemplateId: 'res-tasks-<slug-correspondant>'`.

- [ ] **Step 4:** Ajouter la fonction exportée :
  ```ts
  export function resolveTasksSections(tpl: ProjectTemplate): TemplateSection[] {
    if (!tpl.tasksTemplateId) return [];
    const rt = loadAllResourceTemplates().find(r => r.id === tpl.tasksTemplateId && r.type === 'tasks');
    return rt?.sections ?? [];
  }
  ```

- [ ] **Step 5:** Migration à la lecture, dans `loadAllTemplates()` (chercher sa définition ligne ~590) : pour chaque `ProjectTemplate` custom (non builtIn) chargé qui a encore un champ `sections` (ancien format, non vide) et pas de `tasksTemplateId`, générer à la volée un `ResourceTemplate` synthétique `{ id: \`tasks-legacy-${tpl.id}\`, type: 'tasks', name: \`Tâches — ${tpl.name}\`, description: '', color: tpl.color, icon: 'list-checks', tags: [], createdAt: tpl.createdAt, sections: tpl.sections }`, l'ajouter à un tableau en mémoire consultable par `loadAllResourceTemplates()` (ex. variable module `_legacyTasksTemplates`, fusionnée dans le retour de `loadAllResourceTemplates()`), et renvoyer le `ProjectTemplate` avec `tasksTemplateId` pointant vers cet id synthétique (`sections` d'origine peut rester ou être retiré du retour, au choix — ne pas le persister). Ne rien écrire tant que l'utilisateur ne resauvegarde pas explicitement.
  Nommer cette fonction `migrateLegacyTasksTemplate` pour cohérence avec `migrateLegacyVision` (`projectContentStore.ts`), appelée depuis `loadAllTemplates()`.

- [ ] **Step 6:** `npx tsc --noEmit -p tsconfig.app.json` dans `app/` → 0 erreur (des erreurs apparaîtront dans `Modeles.tsx`/`ProjectsListView.tsx` pour tout usage de `tpl.sections` — c'est attendu, ces sites seront corrigés dans les tâches suivantes ; lister ces sites dans le rapport pour la tâche 2/3/4 mais ne pas les corriger ici).

- [ ] **Step 7:** Commit :
  ```bash
  git add app/src/data/templates.ts
  git commit -m "feat(templates): extract task sections into a reusable 'tasks' ResourceTemplate"
  ```

---

### Task 2: Catégorie "Tâches" dans Modèles (nav générique)

**Files:**
- Modify: `app/src/screens/Modeles.tsx`

**Interfaces:**
- Consumes: `ResourceTemplateType: 'tasks'`, `ResourceTemplate.sections` (Task 1).
- Produces: catégorie nav "Tâches" fonctionnelle avec le même mécanisme générique que 'overview'/'file' (création, édition, duplication, aperçu, filtre du picker de ressources).

- [ ] **Step 1:** Repérer chaque site qui traite spécialement `tpl.type === 'overview'` dans `Modeles.tsx` (grep `'overview'` dans ce fichier — lignes ~196, 239, 275, 1877, 1960, 2041, 2117, 2469 d'après le chantier précédent) et ajouter un traitement miroir pour `'tasks'` à chacun : itemCount (compter les `ResourceTemplate` de type `'tasks'`), `resActive` (activer l'onglet quand `typeFilter === 'tasks'`), `saveCopy` (dupliquer en préservant `sections`), filtre du picker de ressources liées (exclure `'tasks'` du picker de ressources d'un projet, comme `'file'`/`'overview'` le sont déjà — un modèle Tâches n'est pas une "ressource" attachable), preview (afficher les sections/tâches en lecture seule dans la vue de détail du modèle), et l'éditeur générique de contenu (branche `if (type === 'tasks') content = { sections: ... }` à côté de celle pour `'overview'`).
- [ ] **Step 2:** Ajouter le nav item : `navItem('tasks', 'list-checks', t('models.resTypeTasks'), tasksCount)` à l'endroit où `navItem('overview', ...)` est déclaré (ligne ~2469), avec un `tasksCount` calculé comme `overviewCount` l'est (ligne ~2458).
- [ ] **Step 3:** Ajouter les clés i18n dans `app/src/locales/fr.json` et `en.json` (namespace `models`, à côté de `resTypeOverview`) : `"resTypeTasks": "Tâches"` (fr) / `"resTypeTasks": "Tasks"` (en).
- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur restant lié à ce fichier pour le type `'tasks'` (les erreurs `tpl.sections` sur `ProjectTemplate` de Task 1 Step 6 restent pour Task 3).
- [ ] **Step 5:** Vérifier dans le navigateur (`rush-app`, session démo) : `/modeles` affiche "Tâches" dans le nav avec le bon compte, un modèle Tâches intégré peut être ouvert/dupliqué, ses sections/tâches s'affichent en lecture seule.
- [ ] **Step 6:** Commit :
  ```bash
  git add app/src/screens/Modeles.tsx app/src/locales/fr.json app/src/locales/en.json
  git commit -m "feat(models): add reusable 'Tâches' template category, mirroring Fichiers/Aperçu"
  ```

---

### Task 3: Éditeur de modèle "Projets" devient un assembleur composite

**Files:**
- Modify: `app/src/screens/Modeles.tsx` (le composant qui édite un `ProjectTemplate`, recherché autour de la ligne ~1178, `activeTab: 'overview' | 'tasks' | 'resources'`)

**Interfaces:**
- Consumes: `resolveTasksSections`, `ProjectTemplate.tasksTemplateId` (Task 1), le pattern "Changer de modèle" déjà construit pour l'Aperçu par projet (`TravailOverview.tsx`, bouton "Changer de modèle d'Aperçu").
- Produces: l'onglet "tasks" de cet éditeur n'édite plus directement des sections/tâches inline ; il affiche en lecture seule les sections du `ResourceTemplate` référencé par `tasksTemplateId` (ou un état vide si aucun), avec un bouton "Changer" ouvrant un sélecteur parmi les `ResourceTemplate` de type `'tasks'` (même modal que le picker d'Aperçu dans `TravailOverview.tsx`, adapté à ce contexte).

- [ ] **Step 1:** Localiser où l'éditeur de `ProjectTemplate` lit/édite `tpl.sections` directement (les erreurs de compilation de Task 1 Step 6 pointent ces lignes). Remplacer la lecture par `resolveTasksSections(tpl)` et retirer les contrôles d'édition inline de sections/tâches (ajout/suppression/renommage de section ou de tâche dans ce contexte) — cette édition inline n'a plus de sens puisque les sections vivent maintenant dans un `ResourceTemplate` séparé, éditable via la catégorie "Tâches" (Task 2).
- [ ] **Step 2:** Ajouter un bouton "Changer de structure de tâches" dans l'onglet correspondant, ouvrant un petit modal listant les `ResourceTemplate` de type `'tasks'` (`loadAllResourceTemplates().filter(t => t.type === 'tasks')`) + une option "Aucune" ; la sélection met à jour `tpl.tasksTemplateId` via `saveTpl`/`updateTpl` (le mécanisme de sauvegarde déjà utilisé par cet éditeur pour les autres champs).
- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.
- [ ] **Step 4:** Vérifier dans le navigateur : ouvrir un modèle Projet intégré, l'onglet tâches affiche ses sections (lecture seule) via le lien vers son modèle Tâches ; changer de structure de tâches vers un autre modèle Tâches et vérifier la persistance après rechargement ; créer un projet depuis ce modèle et vérifier que les tâches créées correspondent au modèle Tâches lié.
- [ ] **Step 5:** Commit :
  ```bash
  git add app/src/screens/Modeles.tsx
  git commit -m "feat(models): Project template editor becomes a composite assembler (Tasks/Files/Overview refs)"
  ```

---

### Task 4: Wizard nouveau projet — picker "Structure de tâches"

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx`

**Interfaces:**
- Consumes: `resolveTasksSections`, `ProjectTemplate.tasksTemplateId` (Task 1), le picker existant "structure de fichiers" (`folderStructTplId`, ligne ~89/116/154/179) comme modèle exact à reproduire pour les tâches.
- Produces: un troisième picker "Structure de tâches" dans le wizard, au même endroit que les pickers Fichiers/Aperçu déjà présents (ligne ~89 et suivantes) ; `CreateProjectModal` utilise `resolveTasksSections()` (avec l'override du wizard) au lieu de `tpl.sections`.

- [ ] **Step 1:** Ajouter un état `tasksTplId` mirroring exactement `folderStructTplId` (ligne ~89 : déclaration, ligne ~116 : initialisation depuis `selectedTemplate?.tasksTemplateId`, ligne ~154 : passage à la création du projet, ligne ~179 : résolution finale).
- [ ] **Step 2:** Ajouter le bloc UI du picker "Structure de tâches" à côté de celui de "structure de fichiers" (lignes ~425-450), listant les `ResourceTemplate` de type `'tasks'`.
- [ ] **Step 3:** `CreateProjectModal`/le point de création du projet : remplacer la lecture de `template.sections` (ou équivalent) par le résultat de `resolveTasksSections({ ...template, tasksTemplateId: tasksTplId ?? template.tasksTemplateId })` (ou une fonction équivalente qui accepte l'override ponctuel du wizard, cohérente avec la façon dont `folderStructTplId` surchage déjà `defaultFolderStructureId`).
- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.
- [ ] **Step 5:** Vérifier dans le navigateur : créer un nouveau projet, choisir un modèle Projet, vérifier que le picker "Structure de tâches" apparaît pré-sélectionné sur le bon modèle Tâches, le changer, créer le projet, vérifier dans Tâches que les sections créées correspondent au modèle Tâches choisi (pas celui par défaut).
- [ ] **Step 6:** Commit :
  ```bash
  git add app/src/components/ProjectsListView.tsx
  git commit -m "feat(projects): wizard lets you pick a Tasks structure independently, mirroring Files/Overview"
  ```

---

## Self-Review

- Spec coverage : type `'tasks'` réutilisable (Task 1/2), `ProjectTemplate` composite pur (Task 1/3), résolution des sections partout où `tpl.sections` était lu (Task 1 Step 4, Task 3, Task 4), wizard cohérent sur les 3 pickers (Task 4), migration non destructive (Task 1 Step 5) — tout couvert.
- Aucune tâche ne dépend d'une tâche postérieure. Task 2 et Task 3 dépendent toutes deux de Task 1 mais sont indépendantes entre elles (peuvent être réordonnées, mais Task 3 est plus lisible après Task 2 puisqu'elle réutilise son nav).
- Aucune nouvelle table Supabase, aucune migration SQL requise.
