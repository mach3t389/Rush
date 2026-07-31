# Page Aperçu en modules — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer la zone centrale de la page Aperçu d'un projet en une liste de modules réordonnables par glisser-déposer, avec 3 nouveaux types de modules (Checklist, Galerie, Liens) et le bloc Livrables client qui rejoint le système au lieu d'être figé.

**Architecture :** `customSections` (déjà la source de vérité pour l'ordre des sections Vision/Texte/Champs) s'étend pour inclure une entrée `deliverables` qui pilote uniquement la *position* du bloc Livrables client — ses données restent dans le store des tâches, inchangées. Le réordonnancement par flèches est remplacé par le mécanisme de glisser-déposer déjà éprouvé dans `Travail.tsx` (réordonnancement des sections de tâches), porté tel quel.

**Tech Stack :** React 19, TypeScript, Vite, i18next, styles inline, Supabase (JSONB via `project_content`).

**Spec :** `docs/superpowers/specs/2026-07-30-apercu-modules-design.md`

## Global Constraints

- **Aucun test automatisé dans ce projet.** N'écris pas de fichiers de test. Vérification par typecheck + navigateur.
- Typecheck : `npx tsc -p tsconfig.app.json --noEmit` depuis `app/`. Le `-p` est **obligatoire**.
- **Jamais de texte utilisateur en dur.** Toute chaîne visible passe par `t('clé')`, ajoutée dans `app/src/locales/fr.json` ET `app/src/locales/en.json`.
- Styles en `style={{}}` inline, pas de Tailwind.
- Travailler directement sur `master` (convention établie du projet, pas de worktree).
- Commit à la fin de chaque tâche, message en français.
- **Vision reste fixe en première position, jamais déplaçable, jamais supprimable** — invariant déjà en place (`customSections[0]` toujours Vision, `locked: true`), ne pas le casser.
- **Le module Livrables client ne peut exister qu'une seule fois par projet** — comme Vision, il n'est pas proposé à l'ajout si une entrée `kind: 'deliverables'` existe déjà dans `customSections`.

## Structure des fichiers

| Fichier | Rôle | Tâche |
|---------|------|-------|
| `app/src/data/projectContentStore.ts` | Types `OverviewSectionKind`, `ChecklistItem`, `GalleryImage`, `CustomSectionValue` ; migration à la lecture | 1 |
| `app/src/screens/TravailOverview.tsx` | Écran principal — déplacement du bloc Livrables client dans la liste unifiée, rendu des 3 nouveaux types, glisser-déposer | 2, 4, 5 |
| `app/src/components/OverviewSectionForm.tsx` | Formulaire de création — 3 nouveaux types sélectionnables | 3 |
| `app/src/locales/fr.json`, `en.json` | Nouvelles clés i18n | 1, 3, 4, 5 |

## Vocabulaire du domaine

- **Module** = terme utilisateur pour ce que le code appelle une **section** (`CustomOverviewSection`). Le renommage UI (« Ajouter une section » → « Ajouter un module ») est purement textuel — le type et les noms de variables restent `section`/`customSections` en interne, pour ne pas provoquer un renommage massif sans valeur.
- **Vision** : section verrouillée (`locked: true`), toujours `customSections[0]`, jamais dans le menu d'ajout.
- **Session démo** (`isDemoSession() === true`) : `localStorage`. **Session réelle** : table Supabase `project_content`.

---

### Task 1: Modèle de données + migration à la lecture

**Files:**
- Modify: `app/src/data/projectContentStore.ts:18-60`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Produces: `OverviewSectionKind` (6 valeurs), `ChecklistItem`, `GalleryImage`, `CustomSectionValue`, `DELIVERABLES_SECTION_ID` constant

**Contexte :** `applyLoadedContent` dans `TravailOverview.tsx:397-408` est le point unique où le contenu persisté est chargé et normalisé (il y insère déjà la section Vision si absente — lignes 400-402). C'est là que la migration du module Livrables client doit s'insérer, par le même principe.

- [ ] **Step 1: Étendre `OverviewSectionKind` et ajouter les types de valeur**

Dans `app/src/data/projectContentStore.ts`, remplacer les lignes 18-33 :

```ts
export type OverviewSectionKind = 'fields' | 'note' | 'deliverables' | 'checklist' | 'gallery' | 'links';

export interface OverviewFieldDef {
  id: string;
  label: string;
  multiline?: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface GalleryImage {
  id: string;
  /** Blob URL en mémoire ; persisté via fileContentStore (même mécanisme que l'import de fichiers réels). */
  dataUrl: string;
  caption: string;
}

export interface CustomOverviewSection {
  id: string;
  kind: OverviewSectionKind;
  title: string;
  icon: string;
  fields?: OverviewFieldDef[]; // uniquement pour kind: 'fields'
  locked?: boolean; // ne peut pas être supprimée dans son ensemble (ex. Vision du projet) — ses champs restent éditables
}

export const VISION_SECTION_ID = 'vision';
export const DELIVERABLES_SECTION_ID = 'deliverables';
```

- [ ] **Step 2: Étendre `customSectionData` pour les 3 nouveaux types**

Toujours dans `app/src/data/projectContentStore.ts`, trouver l'interface `ProjectContent` (ligne 56-60 avant modification) et la remplacer :

```ts
export type CustomSectionValue =
  | string                        // kind: 'note'
  | Record<string, string>        // kind: 'fields'
  | ChecklistItem[]                // kind: 'checklist'
  | GalleryImage[]                 // kind: 'gallery'
  | string[];                      // kind: 'links' — ids de ressources/fichiers liés

export interface ProjectContent {
  notes?: string;
  customSections?: CustomOverviewSection[];
  customSectionData?: Record<string, CustomSectionValue>;
}
```

- [ ] **Step 3: Ajouter un constructeur pour la section Livrables client par défaut**

Après `getDefaultVisionSection()` (qui reste inchangée), ajouter dans le même fichier :

```ts
export function getDefaultDeliverablesSection(): CustomOverviewSection {
  return {
    id: DELIVERABLES_SECTION_ID,
    kind: 'deliverables',
    title: i18n.t('overview.clientDeliverables'),
    icon: 'package',
  };
}
```

- [ ] **Step 4: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : des erreurs vont apparaître dans `TravailOverview.tsx` et `OverviewSectionForm.tsx` (usages de `Record<string, string | Record<string, string>>` désormais incompatibles avec `Record<string, CustomSectionValue>`). C'est normal — elles seront résolues dans les tâches suivantes. Note-les mais ne les corrige pas ici.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/projectContentStore.ts
git commit -m "feat(overview): étend le modèle de données pour les modules Checklist/Galerie/Liens

Prépare la page Aperçu en modules. OverviewSectionKind passe de 2 à 6
valeurs ; customSectionData accepte désormais des tableaux en plus du texte
et des champs. Le module Livrables client aura sa propre entrée de type
'deliverables' — elle ne porte que sa position, ses données restent dans
taskStore.ts, inchangées.

Cassé intentionnellement à cette étape (TravailOverview.tsx et
OverviewSectionForm.tsx ne compilent plus) — corrigé dans les tâches
suivantes du même chantier."
```

---

### Task 2: Le bloc Livrables client rejoint `customSections`

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx` (déplacement de bloc, lignes ~569-994 et ~997-1090)

**Interfaces:**
- Consumes: `DELIVERABLES_SECTION_ID`, `getDefaultDeliverablesSection()` (tâche 1)
- Produces: le module Livrables client rendu à l'intérieur de la boucle unifiée, à la position que lui donne `customSections`

**Contexte — lis ceci avant de commencer :** Le bloc Livrables client (commentaire `{/* ── Livrables client ── */}`, ligne ~569) est aujourd'hui un `<Card>` fixe, rendu **avant** la boucle `customSections.map(...)` qui commence ligne ~997. Il utilise de nombreux states déjà déclarés plus haut dans le composant (`deliverables`, `addingDeliverable`, `newDlTitle`, `newDlFormat`, `newDlSection`, `openDl`, `editingDlId`, `dlTitleDraft`, etc.) — **aucun de ces states ne change**, seule la **position dans le JSX** du bloc doit bouger.

Le bloc se termine juste avant la ligne `{/* ── Sections personnalisées ── */}` (`customSections.map`, ligne ~997).

- [ ] **Step 1: Repérer les limites exactes du bloc à déplacer**

```bash
grep -n "── Livrables client ──\|── Sections personnalisées ──\|customSections.map" app/src/screens/TravailOverview.tsx
```

Note les numéros de ligne exacts (ils ont pu légèrement bouger depuis l'écriture de ce plan à cause des tâches précédentes). Le bloc à déplacer va du commentaire `{/* ── Livrables client ── */}` jusqu'au `</Card>` qui le ferme, juste avant `{/* ── Sections personnalisées ── */}`.

- [ ] **Step 2: Couper le bloc Livrables client de sa position actuelle**

Retire tout le JSX du `<Card title={...clientDeliverables...} icon="package" ...>` jusqu'à son `</Card>` fermant (le bloc entier, avec tout son contenu : en-têtes de colonnes, liste des livrables, formulaire d'ajout inline, menus déroulants type/format/priorité/statut/lien). Garde-le de côté (dans un fichier temporaire ou en mémoire) pour le Step 3.

- [ ] **Step 3: Coller le bloc à l'intérieur de la boucle `customSections.map`, gardé par le kind**

Trouve `{customSections.map((section, sectionIdx) => (` (ligne ~997). Juste après l'ouverture de cette fonction fléchée, avant le `<Card key={section.id} ...>` existant pour note/fields, ajoute une garde :

```tsx
{customSections.map((section, sectionIdx) => {
  if (section.kind === 'deliverables') {
    return (
      <React.Fragment key={section.id}>
        {/* ← colle ici tout le bloc coupé au Step 2, tel quel, avec son
            <Card title={...} icon="package" ...> d'origine et son contenu complet.
            Ne change rien à l'intérieur — seule la position a changé. */}
      </React.Fragment>
    );
  }
  return (
    <Card key={section.id} title={section.title} icon={section.icon} collapsible defaultOpen={true} persistKey={`${project.id}_${section.id}`}
      {/* ... reste du Card existant pour note/fields, inchangé ... */}
    >
      {/* ... contenu existant ... */}
    </Card>
  );
})}
```

**Point d'attention :** la boucle passe de `customSections.map((section, sectionIdx) => (` (arrow function à retour implicite, parenthèses) à `customSections.map((section, sectionIdx) => { ... return (...); })` (corps de fonction, `return` explicite) pour accueillir le `if`. Vérifie que la parenthèse fermante finale de `.map(...)` est bien `})` et non `))` après ce changement.

- [ ] **Step 4: Vérifier que `sectionIdx` reste correct pour Vision et les boutons haut/bas existants**

Les boutons de réordonnancement actuels (`handleMoveSection`, flèches haut/bas) référencent `customSections[sectionIdx - 1].locked` et `customSections.length`. Comme le module Livrables client fait maintenant partie du même tableau `customSections`, ces indices restent corrects sans changement — vérifie simplement qu'aucune référence à `sectionIdx` n'a été cassée par le passage en corps de fonction explicite.

- [ ] **Step 5: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : les erreurs liées à la position du bloc Livrables client disparaissent. Il peut rester des erreurs liées à `customSectionData` (types `checklist`/`gallery`/`links` pas encore rendus) — normal, résolu à la tâche 4.

- [ ] **Step 6: Vérification manuelle**

```bash
cd app && npm run dev
```

1. Ouvrir la page Aperçu d'un projet existant (session démo) → le bloc Livrables client apparaît exactement à la même position qu'avant (juste après Vision, avant les sections personnalisées).
2. Ajouter un livrable, changer son type/priorité/statut, lier une ressource → tout fonctionne comme avant (aucune régression comportementale, seule la position dans l'arbre React a changé).
3. Les flèches haut/bas du bloc Livrables client (héritées du système de sections) apparaissent maintenant à côté de son titre, comme pour les autres sections — normal à ce stade, elles seront remplacées par le glisser-déposer à la tâche 5.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "refactor(overview): le bloc Livrables client rejoint la liste des sections

Déplace le Card Livrables client (jusqu'ici fixe, hors du système de
sections) à l'intérieur de la boucle customSections.map, gardé par
section.kind === 'deliverables'. Aucun changement de comportement : même
contenu, même position visuelle pour les projets existants — seule la
structure du rendu change, en préparation du glisser-déposer (tâche 5) et
de la possibilité de le déplacer/supprimer (tâche 3)."
```

---

### Task 3: Migration + création des modules Livrables/Checklist/Galerie/Liens

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx:397-408` (migration dans `applyLoadedContent`)
- Modify: `app/src/components/OverviewSectionForm.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `DELIVERABLES_SECTION_ID`, `getDefaultDeliverablesSection()`, `ChecklistItem`, `GalleryImage` (tâche 1)
- Produces: `OverviewSectionForm` accepte et produit les 6 kinds ; nouvelles entrées `customSectionData` initialisées vides pour les 3 nouveaux types

- [ ] **Step 1: Migration silencieuse dans `applyLoadedContent`**

Dans `app/src/screens/TravailOverview.tsx`, la fonction `applyLoadedContent` (lignes ~397-408) insère déjà Vision si absente :

```ts
const loadedSections = (c.customSections ?? []).some(s => s.id === VISION_SECTION_ID)
  ? (c.customSections ?? [])
  : [getDefaultVisionSection(), ...(c.customSections ?? [])];
```

Ajouter juste en dessous la même logique pour Livrables client, insérée en position 2 (juste après Vision) si absente :

```ts
const hasDeliverables = loadedSections.some(s => s.kind === 'deliverables');
const migratedSections = hasDeliverables
  ? loadedSections
  : [loadedSections[0], getDefaultDeliverablesSection(), ...loadedSections.slice(1)];
```

Remplacer les usages de `loadedSections` par `migratedSections` dans le reste de la fonction (`setCustomSections(migratedSections)`, `loadedContentRef.current = { ..., customSections: migratedSections, ... }`).

Importer `DELIVERABLES_SECTION_ID` et `getDefaultDeliverablesSection` depuis `../data/projectContentStore` dans l'import existant de `TravailOverview.tsx` (celui qui importe déjà `VISION_SECTION_ID, getDefaultVisionSection`).

- [ ] **Step 2: Clés i18n pour les 3 nouveaux types de module**

Dans `app/src/locales/fr.json`, namespace `overview` (chercher `"sectionKindNote"` pour trouver le bon bloc) :

```json
    "sectionKindDeliverables": "Livrables client",
    "sectionKindDeliverablesDesc": "Liste des livrables destinés au client, avec statut et priorité.",
    "sectionKindChecklist": "Checklist",
    "sectionKindChecklistDesc": "Une liste d'éléments à cocher, libre — distincte des tâches du projet.",
    "sectionKindGallery": "Galerie",
    "sectionKindGalleryDesc": "Des images de référence, avec une légende chacune.",
    "sectionKindLinks": "Liens",
    "sectionKindLinksDesc": "Des ressources ou fichiers du projet, réunis dans un module.",
```

Dans `app/src/locales/en.json`, même bloc :

```json
    "sectionKindDeliverables": "Client deliverables",
    "sectionKindDeliverablesDesc": "List of deliverables for the client, with status and priority.",
    "sectionKindChecklist": "Checklist",
    "sectionKindChecklistDesc": "A free checklist — separate from the project's tasks.",
    "sectionKindGallery": "Gallery",
    "sectionKindGalleryDesc": "Reference images, each with a caption.",
    "sectionKindLinks": "Links",
    "sectionKindLinksDesc": "Project resources or files, grouped into a module.",
```

- [ ] **Step 3: Étendre `OverviewSectionForm` pour proposer les 4 nouveaux kinds à la création**

Dans `app/src/components/OverviewSectionForm.tsx`, le sélecteur de kind à la création (ligne 61-71) n'affiche aujourd'hui que `['fields', 'note']`. Le composant a besoin de savoir si un module Livrables client existe déjà, pour ne pas le proposer deux fois :

```tsx
export function OverviewSectionForm({ initial, onSave, onCancel, deliverablesAlreadyExists }: {
  initial?: CustomOverviewSection;
  onSave: (section: CustomOverviewSection) => void;
  onCancel: () => void;
  /** true si customSections contient déjà une entrée kind:'deliverables' — n'affiche pas ce choix, comme Vision n'est jamais proposée. */
  deliverablesAlreadyExists?: boolean;
}) {
```

Remplacer le bloc de sélection de kind (lignes 61-71) :

```tsx
      {!initial && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['fields', 'note', 'checklist', 'gallery', 'links'] as const)
            .concat(deliverablesAlreadyExists ? [] : ['deliverables'])
            .map(k => (
            <button key={k} onClick={() => setKind(k)}
              style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--border)'}`, background: kind === k ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t(KIND_LABEL_KEY[k])}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t(KIND_DESC_KEY[k])}</p>
            </button>
          ))}
        </div>
      )}
```

Ajouter juste avant le composant, au niveau du module :

```tsx
const KIND_LABEL_KEY: Record<OverviewSectionKind, string> = {
  fields: 'overview.sectionKindFields',
  note: 'overview.sectionKindNote',
  deliverables: 'overview.sectionKindDeliverables',
  checklist: 'overview.sectionKindChecklist',
  gallery: 'overview.sectionKindGallery',
  links: 'overview.sectionKindLinks',
};
const KIND_DESC_KEY: Record<OverviewSectionKind, string> = {
  fields: 'overview.sectionKindFieldsDesc',
  note: 'overview.sectionKindNoteDesc',
  deliverables: 'overview.sectionKindDeliverablesDesc',
  checklist: 'overview.sectionKindChecklistDesc',
  gallery: 'overview.sectionKindGalleryDesc',
  links: 'overview.sectionKindLinksDesc',
};
```

- [ ] **Step 4: `handleSave` produit une section vide correcte pour chaque nouveau kind**

Dans `handleSave` (lignes 30-40), le `canSave` et la construction de l'objet section n'ont besoin d'aucune donnée supplémentaire pour `checklist`/`gallery`/`links`/`deliverables` — leur contenu vit dans `customSectionData`, initialisé à un tableau vide au moment de la création par l'appelant (Step 5), pas ici. Élargir seulement `canSave` pour que ces kinds ne dépendent pas de `fields` :

```ts
const canSave = title.trim().length > 0 && (kind !== 'fields' || fields.some(f => f.label.trim().length > 0));
```

(Inchangé pour `note` qui n'exigeait déjà rien de plus que le titre ; les 4 nouveaux kinds suivent la même règle.)

- [ ] **Step 5: `handleAddSection` initialise la donnée vide selon le kind, dans `TravailOverview.tsx`**

Dans `TravailOverview.tsx`, `handleAddSection` (lignes 337-340) doit désormais aussi amorcer `customSectionData[section.id]` avec la bonne forme vide :

```ts
const handleAddSection = (section: CustomOverviewSection) => {
  setCustomSections(prev => [...prev, section]);
  if (section.kind === 'checklist' || section.kind === 'gallery' || section.kind === 'links') {
    setCustomSectionData(prev => ({ ...prev, [section.id]: [] }));
  }
  setAddingSectionOpen(false);
};
```

Passer aussi `deliverablesAlreadyExists` au `<OverviewSectionForm>` de création (ligne ~1099) :

```tsx
<OverviewSectionForm onSave={handleAddSection} onCancel={() => setAddingSectionOpen(false)}
  deliverablesAlreadyExists={customSections.some(s => s.kind === 'deliverables')} />
```

- [ ] **Step 6: Renommer « Ajouter une section » en « Ajouter un module »**

Chercher le bouton d'ajout (`setAddingSectionOpen(true)`) et sa clé i18n actuelle (probablement `overview.addSection`). Dans `fr.json`/`en.json`, changer sa valeur :

```json
"addSection": "Ajouter un module",
```

```json
"addSection": "Add a module",
```

(Ne pas renommer la clé elle-même — seulement le texte affiché, pour limiter le diff.)

- [ ] **Step 7: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : les erreurs liées à `OverviewSectionForm` et à la création de section disparaissent. Il reste des erreurs de rendu pour les nouveaux kinds — normal, résolu à la tâche 4.

- [ ] **Step 8: Vérification manuelle**

```bash
cd app && npm run dev
```

1. Ouvrir un projet créé avant ce chantier (localStorage vide) → le module Livrables client apparaît en position 2, comme avant.
2. « + Ajouter un module » → les 6 types apparaissent SAUF Livrables client (déjà présent) et Vision (jamais proposée) — donc 4 choix visibles : Champs, Texte, Checklist, Galerie, Liens (5, pas 4 — vérifier ce compte exact en live).
3. Créer un module Checklist → il apparaît vide, sans erreur console.

- [ ] **Step 9: Commit**

```bash
git add app/src/screens/TravailOverview.tsx app/src/components/OverviewSectionForm.tsx app/src/locales
git commit -m "feat(overview): migration + création des modules Checklist/Galerie/Liens

Les projets existants reçoivent silencieusement leur module Livrables
client en position 2 au premier chargement, sans changement visuel.
OverviewSectionForm propose désormais 5 types à la création (Champs, Texte,
Checklist, Galerie, Liens) — Livrables client n'apparaît que s'il n'existe
pas déjà dans le projet, même règle que Vision."
```

---

### Task 4: Rendu et édition des modules Checklist, Galerie, Liens

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx` (corps du `<Card>` pour note/fields, ~ligne 1046-1090)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `ChecklistItem`, `GalleryImage` (tâche 1) ; `resources`, `RES_ICON`, `InlineDropdown`, `getResources` déjà présents dans le fichier ; `setFileContent`/`getFileContent` depuis `../data/fileContentStore`
- Produces: rendu complet des 3 nouveaux types de module, avec édition en ligne

**Contexte :** Le corps du `<Card>` (contenu affiché dans chaque section) contient aujourd'hui `section.kind === 'note' ? <textarea>... : <fields editor>`. Il faut y ajouter 3 branches. Le module Livrables client (tâche 2) a son propre contenu déjà complet, ne pas y toucher ici.

- [ ] **Step 1: Localiser le point d'insertion**

```bash
grep -n "section.kind === 'note'" app/src/screens/TravailOverview.tsx
```

C'est dans le `<Card>` de la boucle `customSections.map`, branche `else` (pas `deliverables`), à l'intérieur de `<div style={{ padding: '14px 18px' }}>`.

- [ ] **Step 2: Rendu du module Checklist**

Remplacer le contenu conditionnel existant (`section.kind === 'note' ? <textarea .../> : <fields editor>`) par une chaîne de conditions couvrant les 5 kinds restants (fields/note inchangés, + 3 nouveaux) :

```tsx
{section.kind === 'note' ? (
  <textarea /* ... inchangé ... */ />
) : section.kind === 'fields' ? (
  <div /* ... éditeur de champs existant, inchangé ... */ />
) : section.kind === 'checklist' ? (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {((customSectionData[section.id] as ChecklistItem[]) ?? []).map(item => (
      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => {
          const items = (customSectionData[section.id] as ChecklistItem[]) ?? [];
          setCustomSectionData(prev => ({ ...prev, [section.id]: items.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i) }));
        }} style={{ width: 18, height: 18, borderRadius: '50%', border: item.checked ? 'none' : '1.5px solid var(--border-2)', background: item.checked ? 'var(--ok)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          {item.checked && <SFIcon name="check" size={11} color="white" />}
        </button>
        <input value={item.text} onChange={e => {
          const items = (customSectionData[section.id] as ChecklistItem[]) ?? [];
          setCustomSectionData(prev => ({ ...prev, [section.id]: items.map(i => i.id === item.id ? { ...i, text: e.target.value } : i) }));
        }} placeholder={t('overview.checklistItemPlaceholder')} style={{ flex: 1, padding: '4px 8px', borderRadius: 7, border: '1px solid transparent', background: 'transparent', color: item.checked ? 'var(--text-3)' : 'var(--text)', textDecoration: item.checked ? 'line-through' : 'none', fontSize: 13, fontFamily: 'var(--ff-text)', outline: 'none' }}
          onFocus={e => (e.currentTarget.style.border = '1px solid var(--border)')}
          onBlur={e => (e.currentTarget.style.border = '1px solid transparent')}
        />
        <button onClick={() => {
          const items = (customSectionData[section.id] as ChecklistItem[]) ?? [];
          setCustomSectionData(prev => ({ ...prev, [section.id]: items.filter(i => i.id !== item.id) }));
        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
          <SFIcon name="x" size={13} />
        </button>
      </div>
    ))}
    <button onClick={() => {
      const items = (customSectionData[section.id] as ChecklistItem[]) ?? [];
      const newItem: ChecklistItem = { id: `chk-${Date.now()}`, text: '', checked: false };
      setCustomSectionData(prev => ({ ...prev, [section.id]: [...items, newItem] }));
    }} style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
      <SFIcon name="plus" size={12} /> {t('overview.addChecklistItem')}
    </button>
  </div>
) : section.kind === 'gallery' ? (
  <GalleryModuleBody
    images={(customSectionData[section.id] as GalleryImage[]) ?? []}
    onChange={next => setCustomSectionData(prev => ({ ...prev, [section.id]: next }))}
  />
) : section.kind === 'links' ? (
  <LinksModuleBody
    linkedIds={(customSectionData[section.id] as string[]) ?? []}
    resources={resources}
    onChange={next => setCustomSectionData(prev => ({ ...prev, [section.id]: next }))}
    onOpen={rid => navigate(`/projets/${project.id}/ressources/${rid}`)}
  />
) : null}
```

- [ ] **Step 3: Composant `GalleryModuleBody`**

Ajouter, avant le composant principal `TravailOverview` (au même niveau que la fonction `Card` du fichier), un composant dédié — l'upload nécessite son propre `<input type="file">` caché et sa propre gestion de la conversion en `dataUrl` :

```tsx
function GalleryModuleBody({ images, onChange }: {
  images: GalleryImage[];
  onChange: (next: GalleryImage[]) => void;
}) {
  const { t } = useTranslation();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    [...files].forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setFileContent(id, file);
      const dataUrl = getFileContent(id) ?? '';
      onChange([...images, { id, dataUrl, caption: '' }]);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {images.map(img => (
          <div key={img.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <img src={img.dataUrl} alt={img.caption} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px' }}>
              <input value={img.caption} onChange={e => onChange(images.map(i => i.id === img.id ? { ...i, caption: e.target.value } : i))}
                placeholder={t('overview.galleryCaptionPlaceholder')}
                style={{ flex: 1, minWidth: 0, padding: '2px 4px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
              <button onClick={() => onChange(images.filter(i => i.id !== img.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', flexShrink: 0 }}>
                <SFIcon name="x" size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
      <button onClick={() => fileInputRef.current?.click()}
        style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
        <SFIcon name="image-plus" size={12} /> {t('overview.addGalleryImage')}
      </button>
    </div>
  );
}
```

Ajouter les imports nécessaires en tête de `TravailOverview.tsx` : `import { setFileContent, getFileContent } from '../data/fileContentStore';` et `import type { GalleryImage, ChecklistItem } from '../data/projectContentStore';` (à fusionner avec l'import existant de `projectContentStore` sur la même ligne que `VISION_SECTION_ID`).

- [ ] **Step 4: Composant `LinksModuleBody`**

Réutilise le motif déjà présent pour les ressources liées des livrables (`InlineDropdown`, cases à cocher par ressource). Ajouter à côté de `GalleryModuleBody` :

```tsx
function LinksModuleBody({ linkedIds, resources, onChange, onOpen }: {
  linkedIds: string[];
  resources: ReturnType<typeof getResources>;
  onChange: (next: string[]) => void;
  onOpen: (resourceId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
  const linked = resources.filter(r => linkedIds.includes(r.id));

  const toggle = (rid: string) => onChange(linkedIds.includes(rid) ? linkedIds.filter(id => id !== rid) : [...linkedIds, rid]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {linked.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {linked.map(r => (
            <span key={r.id} onClick={() => onOpen(r.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 200, padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-3)', cursor: 'pointer' }}>
              <SFIcon name={RES_ICON[r.type] ?? 'file'} size={11} color="var(--text-3)" />
              <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              <span onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggle(r.id); }} style={{ display: 'inline-flex', flexShrink: 0 }}>
                <SFIcon name="x" size={10} color="var(--text-3)" />
              </span>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <button ref={btnRef} onClick={() => { setAnchorRect(btnRef.current?.getBoundingClientRect() ?? null); setOpen(v => !v); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
          <SFIcon name="paperclip" size={12} /> {t('overview.linkExistingResource')}
        </button>
        {open && (
          <InlineDropdown onClose={() => setOpen(false)} anchorRect={anchorRect} minWidth={280} zIndex={1000}>
            <div style={{ maxHeight: 320, overflowY: 'auto', width: 280 }}>
              {resources.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px', textAlign: 'center' }}>{t('overview.noResourcesHint')}</p>
              )}
              {resources.map(r => (
                <button key={r.id} onClick={() => toggle(r.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: linkedIds.includes(r.id) ? 'rgba(249,255,0,0.07)' : 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                  <SFIcon name={RES_ICON[r.type] ?? 'file'} size={13} color="var(--text-3)" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  {linkedIds.includes(r.id) && <SFIcon name="check" size={13} color="var(--accent)" />}
                </button>
              ))}
            </div>
          </InlineDropdown>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Clés i18n**

`fr.json`, namespace `overview` :

```json
    "checklistItemPlaceholder": "Nouvel élément…",
    "addChecklistItem": "Ajouter un élément",
    "galleryCaptionPlaceholder": "Légende…",
    "addGalleryImage": "Ajouter une image",
```

`en.json` :

```json
    "checklistItemPlaceholder": "New item…",
    "addChecklistItem": "Add item",
    "galleryCaptionPlaceholder": "Caption…",
    "addGalleryImage": "Add image",
```

(`overview.linkExistingResource` et `overview.noResourcesHint` existent déjà — réutilisées telles quelles pour `LinksModuleBody`.)

- [ ] **Step 6: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : zéro erreur.

- [ ] **Step 7: Vérification manuelle**

```bash
cd app && npm run dev
```

1. Ajouter un module Checklist → ajouter 3 éléments, en cocher 2, recharger la page → l'état persiste.
2. Ajouter un module Galerie → glisser-déposer ou choisir une image via le sélecteur, ajouter une légende, recharger → l'image et la légende persistent (sous la limite de 3 Mo en session démo — voir cas limite du spec).
3. Ajouter un module Liens → lier une ressource existante du projet → elle apparaît en chip, cliquable vers la ressource ; la retirer via le petit `x` fonctionne.

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/TravailOverview.tsx app/src/locales
git commit -m "feat(overview): rendu et édition des modules Checklist, Galerie et Liens

Checklist : ajout/suppression/coche en ligne. Galerie : upload direct
(réutilise fileContentStore, même mécanisme que l'import de fichiers
réels). Liens : réutilise le sélecteur de ressources déjà en place pour les
livrables (InlineDropdown + cases à cocher), extrait en composant partagé
LinksModuleBody plutôt que dupliqué."
```

---

### Task 5: Glisser-déposer pour réordonner les modules

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx` (état de glisser, `SectionInsertZone`, remplacement des flèches)

**Interfaces:**
- Consumes: aucune nouvelle interface externe — porte un mécanisme déjà existant dans `Travail.tsx`
- Produces: `handleModuleDrop(beforeIdx: number)`, état `draggedModuleIdx`

**Contexte :** `Travail.tsx` a déjà ce mécanisme complet pour réordonner les sections de tâches (composant `SectionInsertZone`, lignes 936-953 ; état `draggedIdx`/`scrollContainerRef`/`pointerYRef`, lignes 1903-1938 ; `handleSectionInsertAt`, lignes 2179-2196). `TravailOverview.tsx` n'a pas la même indirection « sections visibles vs toutes » que `Travail.tsx` (pas de sections repliées/masquées) — la version portée est donc plus simple : un index direct dans `customSections`, sans passer par un tableau `visibleSections` intermédiaire.

- [ ] **Step 1: Porter `SectionInsertZone` dans `TravailOverview.tsx`**

Ajouter, au même niveau que les autres composants locaux du fichier (avant `TravailOverview` lui-même) :

```tsx
function ModuleInsertZone({ active, onDrop }: { active: boolean; onDrop: () => void }) {
  const [over, setOver] = React.useState(false);
  return (
    <div
      onDragOver={e => { if (active) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { if (active) { e.stopPropagation(); setOver(false); onDrop(); } }}
      style={{
        height: active ? (over ? 36 : 10) : 12,
        display: 'flex', alignItems: 'center', padding: '0 4px',
        transition: 'height 0.12s',
        flexShrink: 0,
      }}
    >
      {active && over && <div style={{ width: '100%', height: 2, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)' }} />}
    </div>
  );
}
```

- [ ] **Step 2: État de glisser + auto-défilement**

Dans le composant `TravailOverview`, ajouter près des autres `useState` :

```ts
const scrollContainerRef = React.useRef<HTMLDivElement>(null);
const pointerYRef = React.useRef(0);
const [draggedModuleIdx, setDraggedModuleIdx] = React.useState<number | null>(null);

React.useEffect(() => {
  if (draggedModuleIdx === null) return;
  const container = scrollContainerRef.current;
  if (!container) return;
  const EDGE = 160;
  const MAX_SPEED = 26;
  let frame: number;
  const scroll = () => {
    const { top, bottom } = container.getBoundingClientRect();
    const y = pointerYRef.current;
    if (y < top + EDGE) {
      const ratio = Math.min(1, (top + EDGE - y) / EDGE);
      container.scrollTop -= Math.max(2, MAX_SPEED * ratio);
    } else if (y > bottom - EDGE) {
      const ratio = Math.min(1, (y - (bottom - EDGE)) / EDGE);
      container.scrollTop += Math.max(2, MAX_SPEED * ratio);
    }
    frame = requestAnimationFrame(scroll);
  };
  frame = requestAnimationFrame(scroll);
  return () => cancelAnimationFrame(frame);
}, [draggedModuleIdx]);
```

- [ ] **Step 3: `handleModuleDrop`**

Ajouter, à côté de `handleMoveSection` (qu'il remplace) :

```ts
const handleModuleDrop = (beforeIdx: number) => {
  if (draggedModuleIdx === null) return;
  setCustomSections(prev => {
    const next = [...prev];
    const [moved] = next.splice(draggedModuleIdx, 1);
    const insertAt = beforeIdx > draggedModuleIdx ? beforeIdx - 1 : beforeIdx;
    next.splice(insertAt, 0, moved);
    return next;
  });
  setDraggedModuleIdx(null);
};
```

`handleMoveSection` peut être retiré (Step 5 s'en charge) — ses appelants (les flèches haut/bas) sont remplacés au Step 4.

- [ ] **Step 4: Brancher le glisser-déposer sur le conteneur et chaque module**

Sur le conteneur scrollable (ligne ~507, `<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', ... }}>`), ajouter la ref et le suivi du curseur :

```tsx
<div ref={scrollContainerRef} onDragOver={e => { pointerYRef.current = e.clientY; }} onDragEnd={() => setDraggedModuleIdx(null)}
  style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
```

Juste avant le `{customSections.map(...)}`, insérer une zone de dépôt pour la position 1 (juste après Vision — jamais avant, Vision reste fixe) :

```tsx
<ModuleInsertZone active={draggedModuleIdx !== null} onDrop={() => handleModuleDrop(1)} />
{customSections.map((section, sectionIdx) => {
  /* ... */
})}
```

Dans le `<Card>` de chaque module non-Vision, ajouter `draggable` et une poignée de glissement dans son en-tête (l'`action` du `<Card>`, à côté des boutons existants). Retirer les boutons flèches haut/bas (`handleMoveSection`) au profit d'une poignée :

```tsx
draggable={!section.locked}
onDragStart={e => { if (section.locked) { e.preventDefault(); return; } setDraggedModuleIdx(sectionIdx); }}
```

Poignée visuelle dans l'`action` du Card (remplace les deux boutons flèches) :

```tsx
{!section.locked && (
  <span title={t('overview.dragToReorder')} style={{ cursor: 'grab', display: 'flex', color: 'var(--text-3)', padding: 4 }}>
    <SFIcon name="grip-vertical" size={14} />
  </span>
)}
```

Après chaque module (y compris après le module Livrables client rendu via `React.Fragment`), ajouter une zone de dépôt :

```tsx
<ModuleInsertZone active={draggedModuleIdx !== null} onDrop={() => handleModuleDrop(sectionIdx + 1)} />
```

- [ ] **Step 5: Retirer le code mort**

Supprimer `handleMoveSection` (plus appelé par rien après le Step 4) et les deux boutons flèches haut/bas qui l'appelaient dans l'`action` du `<Card>`.

- [ ] **Step 6: Clé i18n**

`fr.json`, namespace `overview` :

```json
    "dragToReorder": "Glisser pour réordonner",
```

`en.json` :

```json
    "dragToReorder": "Drag to reorder",
```

- [ ] **Step 7: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : zéro erreur. Une erreur `handleMoveSection is declared but never used` ou l'inverse (référence orpheline) indique un appelant oublié au Step 5.

- [ ] **Step 8: Vérification manuelle**

```bash
cd app && npm run dev
```

1. Glisser le module Livrables client vers le bas (en dessous d'un module Texte) → sa nouvelle position persiste après rechargement.
2. Vérifier que Vision ne peut jamais être glissée (pas de poignée visible sur son en-tête) et qu'aucune zone de dépôt n'apparaît avant elle.
3. Avec 4-5 modules présents, glisser l'un d'eux vers le haut ou le bas de l'écran → la page défile automatiquement.
4. Glisser un module directement adjacent à sa position actuelle (ex. juste après lui-même) → aucun comportement erratique (pas de doublon, pas de perte du module).

- [ ] **Step 9: Commit**

```bash
git add app/src/screens/TravailOverview.tsx app/src/locales
git commit -m "feat(overview): glisser-déposer pour réordonner les modules

Remplace les flèches haut/bas par un glisser-déposer natif, portant tel
quel le mécanisme déjà éprouvé dans Travail.tsx (réordonnancement des
sections de tâches) : poignée de glissement, zones d'insertion entre
modules, défilement automatique en bordure d'écran (onDragOver, pas
onPointerMove — ce dernier ne se déclenche pas pendant un glisser HTML5
natif). Vision reste hors de ce mécanisme, toujours fixe en premier."
```

---

### Task 6: Vérification d'ensemble

**Files:** aucun changement de code attendu.

- [ ] **Step 1: Typecheck et build complet**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit && npm run build
```

Attendu : zéro erreur TypeScript, build réussi (avertissements de taille de chunk préexistants, sans rapport avec ce chantier).

- [ ] **Step 2: Parcours complet dans le navigateur (les 8 scénarios du spec)**

```bash
cd app && npm run dev
```

1. Page Aperçu d'un projet existant → le bloc Livrables client apparaît à sa position actuelle, migration silencieuse confirmée (pas de changement visuel par rapport à avant ce chantier).
2. Glisser le module Livrables client vers le bas → sa nouvelle position persiste après rechargement.
3. Ajouter un module Checklist → ajouter 3 éléments, en cocher 2, recharger → l'état persiste.
4. Ajouter un module Galerie → glisser-déposer une image, ajouter une légende, recharger → l'image et la légende persistent (sous la limite de 3 Mo en démo).
5. Ajouter un module Liens → lier une ressource existante du projet → elle apparaît, cliquable vers la ressource.
6. Supprimer le module Livrables client → il disparaît de la page ; rouvrir le Kanban du projet (`/projets/:id`) → les tâches-livrables existent toujours, intactes.
7. Vérifier que Vision reste bloqué en premier : glisser-déposer ne propose jamais de la déplacer, aucune poignée visible sur son en-tête.
8. Glisser un module vers le haut/bas de l'écran avec plusieurs modules présents → la page défile automatiquement.

- [ ] **Step 3: Vérifier la compatibilité avec l'ancien format**

Dans la console du navigateur (session démo), simuler un projet enregistré avant ce chantier (sans module Livrables client dans `customSections`) :

```js
const key = Object.keys(localStorage).find(k => k.startsWith('sf_project_content_'));
// Si aucune clé n'existe encore pour le projet ouvert, ouvrir d'abord sa page Aperçu une fois.
const raw = JSON.parse(localStorage.getItem(key));
raw.customSections = raw.customSections.filter(s => s.kind !== 'deliverables');
localStorage.setItem(key, JSON.stringify(raw));
location.reload();
```

Attendu : après rechargement, le module Livrables client réapparaît automatiquement en position 2, sans erreur console — la migration s'est redéclenchée.

- [ ] **Step 4: Commit éventuel**

S'il a fallu corriger quelque chose :

```bash
git add app/src && git commit -m "fix(overview): corrections issues de la vérification d'ensemble"
```

Sinon, rien à committer — la vérification suffit.
