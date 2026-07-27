# Bouton "Modèles" unifié — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Remplacer les boutons de modèle incohérents (position + fonction) sur Tâches/Fichiers/Aperçu par un seul composant `TemplateMenuButton` partagé, toujours dans l'en-tête (`ProjectHeaderBar`), offrant "Charger un modèle" + "Enregistrer comme modèle" sur les 3 pages.

**Architecture:** Voir `docs/superpowers/specs/2026-07-27-unified-template-button-design.md`. Réutilise `InlineDropdown` (déjà utilisé dans `TravailOverview.tsx`) pour le sous-menu.

## Global Constraints

- Le bouton doit toujours vivre dans le slot `children` de `<ProjectHeaderBar>` sur les 3 écrans — jamais ailleurs dans la page.
- "Charger" pour Fichiers est **additif** (ne supprime jamais de dossiers/fichiers existants) ; "Charger" pour Tâches et Aperçu **remplace** (avec confirmation utilisateur).
- Ne pas casser les mécanismes de sauvegarde déjà existants (`SaveAsTemplateModal`/`SaveFolderTemplateModal`/leurs handlers) — le composant partagé les enveloppe, il ne les réécrit pas.
- `npx tsc --noEmit -p tsconfig.app.json` doit rester à 0 erreur après chaque tâche.

---

### Task 1: Composant partagé `TemplateMenuButton`

**Files:**
- Create: `app/src/components/TemplateMenuButton.tsx`

**Interfaces:**
- Produces: `TemplateMenuButton({ icon = 'layout-template', loadOptions, onLoad, onSave, loadLabel, saveLabel }: { icon?: string; loadOptions: { id: string; name: string; icon: string }[]; onLoad: (id: string) => void; onSave: () => void; loadLabel: string; saveLabel: string })` — a button that opens an `InlineDropdown` with two rows: "Charger un modèle" (itself expanding to `loadOptions`, or disabled/hidden if `loadOptions` is empty) and "Enregistrer comme modèle" (calls `onSave` directly, closes the menu).

- [ ] **Step 1:** Read `app/src/screens/TravailOverview.tsx`'s `InlineDropdown` usage (imported from `./Travail`) to match its exact API/props/visual style. Read `app/src/screens/Travail.tsx`'s existing "Enregistrer comme modèle" button (`t('board.saveAsTemplateButton')`, icon `layout-template`) for the exact visual style (padding/border/colors) to match.
- [ ] **Step 2:** Build `TemplateMenuButton` as described above. Two-level menu: clicking the button opens a small `InlineDropdown` with "Charger un modèle" (submenu row, opens a second nested list of `loadOptions` on hover/click) and "Enregistrer comme modèle" (direct action). Add i18n keys to `app/src/locales/fr.json`/`en.json` under a shared namespace (reuse `overview` namespace or create a small `templateMenu` namespace — your call, keep consistent): `templateMenuButton` = "Modèles", `templateMenuLoad` = "Charger un modèle", `templateMenuSave` = "Enregistrer comme modèle", `templateMenuNoOptions` = "Aucun modèle disponible".
- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.app.json` → 0 new errors (this is a new unused file until Task 2/3/4 wire it in — that's fine, TS won't error on an unused exported component).
- [ ] **Step 4:** Commit:
  ```bash
  git add app/src/components/TemplateMenuButton.tsx app/src/locales/fr.json app/src/locales/en.json
  git commit -m "feat(templates): add shared TemplateMenuButton (load/save menu)"
  ```

---

### Task 2: Wire into Tâches (`Travail.tsx`)

**Files:**
- Modify: `app/src/screens/Travail.tsx`

**Interfaces:**
- Consumes: `TemplateMenuButton` (Task 1), `setSections` (`../data/taskStore`), `loadAllResourceTemplates` filtered to `type === 'tasks'` (`../data/templates`), the existing `SaveAsTemplateModal`/save logic already in this file (reuse as-is for `onSave`).

- [ ] **Step 1:** Locate the current `t('board.saveAsTemplateButton')` button in `ProjectHeaderBar`'s children slot (icon `layout-template`) — replace it with `<TemplateMenuButton loadOptions={...} onLoad={handleLoadTasksTemplate} onSave={() => setShowSaveAsTemplateModal(true)} loadLabel={t('templateMenuLoad')} saveLabel={t('templateMenuSave')} />` (adapt exact prop/state names to what already exists in this file for opening the save modal).
- [ ] **Step 2:** Implement `handleLoadTasksTemplate(templateId: string)`: find the `ResourceTemplate` (`type: 'tasks'`) by id, `if (!confirm(t('board.confirmLoadTasksTemplate'))) return;`, then `setSections(project.id, tpl.sections ?? [])`. Add the `confirmLoadTasksTemplate` i18n key ("Remplacer la structure de tâches actuelle par ce modèle ? Les tâches actuelles seront perdues." / en equivalent) to both locale files.
- [ ] **Step 3:** `loadOptions` = `loadAllResourceTemplates().filter(t => t.type === 'tasks').map(t => ({ id: t.id, name: t.name, icon: t.icon }))`.
- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.app.json` → 0 errors.
- [ ] **Step 5:** Verify in browser (rush-app, demo session): open a project's Tâches tab, click "Modèles" in the header, confirm both "Charger un modèle"/"Enregistrer comme modèle" appear; load a different Tâches template, confirm the project's sections/tasks are replaced after confirming the dialog; confirm the existing "Enregistrer comme modèle" flow (the pre-existing modal) still works unchanged.
- [ ] **Step 6:** Commit:
  ```bash
  git add app/src/screens/Travail.tsx app/src/locales/fr.json app/src/locales/en.json
  git commit -m "feat(tasks): unify Tâches template button (load + save) in the header"
  ```

---

### Task 3: Wire into Fichiers (`Fichiers.tsx`)

**Files:**
- Modify: `app/src/screens/Fichiers.tsx`

**Interfaces:**
- Consumes: `TemplateMenuButton` (Task 1), `addFolderTree` (`../data/fileStore`), `loadAllResourceTemplates` filtered to `type === 'file'`, existing `SaveFolderTemplateModal`/save logic in this file (reuse as-is for `onSave`).

- [ ] **Step 1:** Locate the current `t('board.saveAsTemplateButton')` button in `ProjectHeaderBar`'s children slot in this file — replace with `<TemplateMenuButton ... />` following the same pattern as Task 2.
- [ ] **Step 2:** Implement `handleLoadFileTemplate(templateId: string)`: find the `ResourceTemplate` (`type: 'file'`) by id, then call `addFolderTree(project.id, tpl.folderStructure ?? [])` (check the exact signature of `addFolderTree` in `fileStore.ts` first — adapt call accordingly). **No confirmation dialog** — this is additive, per the design spec (a file-structure template only adds folders, never deletes existing ones).
- [ ] **Step 3:** `loadOptions` = `loadAllResourceTemplates().filter(t => t.type === 'file').map(...)`.
- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.app.json` → 0 errors.
- [ ] **Step 5:** Verify in browser: open a project's Fichiers tab (already has some files/folders), click "Modèles" → "Charger un modèle", pick a Fichiers template, confirm its folders get ADDED without removing/touching any existing folder or file; confirm "Enregistrer comme modèle" still works unchanged.
- [ ] **Step 6:** Commit:
  ```bash
  git add app/src/screens/Fichiers.tsx app/src/locales/fr.json app/src/locales/en.json
  git commit -m "feat(files): unify Fichiers template button (additive load + save) in the header"
  ```

---

### Task 4: Wire into Aperçu (`TravailOverview.tsx`)

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes: `TemplateMenuButton` (Task 1), the existing `applyTemplate`/template-picker logic already in this file (reuse for `onLoad`), a NEW save-as-template flow to build (Aperçu never had one).

- [ ] **Step 1:** Move the "Changer de modèle d'Aperçu" control from the bottom-of-content row (near "Ajouter une section") into `<ProjectHeaderBar>`'s children slot, replaced by `<TemplateMenuButton loadOptions={...} onLoad={applyTemplateById} onSave={openSaveOverviewTemplateModal} ... />`. Keep "Ajouter une section" where it is (bottom, unrelated to this button) — only the template-swap control moves.
- [ ] **Step 2:** Adapt the existing `applyTemplate(tpl: ResourceTemplate | null)` (confirm dialog + Vision-preserving logic, already correct) into `applyTemplateById(id: string | null)` that resolves the `ResourceTemplate` by id first, then calls the existing logic unchanged.
- [ ] **Step 3:** Build a NEW "Enregistrer comme modèle" flow for Aperçu (didn't exist before): a small modal (name + optional description, mirroring the existing `SaveAsTemplateModal`/`SaveFolderTemplateModal` visual pattern from Travail.tsx/Fichiers.tsx) that on save creates a new `ResourceTemplate` (`type: 'overview'`, `overviewSections: customSections.filter(s => s.id !== VISION_SECTION_ID)` — exclude the locked Vision section, since it's not a reusable template section, it's unique to every project) via `saveCustomResourceTemplates([...loadCustomResourceTemplates(), newTpl])` (check exact helper names in `templates.ts`, mirror Task 7's pattern from the earlier Overview-templates chantier).
- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.app.json` → 0 errors.
- [ ] **Step 5:** Verify in browser: the template button now appears in the Aperçu header (not at the bottom); loading a different Aperçu template still preserves Vision (regression check on the existing, already-shipped behavior); saving the current custom sections as a new template creates it correctly (check it shows up in Modèles → Aperçu afterward, WITHOUT a Vision section in it).
- [ ] **Step 6:** Commit:
  ```bash
  git add app/src/screens/TravailOverview.tsx app/src/locales/fr.json app/src/locales/en.json
  git commit -m "feat(overview): unify Aperçu template button (load + new save) in the header"
  ```

---

## Self-Review

- Spec coverage: bouton unique dans l'en-tête sur les 3 pages (Task 2/3/4), fonction Charger+Enregistrer sur chacune (idem), sémantique additive vs destructive respectée par type (Task 2 destructif+confirm, Task 3 additif sans confirm, Task 4 déjà correct/inchangé pour Vision) — tout couvert.
- Task 1 est un prérequis strict pour 2/3/4 ; 2/3/4 sont indépendantes entre elles.
- Aucune nouvelle table Supabase.
