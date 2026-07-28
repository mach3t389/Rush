# Édition des modèles de Ressources via les vrais écrans — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Éditer un modèle de Document/Scénario/Révision vidéo/Moodboard ouvre la vraie page de ressource (`/projets/:id/ressources/:resourceId`) sur une ressource brouillon dans un projet brouillon, avec le même bouton `TemplateMenuButton` (Charger/Enregistrer) que Fichiers/Tâches/Aperçu — au lieu de l'éditeur maison actuel (`TemplateResourceView` dans `Modeles.tsx`).

**Architecture:** Voir `docs/superpowers/specs/2026-07-28-resource-templates-via-live-screens-design.md`. Le mécanisme du projet brouillon (déjà construit) est étendu avec une **ressource brouillon** (créée comme une vraie ressource, via `addResource`+`addFile`, à la racine du projet). Les composants `DocumentView`/`ScreenplayView`/`MoodboardView`/`VideoReviewBody` lisent leur contenu une seule fois au montage depuis `resourceContentStore` (aucun ne se réabonne au store) — donc "Charger un modèle" écrit dans le store puis force un remontage (`key` incrémentée), et "Enregistrer comme modèle" lit simplement `getResourceContent(resourceId)`.

## Global Constraints

- `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) doit rester à 0 erreur après chaque tâche.
- Aucune nouvelle table/colonne Supabase.
- Ne jamais casser le comportement existant sur une **vraie** ressource (pas de brouillon) — tout nouveau code est gated par `project.isTemplateDraft`.
- `documentSections`/`sceneBlocks` restent la source de vérité pour `document`/`screenplay` (déjà le cas aujourd'hui, `rawHTML`/`rawElements` sont des caches). `moodboardRefs`/`reviewRounds` deviennent enfin réellement utilisés (ils sont vestigiaux aujourd'hui — jamais lus par `MoodboardView`/`VideoReviewBody`).
- Le type `form` (système `FormTemplate` séparé) est hors scope.

---

### Task 1: `removeProject` supprime aussi les ressources du projet (correction générale + prérequis nettoyage brouillon)

**Files:**
- Modify: `app/src/data/projectStore.ts`

**Interfaces:**
- Consumes: `getFiles` (`../data/fileStore`, déjà accessible — vérifier l'import exact), `removeResource` (`../data/resourceStore`, à importer — vérifier sa signature exacte avant d'écrire l'appel, elle doit exister dans `resourceStore.ts` autour de la ligne 159-168 et appeler déjà `removeResourceContent` en interne).

**Contexte du bug :** `removeProject` appelle `deleteAllFilesForProject(id)` qui supprime les lignes `file_folders`/`file_items`, mais ne touche jamais aux tables `resources`/`resource_content`. Résultat : supprimer un projet (brouillon OU réel) laisse fuiter indéfiniment les ressources qui y étaient rattachées. Ce chantier a besoin que la suppression d'un projet brouillon nettoie aussi ses ressources brouillon (sinon elles s'accumulent silencieusement) — la façon la plus sûre de le garantir est de corriger `removeProject` lui-même, ce qui bénéficie aussi à la suppression normale d'un vrai projet.

- [ ] **Step 1:** Dans `app/src/data/projectStore.ts`, avant l'appel à `deleteAllFilesForProject(id)` dans `removeProject` (les `FileItem` doivent encore exister pour retrouver leurs `resourceId` — l'ordre des appels compte), ajouter :
  ```ts
  export function removeProject(id: string): void {
    setSections(id, []);
    deleteEventsForProject(id);
    // Doit tourner AVANT deleteAllFilesForProject : on a besoin des FileItem
    // (type 'resource') encore en place pour retrouver les resourceId à
    // nettoyer — deleteAllFilesForProject les supprime juste après.
    getFiles()
      .filter(f => f.projectId === id && f.type === 'resource' && f.resourceId)
      .forEach(f => removeResource(f.resourceId!));
    deleteAllFilesForProject(id);
    getInvoicesByProject(id).forEach(inv => removeInvoice(inv.id));
    // ... reste de la fonction inchangé
  ```
  Adapter au code réel autour (les lignes exactes ont pu bouger depuis l'écriture de ce plan — chercher la définition actuelle de `removeProject`).

- [ ] **Step 2:** Ajouter les imports nécessaires en haut du fichier : `getFiles` depuis `./fileStore` (vérifier s'il est déjà importé — `deleteAllFilesForProject`/`archiveAllFilesForProject` le sont déjà, `getFiles` peut-être pas) et `removeResource` depuis `./resourceStore` (nouvel import — vérifier que `resourceStore.ts` n'importe pas déjà `projectStore.ts`, pour éviter un import circulaire ; d'après la recherche préalable ce n'est pas le cas).

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 4:** Vérifier en direct (session démo) : créer un projet réel, y ajouter une ressource (n'importe quel type) via Fichiers, supprimer le projet (archiver puis supprimer définitivement, flux existant), confirmer que la ressource n'apparaît plus dans `localStorage.sf_resources` après.

- [ ] **Step 5:** Commit:
  ```bash
  git add app/src/data/projectStore.ts
  git commit -m "fix(projects): removeProject also deletes the project's resources (was leaking resources+content on every project delete)"
  ```

---

### Task 2: Ressource brouillon pour Document et Scénario

**Files:**
- Modify: `app/src/screens/Modeles.tsx`

**Interfaces:**
- Consumes: `addResource` (`../data/resourceStore`, à importer), `addFile` (`../data/fileStore`, déjà importé), `setResourceContent` (`../data/projectContentStore` — non, `../data/resourceContentStore`, à importer), `documentSectionsToHTML`/`sceneBlocksToElements` (déjà définis dans ce fichier, lignes ~134-165).
- Produces : `openTemplateDraft`/`openNewTemplateDraft` gèrent désormais aussi `document`/`screenplay`.

**Contexte :** `document` et `screenplay` sont les deux types dont le contenu "live" a déjà une correspondance établie avec le modèle (`rawHTML`/`sceneBlocks`), via les helpers déjà écrits pour l'ancien éditeur (`TemplateResourceView`). Le contenu persisté par `DocumentView` est `{ html, comments, theme, darkPage, aiMessages }` ; par `ScreenplayView` c'est `{ versions: ScriptVersion[], activeId, props, shots, sceneOrder, comments }` où `ScriptVersion = { id, label, date, elements: ScriptEl[] }`.

- [ ] **Step 1:** Ajouter les imports manquants dans `app/src/screens/Modeles.tsx` :
  ```ts
  import { addResource } from '../data/resourceStore';
  import { setResourceContent } from '../data/resourceContentStore';
  ```

- [ ] **Step 2:** Ajouter une fonction utilitaire (par exemple juste avant `openTemplateDraft`) qui crée la ressource brouillon à la racine du projet :
  ```ts
  function createDraftResource(draftId: string, type: ResourceType, title: string): string {
    const resourceId = `res-draft-${Date.now()}`;
    addResource({
      id: resourceId,
      type,
      eyebrow: type.toUpperCase(),
      title,
      status: 'info',
      statusLabel: 'En cours',
      meta: '',
    });
    addFile({ name: title, type: 'resource', ext: 'res', parentFolderId: undefined, projectId: draftId, resourceId, resourceType: type });
    return resourceId;
  }
  ```
  (Mirroir exact de `handleCreateResource` dans `FichiersGlobal.tsx:2057-2078`, sans dossier parent — la ressource vit à la racine du projet brouillon.)

- [ ] **Step 3:** Dans `openTemplateDraft`, ajouter une branche pour `document`/`screenplay` (après la branche `overview` existante) :
  ```ts
  } else if (tpl.type === 'document' || tpl.type === 'screenplay') {
    const resourceId = createDraftResource(draftId, tpl.type as ResourceType, tpl.name);
    if (tpl.type === 'document') {
      const html = tpl.rawHTML ?? (tpl.documentSections ? documentSectionsToHTML(tpl.documentSections) : '');
      setResourceContent(resourceId, { html });
    } else {
      const elements = tpl.rawElements ? (JSON.parse(tpl.rawElements) as ScriptEl[]) : (tpl.sceneBlocks ? sceneBlocksToElements(tpl.sceneBlocks) : []);
      setResourceContent(resourceId, { versions: [{ id: 'v1', label: 'V1', date: new Date().toISOString().split('T')[0], elements }], activeId: 'v1' });
    }
    navigate(`/projets/${draftId}/ressources/${resourceId}`);
  }
  ```

- [ ] **Step 4:** Dans `openNewTemplateDraft`, élargir la signature (`type: 'file' | 'tasks' | 'overview' | 'document' | 'screenplay'`) et ajouter la branche de navigation correspondante :
  ```ts
  const openNewTemplateDraft = async (type: 'file' | 'tasks' | 'overview' | 'document' | 'screenplay') => {
    let draftId: string;
    try {
      draftId = await createTemplateDraft('Nouveau modèle');
    } catch {
      return;
    }
    if (type === 'file') navigate(`/projets/${draftId}/fichiers`);
    else if (type === 'tasks') navigate(`/projets/${draftId}`);
    else if (type === 'overview') navigate(`/projets/${draftId}/overview`);
    else {
      const resourceId = createDraftResource(draftId, type as ResourceType, 'Nouveau modèle');
      navigate(`/projets/${draftId}/ressources/${resourceId}`);
    }
  };
  ```

- [ ] **Step 5:** Repérer le branchement `onOpen`/`handleNew` qui décide aujourd'hui d'ouvrir `openTemplateDraft`/`openNewTemplateDraft` uniquement pour `file`/`tasks`/`overview` (construit dans le chantier précédent) et l'élargir pour inclure `document`/`screenplay` — ces deux types ne doivent plus ouvrir `TemplateResourceView` (`setTemplateResViewTpl`) ni la branche `resEditorData`/`setResEditorOpen` de `handleNew`.

- [ ] **Step 6:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 7:** Vérifier en direct (session démo) : Modèles → catégorie Document → ouvrir un modèle existant → confirme la navigation vers `/projets/draft-.../ressources/res-draft-...`, le vrai `DocumentView` s'affiche avec le contenu HTML du modèle déjà présent. Répéter pour Scénario (contenu du script déjà présent). Tester aussi "Nouveau modèle" pour les deux types → écran vide.

- [ ] **Step 8:** Commit:
  ```bash
  git add app/src/screens/Modeles.tsx
  git commit -m "feat(templates): edit/create Document/Scénario templates via a draft resource on the real screen"
  ```

---

### Task 3: Ressource brouillon pour Moodboard et Révision vidéo

**Files:**
- Modify: `app/src/screens/Modeles.tsx`

**Interfaces:**
- Consumes: `createDraftResource` (Task 2), `setResourceContent` (déjà importé en Task 2).

**Contexte :** `moodboardRefs`/`reviewRounds` ne sont aujourd'hui lus par **aucun** composant d'affichage réel (`MoodboardView` attend `{ items: MBItem[], arrows, comments }` ; `VideoReviewBody` attend `{ versions: LocalVersion[], activeVersion, comments, tasks, reviewStatus }`) — ils ne servent qu'à un aperçu en lecture seule et à un formulaire séparé, jamais round-trippés par les vrais écrans. Ce chantier les rend enfin vivants, via une conversion simple :
- `MoodboardRef { id, title, note }` → un `MBItem` de type `'postit'` par référence, positionné en grille, `text` = titre + note.
- `ReviewRound { id, label, description }` → une `LocalVersion` par round (`v: round.id`, `label: round.label`) — `description` n'a pas d'équivalent dans `LocalVersion` et est délibérément perdu (aucun champ ne correspond dans le vrai écran ; ne pas inventer un contournement).

- [ ] **Step 1:** Vérifier la valeur exacte du type `ReviewStatus` importé/utilisé par `VideoReview.tsx` (`grep -n "ReviewStatus" app/src/screens/VideoReview.tsx`) avant d'écrire le littéral `reviewStatus` ci-dessous — utiliser une valeur valide de cette union (probablement `'review'`, à confirmer).

- [ ] **Step 2:** Dans `openTemplateDraft` (Modeles.tsx), ajouter une branche pour `moodboard`/`video_review` :
  ```ts
  } else if (tpl.type === 'moodboard' || tpl.type === 'video_review') {
    const resourceId = createDraftResource(draftId, tpl.type as ResourceType, tpl.name);
    if (tpl.type === 'moodboard') {
      const items = (tpl.moodboardRefs ?? []).map((r, i) => ({
        id: r.id, type: 'postit' as const,
        x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 180, w: 200, h: 160,
        text: r.note ? `${r.title}\n${r.note}` : r.title,
        postitColor: '#f9ff00',
      }));
      setResourceContent(resourceId, { items, arrows: [], comments: [] });
    } else {
      const versions = (tpl.reviewRounds ?? []).map(r => ({
        v: r.id, status: 'review' as const, label: r.label,
        date: new Date().toISOString().split('T')[0], author: USERS.lea,
      }));
      setResourceContent(resourceId, {
        versions, activeVersion: versions[0]?.v, comments: [], tasks: [],
        reviewStatus: 'review', // valeur confirmée au Step 1
      });
    }
    navigate(`/projets/${draftId}/ressources/${resourceId}`);
  }
  ```
  (Fusionner avec la branche `document`/`screenplay` de la Task 2 en un seul `else if` couvrant les 4 types, plutôt que deux blocs séparés — les deux tâches touchent la même fonction, la Task 3 doit lire l'état réel du fichier après la Task 2 et étendre la même condition.)

- [ ] **Step 3:** Élargir `openNewTemplateDraft` (signature + branchement) pour inclure `moodboard`/`video_review`, même schéma que la Task 2 Step 4 (créer une ressource brouillon vide, naviguer vers sa route).

- [ ] **Step 4:** Élargir le branchement `onOpen`/`handleNew` (Task 2 Step 5) pour inclure ces deux types également — plus aucun type parmi `document`/`screenplay`/`video_review`/`moodboard` ne doit ouvrir `TemplateResourceView`/`resEditorData` après cette tâche.

- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 6:** Vérifier en direct (session démo) : Modèles → catégorie Moodboard → ouvrir un modèle existant → confirme que les références apparaissent comme des post-its sur le vrai canvas `MoodboardView`. Répéter pour Révision vidéo (versions du modèle visibles dans le sélecteur de version, sans média — zone "glisser pour ajouter" affichée normalement).

- [ ] **Step 7:** Commit:
  ```bash
  git add app/src/screens/Modeles.tsx
  git commit -m "feat(templates): edit/create Moodboard/Révision vidéo templates via a draft resource on the real screen"
  ```

---

### Task 4: Bouton "Modèles" (Charger/Enregistrer) sur la page de ressource, en mode brouillon

**Files:**
- Modify: `app/src/screens/ResourceRouter.tsx`

**Interfaces:**
- Consumes: `TemplateMenuButton` (`../components/TemplateMenuButton`), `findProject` (`../data/projectStore`), `loadAllResourceTemplates`/`saveCustomResourceTemplates`/`loadCustomResourceTemplates` (`../data/templates`), `getResourceContent`/`setResourceContent` (`../data/resourceContentStore`), `sceneBlocksToElements`/`elementsToSceneBlocks`/`documentSectionsToHTML` (actuellement privées à `Modeles.tsx` — les exporter depuis ce fichier, ou les dupliquer localement si l'export casse d'autres imports ; à confirmer en lisant l'état réel du fichier).

**Contexte :** `ResourceRouter` rend `<ProjectHeaderBar projectId={...} />` sans `children` aujourd'hui — aucune action dans l'en-tête d'une ressource. Ce bouton n'apparaît que quand `project.isTemplateDraft` est vrai (jamais sur une vraie ressource). Comme les composants (`DocumentView` etc.) ne relisent jamais le store après montage, "Charger" doit forcer un remontage via une `key` locale à `ResourceRouter`.

- [ ] **Step 1:** Dans `app/src/screens/Modeles.tsx`, exporter `documentSectionsToHTML`, `sceneBlocksToElements`, `elementsToSceneBlocks` (ajouter `export` devant leurs déclarations, lignes ~134-165) — ce sont des fonctions pures déjà utilisées par les Tasks 2/3, aucune autre modification nécessaire.

- [ ] **Step 2:** Dans `app/src/screens/ResourceRouter.tsx`, ajouter l'état de remontage et la logique du bouton :
  ```tsx
  import { useState } from 'react';
  import { TemplateMenuButton } from '../components/TemplateMenuButton';
  import { findProject } from '../data/projectStore';
  import { loadAllResourceTemplates, saveCustomResourceTemplates, loadCustomResourceTemplates } from '../data/templates';
  import type { ResourceTemplate, ResourceTemplateType } from '../data/templates';
  import { getResourceContent, setResourceContent } from '../data/resourceContentStore';
  import { documentSectionsToHTML, sceneBlocksToElements, elementsToSceneBlocks } from './Modeles';

  export function ResourceRouter() {
    const { projectId, resourceId } = useParams();
    const resource = getResources().find(r => r.id === resourceId);
    const project = projectId ? findProject(projectId) : undefined;
    const [reloadTick, setReloadTick] = useState(0);

    const templateType = resource?.type as ResourceTemplateType | undefined;
    const isDraftableType = templateType === 'document' || templateType === 'screenplay' || templateType === 'moodboard' || templateType === 'video_review';

    const handleLoad = (templateId: string) => {
      if (!resourceId || !templateType) return;
      const tpl = loadAllResourceTemplates().find(t2 => t2.id === templateId && t2.type === templateType);
      if (!tpl) return;
      if (!confirm('Remplacer le contenu actuel par ce modèle ?')) return;
      if (templateType === 'document') {
        const html = tpl.rawHTML ?? (tpl.documentSections ? documentSectionsToHTML(tpl.documentSections) : '');
        setResourceContent(resourceId, { html });
      } else if (templateType === 'screenplay') {
        const elements = tpl.rawElements ? JSON.parse(tpl.rawElements) : (tpl.sceneBlocks ? sceneBlocksToElements(tpl.sceneBlocks) : []);
        setResourceContent(resourceId, { versions: [{ id: 'v1', label: 'V1', date: new Date().toISOString().split('T')[0], elements }], activeId: 'v1' });
      } else if (templateType === 'moodboard') {
        const items = (tpl.moodboardRefs ?? []).map((r, i) => ({
          id: r.id, type: 'postit' as const,
          x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 180, w: 200, h: 160,
          text: r.note ? `${r.title}\n${r.note}` : r.title, postitColor: '#f9ff00',
        }));
        setResourceContent(resourceId, { items, arrows: [], comments: [] });
      } else if (templateType === 'video_review') {
        const versions = (tpl.reviewRounds ?? []).map(r => ({ v: r.id, status: 'review' as const, label: r.label, date: new Date().toISOString().split('T')[0], author: undefined }));
        setResourceContent(resourceId, { versions, activeVersion: versions[0]?.v, comments: [], tasks: [], reviewStatus: 'review' });
      }
      setReloadTick(n => n + 1);
    };

    const handleSave = () => {
      if (!resourceId || !templateType || !resource) return;
      const origin = project?.draftOriginTemplateId
        ? loadAllResourceTemplates().find(t2 => t2.id === project.draftOriginTemplateId && t2.type === templateType)
        : undefined;
      let patch: Partial<ResourceTemplate> = {};
      if (templateType === 'document') {
        const c = getResourceContent<{ html?: string }>(resourceId);
        patch = { rawHTML: c?.html ?? '' };
      } else if (templateType === 'screenplay') {
        const c = getResourceContent<{ versions: { id: string; elements: unknown[] }[]; activeId: string }>(resourceId);
        const active = c?.versions.find(v => v.id === c.activeId) ?? c?.versions[0];
        patch = { sceneBlocks: elementsToSceneBlocks((active?.elements as Parameters<typeof elementsToSceneBlocks>[0]) ?? []) };
      } else if (templateType === 'moodboard') {
        const c = getResourceContent<{ items: { id: string; text?: string }[] }>(resourceId);
        patch = { moodboardRefs: (c?.items ?? []).map(it => ({ id: it.id, title: (it.text ?? '').split('\n')[0] ?? '', note: (it.text ?? '').split('\n').slice(1).join('\n') })) };
      } else if (templateType === 'video_review') {
        const c = getResourceContent<{ versions: { v: string; label: string }[] }>(resourceId);
        patch = { reviewRounds: (c?.versions ?? []).map(v => ({ id: v.v, label: v.label, description: '' })) };
      }
      const name = prompt('Nom du modèle', origin?.name ?? resource.title) ?? undefined;
      if (!name) return;
      const tpl: ResourceTemplate = {
        id: origin?.id ?? `res-${Date.now()}`,
        type: templateType,
        name,
        description: origin?.description ?? '',
        color: origin?.color ?? '#6b7280',
        icon: origin?.icon ?? 'file',
        tags: origin?.tags ?? [],
        builtIn: false,
        createdAt: origin?.createdAt ?? new Date().toISOString().split('T')[0],
        ...patch,
      };
      const existing = loadCustomResourceTemplates();
      const updated = origin ? existing.map(t2 => t2.id === tpl.id ? tpl : t2) : [...existing, tpl];
      saveCustomResourceTemplates(updated);
    };

    // ... dispatch existant (video_review/web_review/ResourceDetail) inchangé ...

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ProjectHeaderBar projectId={projectId ?? ''}>
          {project?.isTemplateDraft && isDraftableType && (
            <TemplateMenuButton
              loadOptions={loadAllResourceTemplates().filter(t2 => t2.type === templateType).map(t2 => ({ id: t2.id, name: t2.name, icon: t2.icon }))}
              onLoad={handleLoad}
              onSave={handleSave}
              loadLabel="Charger un modèle"
              saveLabel="Enregistrer comme modèle"
            />
          )}
        </ProjectHeaderBar>
        <div style={{ flex: 1, overflow: 'hidden' }} key={reloadTick}>
          {detail}
        </div>
      </div>
    );
  }
  ```
  **Note pour l'implémenteur :** ce bloc de code est une base de travail, pas un copier-coller garanti sans ajustement — en particulier (a) vérifier que `elementsToSceneBlocks`/`sceneBlocksToElements` acceptent bien les types `ScriptEl`/`SceneBlock` exacts une fois exportés (ajuster les imports de types si besoin), (b) le `prompt()`/`confirm()` natifs sont un choix minimal fonctionnel — si le style de l'app préfère un petit modal cohérent avec `SaveFolderTemplateModal`/`SaveOverviewTemplateModal` des chantiers précédents plutôt qu'un `prompt()` JS brut, l'adapter (mais rester simple : pas besoin de dupliquer entièrement ces modals, un `prompt()` reste acceptable ici vu qu'aucun champ description/couleur/tags n'est réellement mis en avant dans le design retenu), (c) confirmer si `LocalVersion.author` accepte `undefined` ou nécessite une vraie valeur (`USERS.lea` par ex.) en lisant le type réel.

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur.

- [ ] **Step 4:** Vérifier en direct (session démo) : ouvrir un modèle de Document en édition (Task 2), le bouton "Modèles" apparaît dans l'en-tête ; "Charger un modèle" avec un autre modèle Document remplace le contenu visible sans recharger la page ; "Enregistrer comme modèle" écrase le modèle d'origine (vérifier dans Modèles → Document que c'est le même modèle qui a changé, pas un doublon). Répéter au moins une fois pour Scénario ou Moodboard. Vérifier qu'une vraie ressource (pas de brouillon) n'affiche toujours aucun bouton dans son en-tête — régression critique à ne pas introduire.

- [ ] **Step 5:** Commit:
  ```bash
  git add app/src/screens/ResourceRouter.tsx app/src/screens/Modeles.tsx
  git commit -m "feat(resources): add Charger/Enregistrer template button on the draft resource screen"
  ```

---

## Self-Review

- **Couverture spec :** ressource brouillon + vraie route (Tasks 2/3), bouton Modèles Charger/Enregistrer (Task 4), nettoyage sans fuite (Task 1, prérequis), Révision vidéo sans média réel géré nativement (confirmé au design, aucun code spécifique nécessaire côté `VideoReviewBody`) — tout couvert.
- **Ordre des dépendances :** Task 1 est indépendante (peut se faire en premier ou en parallèle conceptuel, mais recommandé en premier pour éviter toute fuite pendant les tests des tâches suivantes). Tasks 2 et 3 modifient la même fonction (`openTemplateDraft`) dans le même fichier — **ne pas dispatcher en parallèle**, Task 3 doit lire l'état réel du fichier après le commit de la Task 2. Task 4 dépend de Task 2 (a minima, pour tester avec un type déjà câblé) mais son code couvre les 4 types d'un coup — dispatcher après Task 3 pour pouvoir tout vérifier en une fois.
- **Risque explicitement noté et traité :** `moodboardRefs`/`reviewRounds` n'étaient round-trippés par aucun composant réel avant ce chantier (vérifié par recherche exhaustive) — la conversion vers/depuis `MBItem`/`LocalVersion` est donc un nouveau mapping, pas une correspondance préexistante à préserver ; les Tasks 3/4 le documentent explicitement plutôt que de prétendre suivre un format déjà établi.
- **Aucune nouvelle table Supabase.**
