# Hiérarchie complète de sauvegarde d'un modèle de projet — design

## Contexte

Suite au chantier de granularité (Tâches avec 5 sous-options), plusieurs échanges ont fait évoluer le design vers une vraie hiérarchie à cases à cocher en cascade, calquée sur « Copy Settings » de Lightroom, couvrant les 3 racines (Tâches/Fichiers/Aperçu) au lieu d'une seule. Ce document remplace la structure plate décrite dans `2026-08-01-template-save-granularity-design.md` par la hiérarchie finale.

## Décisions actées

### 1. Les 3 racines restent fixes : Tâches / Fichiers / Aperçu

Elles correspondent exactement aux 3 onglets réels d'un projet — ne jamais les renommer, même pour clarifier un sous-comportement. Toute clarification se fait via des sous-cases ou un texte explicatif sous une racine, jamais en renommant la racine elle-même.

### 2. Hiérarchie complète

```
☐ Tâches
   ☐ Sections
      ☐ Tâches
         ☐ Sous-tâches
         ☐ Description
         ☐ Priorité
         ☐ Assignés
         ☐ Échéance
☐ Fichiers
   ☐ Structure de dossiers
      ☐ Documents
☐ Aperçu
   ☐ Modules
      ☐ Contenu
```

- Sous « Tâches » : « Sections » = les libellés de section ; « Tâches » (2ᵉ occurrence, à l'intérieur de Sections) = les tâches elles-mêmes plutôt que des sections vides ; les 5 champs = propriétés individuelles d'une tâche (déjà spécifiées dans le chantier précédent, inchangées).
- Sous « Fichiers » : « Structure de dossiers » = les dossiers/sous-dossiers (comme aujourd'hui) ; « Documents » = les **ressources** (Document/Scénario/Moodboard/Revue vidéo) qui vivent dans ces dossiers, avec leur contenu réel. **Exclut explicitement les vrais fichiers uploadés** (vidéo/PDF/photo bruts) — trop lourd à dupliquer, rarement voulu d'un projet à l'autre (décision actée en discussion).
- Sous « Aperçu » : « Modules » = quels blocs existent (comme aujourd'hui — structure/titres seulement) ; « Contenu » = les valeurs réellement tapées/cochées dans ces modules (`customSectionData`, jamais lu aujourd'hui par l'écran de sauvegarde).

### 3. Comportement de cascade (façon Lightroom)

- **Cocher un élément coche automatiquement tous ses ancêtres.** Cocher « Échéance » coche aussi « Tâches » (interne), « Sections », « Tâches » (racine). Cocher « Documents » coche aussi « Structure de dossiers » et « Fichiers ». Cocher « Contenu » coche aussi « Modules » et « Aperçu ».
- **Décocher un élément ne touche PAS ses ancêtres** (un frère peut rester coché) mais **décoche tous ses descendants** (ça n'a pas de sens de garder « Contenu » sans « Modules », par exemple).
- Pas d'état « indéterminé »/tiret — chaque case reste un booléen simple `true`/`false`, l'effet de cascade se limite à des appels `setX(true)`/`setX(false)` en chaîne au moment du clic, pas un calcul dérivé permanent.
- Une case dont un ancêtre est décoché devient visuellement grisée/`disabled` (état interne conservé, pas remis à `true` par défaut si on recoche l'ancêtre plus tard) — comportement déjà établi pour Tâches/sous-options dans le chantier précédent, maintenant généralisé à toute la hiérarchie.

### 4. Style visuel des cases à cocher

Remplacer `<input type="checkbox">` (case native du navigateur, seul endroit de toute l'app à utiliser ce style) par le pattern de case personnalisée déjà utilisé partout ailleurs (ex. `Taches.tsx:986-988`) :
```tsx
<div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? 'var(--accent)' : 'var(--border-2)'}`, background: checked ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
  {checked && <SFIcon name="check" size={9} color="var(--on-accent)" />}
</div>
```

## Modèle de données — nouveauté : capturer des ressources dans la structure de dossiers

### `FolderNode` (`app/src/data/templates.ts`)

```ts
export interface FolderNode {
  id: string;
  name: string;
  children?: FolderNode[];
  resources?: TemplateResourceFile[];   // NOUVEAU
}

export interface TemplateResourceFile {
  name: string;                // FileItem.name (nom affiché dans Fichiers)
  resourceType: ResourceType;  // 'document' | 'screenplay' | 'moodboard' | 'video_review' (types "ressource" existants)
  content: unknown;            // contenu brut, copié tel quel depuis getResourceContent(resourceId)
}
```

Seuls les `FileItem` avec `type === 'resource'` (donc `resourceId` défini) sont capturables — les fichiers uploadés bruts (`type` vidéo/pdf/photo/audio sans `resourceId`) ne le sont jamais, avec ou sans case cochée.

### Capture (`CreateTemplateFromProjectModal.tsx`)

Quand « Documents » est coché : pour chaque dossier du projet, lister ses `FileItem` via `getFilesInFolder(folderId, projectId)`, filtrer `type === 'resource'`, et pour chacun lire `getResourceContent(fileItem.resourceId)` — attacher le résultat au `FolderNode` correspondant sous `resources`.

### Matérialisation — étendre `addFolderTree` (`app/src/data/fileStore.ts`), pas les 3 sites d'instanciation

Les 3 endroits qui créent un projet depuis un modèle (`Modeles.tsx` ×2, `ProjectsListView.tsx`) appellent déjà tous `addFolderTree(template.folderStructure, { projectId })` sans modification nécessaire de leur côté — c'est `addFolderTree` lui-même qui doit, en plus de créer chaque `FileFolder`, créer un `Resource` (`addResource`) + son contenu (`setResourceContent`) + le `FileItem` correspondant (`addFile`, avec `type: 'resource'`, `resourceId` pointant vers le nouveau `Resource`, `parentFolderId` = l'id du dossier fraîchement créé) pour chaque entrée de `node.resources`.

C'est le même principe que pour le contenu Aperçu : une seule fonction partagée profite aux 3 sites d'instanciation sans les toucher individuellement.

## Vérification

- Cocher seulement « Échéance » → confirmer que « Tâches » (interne), « Sections » et « Tâches » (racine) se cochent automatiquement.
- Décocher « Sections » avec tout le reste coché → confirmer que « Tâches » (interne) et les 5 champs se décochent aussi, mais que Fichiers/Aperçu restent intacts.
- Cocher « Documents » → confirmer que « Structure de dossiers » et « Fichiers » se cochent.
- Créer un modèle avec un dossier contenant un Document (ressource) et un fichier vidéo brut uploadé, cases Fichiers/Structure de dossiers/Documents toutes cochées → créer un projet depuis ce modèle → confirmer que le dossier existe, que le Document existe avec son contenu, et que la vidéo brute n'a PAS été copiée.
- Cocher « Contenu » (Aperçu) → créer un modèle depuis un projet avec un module Vision rempli → créer un nouveau projet depuis ce modèle → confirmer que le texte de Vision est déjà là, pas juste le module vide.
- Cases à cocher : confirmer visuellement qu'elles utilisent le style carré à coins arrondis de l'app (pas la case native du navigateur) partout dans cet écran.
