# Hiérarchie complète de sauvegarde des modèles — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la structure plate de l'écran « Créer un modèle depuis ce projet » par une vraie hiérarchie en cascade (Tâches/Fichiers/Aperçu, chacune avec sous-niveaux), et ajouter la capture/matérialisation réelle des ressources (Documents/Scénario/Moodboard/Revue vidéo) et du contenu Aperçu rempli — actuellement jamais capturés malgré la présence de cases.

**Architecture:** Ce plan **remplace** `docs/superpowers/plans/2026-08-01-template-save-granularity.md` (déjà fusionné sur `master`) — la structure plate à 8 booléens indépendants devient une hiérarchie en cascade. Un nouveau composant `SFCheckbox` réutilisable extrait le style de case déjà utilisé ailleurs dans l'app. `FolderNode` gagne un champ `resources?` optionnel ; `ProjectTemplate` gagne `overviewSectionData?` optionnel — aucune migration nécessaire, les anciens modèles n'ayant simplement pas ces champs (`undefined`, traité comme « rien à matérialiser »). La matérialisation des ressources se fait en un seul endroit partagé (`addFolderTree`, `app/src/data/fileStore.ts`), profitant automatiquement aux 3 sites d'instanciation existants sans les modifier ; la matérialisation du contenu Aperçu doit, elle, être ajoutée individuellement aux 3 sites (chacun appelle déjà `setProjectContent` séparément, à des moments différents du flux).

**Tech Stack:** React 19 + TypeScript, Supabase, pas de tests automatisés — vérification par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) et preview navigateur.

## Global Constraints

- Les 3 racines de la hiérarchie restent toujours « Tâches » / « Fichiers » / « Aperçu » — jamais renommées, correspondent exactement aux 3 onglets réels d'un projet.
- Cocher un élément coche automatiquement tous ses ancêtres. Décocher un élément décoche tous ses descendants (mais pas ses ancêtres — un frère peut rester coché). Pas d'état indéterminé/tiret — booléens simples, cascade appliquée au moment du clic via une chaîne de `setX(...)`.
- Un élément dont un ancêtre est décoché devient visuellement grisé/`disabled`, sans perdre son propre état interne (recocher l'ancêtre restaure l'état précédent des descendants, ne les remet pas à `true` par défaut).
- Seuls les `FileItem` avec `type === 'resource'` (donc `resourceId` défini — Document/Scénario/Moodboard/Revue vidéo) sont capturables sous « Documents ». Les vrais fichiers uploadés bruts (vidéo/PDF/photo/audio sans `resourceId`) ne sont **jamais** capturés, avec ou sans case cochée.
- Cases à cocher : style carré personnalisé de l'app (coins arrondis, bordure/fond `var(--accent)` coché, icône `check`), jamais `<input type="checkbox">` natif.
- Aucune migration de données requise — `FolderNode.resources`/`ProjectTemplate.overviewSectionData` sont optionnels ; les modèles déjà sauvegardés continuent de fonctionner sans ces champs.

---

## File Structure

- **Modifier `app/src/data/templates.ts`** — `FolderNode.resources?`, nouvelle interface `TemplateResourceFile`, `ProjectTemplate.overviewSectionData?`.
- **Créer `app/src/components/ui/SFCheckbox.tsx`** — case à cocher réutilisable, style carré de l'app.
- **Modifier `app/src/components/CreateTemplateFromProjectModal.tsx`** — remplace la structure plate par la hiérarchie en cascade ; ajoute la capture Documents + Contenu.
- **Modifier `app/src/data/fileStore.ts`** — étend `addFolderTree` pour matérialiser `node.resources`.
- **Modifier `app/src/screens/Modeles.tsx`** (2 sites) et `app/src/components/ProjectsListView.tsx` (1 site) — matérialisent `overviewSectionData` en plus de `overviewSections`.

---

### Task 1 : Modèle de données — `FolderNode.resources` + `ProjectTemplate.overviewSectionData`

**Files:**
- Modify: `app/src/data/templates.ts` (interface `FolderNode`, interface `ProjectTemplate`)

**Interfaces:**
- Produces: `export interface TemplateResourceFile { name: string; resourceType: ResourceType; content: unknown; }`, `FolderNode.resources?: TemplateResourceFile[]`, `ProjectTemplate.overviewSectionData?: Record<string, CustomSectionValue>`.

- [ ] **Step 1 : Lire l'état actuel exact**

Lire `app/src/data/templates.ts` en entier autour de `FolderNode` et `ProjectTemplate` avant d'éditer — le rapport de recherche situe `FolderNode` vers la ligne 769 et `ProjectTemplate` lignes 62-80, mais vérifier les numéros exacts dans le fichier réel avant de modifier.

- [ ] **Step 2 : Ajouter `TemplateResourceFile` et étendre `FolderNode`**

Importer `ResourceType` depuis `'../types'` si pas déjà importé dans ce fichier (vérifier les imports existants en haut du fichier — `fileStore.ts` et `resourceStore.ts` l'importent déjà depuis ce même chemin, donc `templates.ts` doit suivre le même chemin d'import). Importer aussi `CustomSectionValue` depuis `'./projectContentStore'` (déjà importé `CustomOverviewSection` depuis ce même module dans ce fichier — ajouter `CustomSectionValue` au même import).

```ts
export interface TemplateResourceFile {
  name: string;
  resourceType: ResourceType;
  content: unknown;
}

export interface FolderNode {
  id: string;
  name: string;
  children?: FolderNode[];
  resources?: TemplateResourceFile[];
}
```

- [ ] **Step 3 : Ajouter `overviewSectionData` à `ProjectTemplate`**

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
  overviewSectionData?: Record<string, CustomSectionValue>;
  // ... champs @deprecated existants inchangés, ne pas les retirer
}
```
(Ajouter uniquement le nouveau champ `overviewSectionData` — ne pas retoucher les autres champs de l'interface, y compris les champs `@deprecated` qui doivent rester tels quels.)

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur (ajouts purement additifs, rien ne consomme encore ces champs).

- [ ] **Step 5 : Commit**

```bash
git add app/src/data/templates.ts
git commit -m "feat(templates): FolderNode.resources et ProjectTemplate.overviewSectionData"
```

---

### Task 2 : Composant `SFCheckbox` réutilisable

**Files:**
- Create: `app/src/components/ui/SFCheckbox.tsx`

**Interfaces:**
- Produces: `export function SFCheckbox({ checked, onChange, disabled, size }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; size?: number }): JSX.Element` — case seule, sans libellé (le libellé reste géré par l'appelant dans son propre `<label>`/`<div>` avec `onClick`).

- [ ] **Step 1 : Créer le composant**

Calqué sur le pattern déjà utilisé dans `app/src/screens/Taches.tsx` (lignes ~986-988, non exporté à cet endroit — ce composant l'extrait pour réutilisation) :

```tsx
import { SFIcon } from './SFIcon';

export function SFCheckbox({ checked, onChange, disabled, size = 16 }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <div
      onClick={disabled ? undefined : () => onChange(!checked)}
      style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        border: `2px solid ${checked ? 'var(--accent)' : 'var(--border-2)'}`,
        background: checked ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {checked && <SFIcon name="check" size={Math.round(size * 0.56)} color="var(--on-accent)" />}
    </div>
  );
}
```

- [ ] **Step 2 : Exporter depuis le barrel `ui`**

Vérifier comment les autres composants `ui/` sont réexportés (chercher `SFButton`/`SFIcon` dans `app/src/components/ui/index.ts` ou équivalent) et ajouter `SFCheckbox` au même endroit, suivant le même pattern d'export.

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 4 : Commit**

```bash
git add app/src/components/ui/SFCheckbox.tsx app/src/components/ui/index.ts
git commit -m "feat(ui): composant SFCheckbox réutilisable (style carré de l'app)"
```

---

### Task 3 : Hiérarchie en cascade — état + rendu

**Files:**
- Modify: `app/src/components/CreateTemplateFromProjectModal.tsx` (state, JSX des cases — PAS `handleSave`, traité en Task 4)

**Interfaces:**
- Consumes: `SFCheckbox` (Task 2).
- Produces: 11 états booléens exposés par leurs noms exacts pour la Task 4 : `includeSections`, `includeTasksInner` (les tâches à l'intérieur des sections — nommé ainsi pour le distinguer de la racine `includeTasks`), `includeSubtasks`, `includeDescription`, `includePriority`, `includeAssignees`, `includeDueDate` (ces 7 sous « Tâches »), `includeFolderStructure`, `includeDocuments` (sous « Fichiers »), `includeModules`, `includeContent` (sous « Aperçu »). Les 3 racines `includeTasks`/`includeFiles`/`includeOverview` sont conservées (déjà présentes).

- [ ] **Step 1 : Lire l'état actuel exact du fichier**

Lire `app/src/components/CreateTemplateFromProjectModal.tsx` en entier (211 lignes rapportées par la recherche préalable) — état actuel : `includeTasks`/`includeFiles`/`includeOverview` (racines) + `includeSubtasks`/`includeDescription`/`includePriority`/`includeAssignees`/`includeDueDate` (plat, sans notion de Sections/Tâches internes). Ce Step ne modifie rien, juste confirmer les numéros de ligne exacts avant les steps suivants.

- [ ] **Step 2 : Remplacer l'état plat par l'état hiérarchique + fonctions de cascade**

Remplacer les 8 `useState` actuels (`includeTasks` à `includeDueDate`) par :

```ts
const [includeTasks, setIncludeTasks] = useState(true);
const [includeSections, setIncludeSections] = useState(true);
const [includeTasksInner, setIncludeTasksInner] = useState(true);
const [includeSubtasks, setIncludeSubtasks] = useState(true);
const [includeDescription, setIncludeDescription] = useState(true);
const [includePriority, setIncludePriority] = useState(true);
const [includeAssignees, setIncludeAssignees] = useState(true);
const [includeDueDate, setIncludeDueDate] = useState(true);

const [includeFiles, setIncludeFiles] = useState(true);
const [includeFolderStructure, setIncludeFolderStructure] = useState(true);
const [includeDocuments, setIncludeDocuments] = useState(true);

const [includeOverview, setIncludeOverview] = useState(true);
const [includeModules, setIncludeModules] = useState(true);
const [includeContent, setIncludeContent] = useState(true);
```

Puis, juste après, les setters « cochants » (cochent l'élément et cascade vers le haut) et « décochants » (décochent l'élément et cascade vers le bas) :

```ts
// Cocher un champ de tâche coche aussi ses ancêtres (Tâches internes → Sections → Tâches racine).
const checkTaskField = (setter: (v: boolean) => void) => {
  setter(true); setIncludeTasksInner(true); setIncludeSections(true); setIncludeTasks(true);
};
const uncheckTasksRoot = () => {
  setIncludeTasks(false); setIncludeSections(false); setIncludeTasksInner(false);
  setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
  setIncludeAssignees(false); setIncludeDueDate(false);
};
const uncheckSections = () => {
  setIncludeSections(false); setIncludeTasksInner(false);
  setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
  setIncludeAssignees(false); setIncludeDueDate(false);
};
const uncheckTasksInner = () => {
  setIncludeTasksInner(false);
  setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
  setIncludeAssignees(false); setIncludeDueDate(false);
};

const checkDocuments = () => { setIncludeDocuments(true); setIncludeFolderStructure(true); setIncludeFiles(true); };
const uncheckFiles = () => { setIncludeFiles(false); setIncludeFolderStructure(false); setIncludeDocuments(false); };
const uncheckFolderStructure = () => { setIncludeFolderStructure(false); setIncludeDocuments(false); };

const checkContent = () => { setIncludeContent(true); setIncludeModules(true); setIncludeOverview(true); };
const uncheckOverview = () => { setIncludeOverview(false); setIncludeModules(false); setIncludeContent(false); };
const uncheckModules = () => { setIncludeModules(false); setIncludeContent(false); };
```

- [ ] **Step 3 : Mettre à jour `checkAll`/`uncheckAll`**

```ts
const checkAll = () => {
  setIncludeTasks(true); setIncludeSections(true); setIncludeTasksInner(true);
  setIncludeSubtasks(true); setIncludeDescription(true); setIncludePriority(true);
  setIncludeAssignees(true); setIncludeDueDate(true);
  setIncludeFiles(true); setIncludeFolderStructure(true); setIncludeDocuments(true);
  setIncludeOverview(true); setIncludeModules(true); setIncludeContent(true);
};
const uncheckAll = () => {
  setIncludeTasks(false); setIncludeSections(false); setIncludeTasksInner(false);
  setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
  setIncludeAssignees(false); setIncludeDueDate(false);
  setIncludeFiles(false); setIncludeFolderStructure(false); setIncludeDocuments(false);
  setIncludeOverview(false); setIncludeModules(false); setIncludeContent(false);
};
```

- [ ] **Step 4 : Remplacer le JSX des cases**

Remplacer entièrement le bloc de cases actuel (celui du chantier précédent : Fichiers/Tâches+5 sous-options/Aperçu avec `<input type="checkbox">`) par la hiérarchie complète, en utilisant `SFCheckbox` pour chaque case et en respectant les niveaux d'indentation (`marginLeft` croissant de 22px par niveau, comme le pattern déjà établi pour Tâches dans le chantier précédent). Chaque ligne suit le même schéma : `<div style={{display:'flex',alignItems:'center',gap:8,padding:'3px 0',cursor:...}}><SFCheckbox .../><span onClick=... style={{fontSize:...}}>{label}</span></div>`, avec l'`onClick` du `SFCheckbox` (et du `<span>` libellé, pour agrandir la zone cliquable) appelant soit le setter simple (`setIncludeX(true)`/pas de cascade nécessaire pour un decochage simple sans enfants), soit `checkX`/`uncheckX` (cascade) selon la position dans la hiérarchie :

```tsx
<div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>

  {/* Tâches (racine) */}
  <Row label={t('projectTemplates.includeTasks')} checked={includeTasks} onToggle={v => v ? setIncludeTasks(true) : uncheckTasksRoot()} />
  <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
    <Row label={t('projectTemplates.includeSections')} checked={includeSections} disabled={!includeTasks}
      onToggle={v => v ? (setIncludeSections(true), setIncludeTasks(true)) : uncheckSections()} />
    <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Row label={t('projectTemplates.includeTasksInner')} checked={includeTasksInner} disabled={!includeSections}
        onToggle={v => v ? (setIncludeTasksInner(true), setIncludeSections(true), setIncludeTasks(true)) : uncheckTasksInner()} />
      <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Row label={t('projectTemplates.includeSubtasks')} checked={includeSubtasks} disabled={!includeTasksInner}
          onToggle={v => v ? checkTaskField(setIncludeSubtasks) : setIncludeSubtasks(false)} />
        <Row label={t('projectTemplates.includeTaskDescription')} checked={includeDescription} disabled={!includeTasksInner}
          onToggle={v => v ? checkTaskField(setIncludeDescription) : setIncludeDescription(false)} />
        <Row label={t('projectTemplates.includePriority')} checked={includePriority} disabled={!includeTasksInner}
          onToggle={v => v ? checkTaskField(setIncludePriority) : setIncludePriority(false)} />
        <Row label={t('projectTemplates.includeAssignees')} checked={includeAssignees} disabled={!includeTasksInner}
          onToggle={v => v ? checkTaskField(setIncludeAssignees) : setIncludeAssignees(false)} />
        <Row label={t('projectTemplates.includeDueDate')} checked={includeDueDate} disabled={!includeTasksInner}
          onToggle={v => v ? checkTaskField(setIncludeDueDate) : setIncludeDueDate(false)} />
      </div>
    </div>
  </div>

  {/* Fichiers (racine) */}
  <Row label={t('projectTemplates.includeFiles')} checked={includeFiles} onToggle={v => v ? setIncludeFiles(true) : uncheckFiles()} style={{ marginTop: 6 }} />
  <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
    <Row label={t('projectTemplates.includeFolderStructure')} checked={includeFolderStructure} disabled={!includeFiles}
      onToggle={v => v ? (setIncludeFolderStructure(true), setIncludeFiles(true)) : uncheckFolderStructure()} />
    <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Row label={t('projectTemplates.includeDocuments')} checked={includeDocuments} disabled={!includeFolderStructure}
        onToggle={v => v ? checkDocuments() : setIncludeDocuments(false)} />
    </div>
  </div>

  {/* Aperçu (racine) */}
  <Row label={t('projectTemplates.includeOverview')} checked={includeOverview} onToggle={v => v ? setIncludeOverview(true) : uncheckOverview()} style={{ marginTop: 6 }} />
  <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
    <Row label={t('projectTemplates.includeModules')} checked={includeModules} disabled={!includeOverview}
      onToggle={v => v ? (setIncludeModules(true), setIncludeOverview(true)) : uncheckModules()} />
    <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Row label={t('projectTemplates.includeContent')} checked={includeContent} disabled={!includeModules}
        onToggle={v => v ? checkContent() : setIncludeContent(false)} />
    </div>
  </div>

  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
    <button onClick={checkAll} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }}>{t('projectTemplates.checkAll')}</button>
    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>·</span>
    <button onClick={uncheckAll} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }}>{t('projectTemplates.uncheckAll')}</button>
  </div>
</div>
```

Ajouter, juste avant le `return` du composant principal (ou en composant local dans le même fichier, en dehors de `CreateTemplateFromProjectModal`), le petit composant `Row` utilisé ci-dessus :

```tsx
function Row({ label, checked, onToggle, disabled, style }: {
  label: string; checked: boolean; onToggle: (v: boolean) => void; disabled?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div
      onClick={disabled ? undefined : () => onToggle(!checked)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, ...style }}
    >
      <SFCheckbox checked={checked} disabled={disabled} onChange={onToggle} size={15} />
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
    </div>
  );
}
```
(`onClick` sur le conteneur ET sur `SFCheckbox` appellent la même fonction — `SFCheckbox` ignore son propre clic si `disabled`, donc pas de double-déclenchement à corriger, juste vérifier que le conteneur ne déclenche pas non plus quand `disabled`.)

Importer `SFCheckbox` depuis `'./ui'` (ou le chemin exact confirmé en Task 2) et `React` si pas déjà importé (pour le type `React.CSSProperties`).

- [ ] **Step 5 : Ajouter les nouvelles clés i18n**

Dans `app/src/locales/fr.json`, sous `projectTemplates` :
```json
"includeSections": "Sections",
"includeTasksInner": "Tâches",
"includeFolderStructure": "Structure de dossiers",
"includeDocuments": "Documents",
"includeModules": "Modules",
"includeContent": "Contenu"
```
Dans `app/src/locales/en.json` :
```json
"includeSections": "Sections",
"includeTasksInner": "Tasks",
"includeFolderStructure": "Folder structure",
"includeDocuments": "Documents",
"includeModules": "Modules",
"includeContent": "Content"
```

- [ ] **Step 6 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : possibles erreurs si `handleSave` (Task 4, pas encore faite) référence encore d'anciens noms d'état retirés (`includeTasks` seul suffisait avant, `handleSave` actuel lit déjà `includeTasks`/`includeFiles`/`includeOverview`/`includeSubtasks` etc. — ces noms restent valides après ce Step puisqu'ils sont conservés, donc 0 erreur attendu ; si une erreur apparaît, elle vient d'un nom mal renommé dans ce Step, pas d'un manque côté Task 4).

- [ ] **Step 7 : Commit**

```bash
git add app/src/components/CreateTemplateFromProjectModal.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(templates): hiérarchie en cascade complète (Tâches/Fichiers/Aperçu) pour l'écran de sauvegarde"
```

---

### Task 4 : Capture — Documents (ressources) et Contenu (Aperçu)

**Files:**
- Modify: `app/src/components/CreateTemplateFromProjectModal.tsx` (`handleSave`)

**Interfaces:**
- Consumes: `includeDocuments`, `includeContent` (Task 3), `TemplateResourceFile` (Task 1).
- Produces: `folderStructure` (dans l'objet `ProjectTemplate` sauvegardé) porte désormais `resources` par dossier quand `includeDocuments` est coché ; `overviewSectionData` est peuplé quand `includeContent` est coché.

- [ ] **Step 1 : Importer les fonctions nécessaires**

En haut de `CreateTemplateFromProjectModal.tsx`, ajouter aux imports existants :
```ts
import { getFilesInFolder } from '../data/fileStore';
import { getResourceContent } from '../data/resourceContentStore';
import type { TemplateResourceFile } from '../data/templates';
```
(Vérifier si `getFilesInFolder` a besoin du `projectId` en plus du `folderId` — confirmer sa signature exacte dans `app/src/data/fileStore.ts` avant d'écrire l'appel.)

- [ ] **Step 2 : Écrire une fonction récursive d'enrichissement du dossier avec ses ressources**

`getFolderTreeForProject` (déjà utilisée, importée) retourne un arbre `FolderTreeNodeWithId[]` (`{id, name, children?}`, sans `resources`). Ajouter une fonction locale qui parcourt cet arbre et attache les ressources de chaque dossier :

```ts
function attachResources(nodes: { id: string; name: string; children?: any[] }[], projectId: string): FolderTreeNode[] {
  return nodes.map(node => {
    const filesInFolder = getFilesInFolder(node.id, projectId);
    const resources: TemplateResourceFile[] = filesInFolder
      .filter(f => f.type === 'resource' && f.resourceId)
      .map(f => ({
        name: f.name,
        resourceType: f.resourceType!,
        content: getResourceContent(f.resourceId!),
      }));
    return {
      id: node.id,
      name: node.name,
      children: node.children ? attachResources(node.children, projectId) : undefined,
      resources: resources.length ? resources : undefined,
    };
  });
}
```
(Adapter le type de retour exact `FolderTreeNode`/`FolderNode` selon ce que `folderStructure` attend réellement sur `ProjectTemplate` — vérifier dans `templates.ts`, Task 1, que le type est bien compatible ; `FolderTreeNodeWithId` n'a pas de `resources`, donc le type de paramètre `nodes` ci-dessus doit accepter cette forme en entrée tout en produisant `FolderNode[]` en sortie.)

- [ ] **Step 3 : Modifier la construction de `folderStructure` dans `handleSave`**

Remplacer la ligne actuelle :
```ts
const folderStructure = includeFiles ? getFolderTreeForProject(project.id) : undefined;
```
par :
```ts
const rawFolderTree = includeFolderStructure ? getFolderTreeForProject(project.id) : undefined;
const folderStructure = rawFolderTree
  ? (includeDocuments ? attachResources(rawFolderTree, project.id) : rawFolderTree.map(n => ({ id: n.id, name: n.name, children: n.children })))
  : undefined;
```
(Note : la condition passe de `includeFiles` à `includeFolderStructure`, le nouveau nom d'état introduit en Task 3 — `includeFiles` reste la racine mais ne porte plus directement la logique de capture, c'est `includeFolderStructure`, son enfant, qui la porte, cohérent avec la cascade « cocher Fichiers seul, sans son enfant, ne capture rien ».)

- [ ] **Step 4 : Ajouter la capture de `overviewSectionData`**

Après la ligne existante `const overviewSections = includeOverview ? getProjectContent(project.id).customSections : undefined;`, remplacer `includeOverview` par `includeModules` (même raisonnement que Step 3 — c'est l'enfant qui porte la capture réelle) et ajouter :
```ts
const overviewSections = includeModules ? getProjectContent(project.id).customSections : undefined;
const overviewSectionData = includeContent ? getProjectContent(project.id).customSectionData : undefined;
```
Ajouter `overviewSectionData` à l'objet `ProjectTemplate` construit plus bas dans `handleSave` (à côté de `overviewSections` déjà présent dans cet objet).

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/CreateTemplateFromProjectModal.tsx
git commit -m "feat(templates): capture les ressources (Documents) et le contenu Aperçu rempli"
```

---

### Task 5 : Matérialisation des ressources — `addFolderTree`

**Files:**
- Modify: `app/src/data/fileStore.ts` (`addFolderTree`, `FolderTreeNode`)

**Interfaces:**
- Consumes: `TemplateResourceFile` (Task 1), `addResource` (`app/src/data/resourceStore.ts`), `setResourceContent` (`app/src/data/resourceContentStore.ts`), `addFile` (déjà dans ce fichier).
- Produces: `addFolderTree` accepte maintenant des noeuds avec `resources?: TemplateResourceFile[]` et les matérialise.

- [ ] **Step 1 : Lire l'état actuel exact d'`addFolderTree`**

Lire `app/src/data/fileStore.ts` en entier autour d'`addFolderTree` (rapporté vers les lignes 299-332) avant d'éditer — noter précisément comment `walk()` génère les ids de dossier et comment la fonction bascule démo/Supabase.

- [ ] **Step 2 : Étendre `FolderTreeNode` avec `resources?`**

```ts
export interface FolderTreeNode { id?: string; name: string; children?: FolderTreeNode[]; resources?: TemplateResourceFile[] }
```
Importer `TemplateResourceFile` depuis `'./templates'` en haut du fichier (vérifier qu'il n'y a pas de dépendance circulaire — `templates.ts` importe-t-il déjà quelque chose de `fileStore.ts` ? Si oui, importer uniquement le type avec `import type { TemplateResourceFile } from './templates';` pour éviter tout problème d'exécution, un import de type pur n'a aucun effet de bord).

- [ ] **Step 3 : Ajouter la logique de matérialisation des ressources dans `walk`**

Dans la fonction `walk` existante, à l'endroit où chaque `FileFolder` est ajouté à `additions`, capturer aussi la liste de ressources à créer pour ce dossier une fois son id connu :

```ts
const resourceAdditions: { folderId: string; resources: TemplateResourceFile[] }[] = [];
const walk = (list: FolderTreeNode[], parent: string | null) => {
  list.forEach(node => {
    const id = `folder-${Date.now()}-${seq++}`;
    additions.push({ id, name: node.name, parentId: parent, projectId: scope.projectId, clientId: scope.clientId, createdAt });
    if (node.resources?.length) resourceAdditions.push({ folderId: id, resources: node.resources });
    if (node.children && node.children.length) walk(node.children, id);
  });
};
```

- [ ] **Step 4 : Matérialiser les ressources après la création des dossiers**

Après le bloc existant qui insère `additions` (à la fois la branche démo et la branche Supabase, avant leur `return`/fin de fonction async), ajouter, pour chaque entrée de `resourceAdditions` :

```ts
resourceAdditions.forEach(({ folderId, resources }) => {
  resources.forEach(r => {
    const resourceId = `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addResource({
      id: resourceId,
      type: r.resourceType,
      eyebrow: '',
      title: r.name,
      status: 'info',
      statusLabel: '',
      meta: '',
    });
    setResourceContent(resourceId, r.content);
    addFile({
      name: r.name,
      type: 'resource',
      ext: '',
      resourceId,
      resourceType: r.resourceType,
      parentFolderId: folderId,
      projectId: scope.projectId,
      clientId: scope.clientId,
    });
  });
});
```
Importer `addResource` depuis `'./resourceStore'` et `setResourceContent` depuis `'./resourceContentStore'` en haut du fichier — vérifier avant d'écrire l'import que ni `resourceStore.ts` ni `resourceContentStore.ts` n'importent déjà quelque chose de `fileStore.ts` (dépendance circulaire) ; si c'est le cas, utiliser un import dynamique (`await import('./resourceStore')`) comme déjà fait ailleurs dans ce projet pour ce genre de cas (voir `studioStore.ts`'s `provisionNewStudio`).

**Attention à l'ordre asynchrone en session réelle** : dans la branche Supabase de `addFolderTree` (le `void (async () => { ... })()` existant), les dossiers doivent être créés en base (`insert` réussi) AVANT que `addFile` ne référence leur `parentFolderId` — si `addFile` écrit aussi en asynchrone fire-and-forget vers Supabase, ça peut créer une course où le fichier référence un dossier qui n'existe pas encore côté serveur. Lire le corps exact d'`addFile` (déjà dans ce fichier) pour confirmer s'il est lui-même synchrone (optimiste) ou asynchrone, et placer l'appel à `resourceAdditions.forEach(...)` **après** le `await supabase.from('file_folders').insert(...)` réussi dans la branche Supabase, jamais avant.

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/data/fileStore.ts
git commit -m "feat(fileStore): addFolderTree matérialise aussi les ressources capturées dans un modèle"
```

---

### Task 6 : Matérialisation de `overviewSectionData` aux 3 sites d'instanciation

**Files:**
- Modify: `app/src/screens/Modeles.tsx` (2 sites : `handleCreate`, `openProjectTemplateDraft`)
- Modify: `app/src/components/ProjectsListView.tsx` (`create`)

**Interfaces:**
- Consumes: `ProjectTemplate.overviewSectionData` (Task 1).

- [ ] **Step 1 : `Modeles.tsx` — `handleCreate`**

Lire la fonction en entier pour confirmer l'emplacement exact de l'appel `setProjectContent` existant à l'intérieur du `.then()` de `addProject(newProject).then(...)`. Ajouter, à côté de la ligne existante `if (template.overviewSections?.length) setProjectContent(projectId, { customSections: template.overviewSections });`, la fusion de `overviewSectionData` dans le même appel plutôt qu'un appel séparé (un seul appel à `setProjectContent` par instanciation, avec les deux champs si présents) :
```ts
addProject(newProject).then(() => {
  if (template.overviewSections?.length || template.overviewSectionData) {
    setProjectContent(projectId, {
      customSections: template.overviewSections,
      customSectionData: template.overviewSectionData,
    });
  }
});
```
Vérifier que `setProjectContent`/`ProjectContent` acceptent bien `customSections: undefined` sans effacer une valeur existante (peu probable d'être un problème ici puisque c'est un projet fraîchement créé sans contenu Aperçu préexistant, mais confirmer par lecture du type `ProjectContent` que les deux champs sont bien optionnels et qu'un objet partiel est accepté par `setProjectContent`).

- [ ] **Step 2 : `Modeles.tsx` — `openProjectTemplateDraft`**

Même principe, cette fonction appelle `setProjectContent` de façon synchrone (pas dans un `.then()`) juste après la création du brouillon. Fusionner `overviewSectionData` dans ce même appel existant, avec la même condition `tpl.overviewSections?.length || tpl.overviewSectionData` (adapter le nom de variable — cette fonction utilise `tpl`, pas `template`, confirmé par la recherche préalable).

- [ ] **Step 3 : `ProjectsListView.tsx` — `create`**

Même principe — cette fonction utilise `selectedTemplate` (pas `template`/`tpl`) et appelle déjà `setProjectContent` après `await onCreate(newProject)` (le commentaire existant explique pourquoi : contrainte de clé étrangère en session réelle, le projet doit exister avant). Fusionner `overviewSectionData` dans ce même appel existant.

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 5 : Commit**

```bash
git add app/src/screens/Modeles.tsx app/src/components/ProjectsListView.tsx
git commit -m "feat(templates): matérialise overviewSectionData aux 3 sites de création de projet depuis un modèle"
```

---

### Task 7 : Revue finale et vérification bout-en-bout

- [ ] **Step 1 : Typecheck complet**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 2 : Grep de contrôle**

```bash
grep -n "type=\"checkbox\"" app/src/components/CreateTemplateFromProjectModal.tsx
```
Attendu : vide (toutes les cases utilisent maintenant `SFCheckbox`).

- [ ] **Step 3 : Parcours de vérification en preview**

1. Cocher seulement « Échéance » → confirmer que « Tâches » (interne), « Sections » et « Tâches » (racine) se cochent automatiquement, dans cet ordre visuel.
2. Décocher « Sections » avec tout coché → confirmer que « Tâches » (interne) et les 5 champs se décochent, mais Fichiers/Aperçu restent intacts.
3. Cocher « Documents » → confirmer que « Structure de dossiers » et « Fichiers » se cochent.
4. Créer un modèle avec un dossier contenant un vrai Document (ressource, avec du texte tapé dedans) ET un fichier vidéo brut uploadé dans le même dossier, toutes les cases Fichiers cochées → créer un nouveau projet depuis ce modèle → confirmer dans l'onglet Fichiers du nouveau projet que le dossier existe, que le Document existe et s'ouvre avec le même contenu, et que la vidéo brute n'a **pas** été copiée.
5. Remplir un module Vision avec du texte dans un projet, cocher « Contenu » en sauvegardant comme modèle → créer un nouveau projet depuis ce modèle → confirmer dans Aperçu que le texte de Vision est déjà là, pas un module vide.
6. Confirmer visuellement que toutes les cases de l'écran utilisent le style carré de l'app (pas la case native du navigateur).
7. Modèle créé par le chantier précédent (avant cette hiérarchie) : confirmer qu'il s'ouvre toujours normalement en édition — `folderStructure`/`overviewSectionData` absents ne doivent rien casser.

- [ ] **Step 4 : Dispatcher la revue finale de branche**

Utiliser `superpowers:requesting-code-review` sur le modèle le plus capable disponible (chantier avec plusieurs points de risque : cascade UI, écriture Supabase asynchrone dans `addFolderTree`, 3 sites d'instanciation à garder cohérents), puis `superpowers:finishing-a-development-branch`.

## Self-Review

**Couverture :** style de case (Task 2-3), hiérarchie à 3/4 niveaux avec cascade montante-au-cochage/descendante-au-décochage (Task 3), capture Documents limitée aux ressources vraies (Task 4), capture Contenu Aperçu (Task 4), matérialisation des ressources centralisée dans `addFolderTree` profitant aux 3 sites (Task 5), matérialisation `overviewSectionData` individuelle aux 3 sites (Task 6), aucune migration nécessaire pour les anciens modèles (Task 1, champs optionnels, vérifié en Task 7 Step 3.7).

**Cohérence des noms :** `includeFolderStructure`/`includeDocuments`/`includeModules`/`includeContent`/`includeSections`/`includeTasksInner` introduits en Task 3, réutilisés à l'identique dans les conditions de capture en Task 4 — pas de dérive de nom entre les deux tâches puisqu'elles modifient le même fichier en séquence.

**Point de risque le plus élevé** : l'ordre asynchrone dans `addFolderTree` (Task 5, Step 4) entre la création des dossiers et celle des fichiers/ressources qui les référencent — signalé explicitement dans le step correspondant, à vérifier avec le plus grand soin en revue.
