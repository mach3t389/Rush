# Unification des modules Aperçu — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de Vision, Livrables client, Factures, Fichiers et Notes internes des « modules système » strictement identiques dans leurs capacités (déplaçables, renommables, supprimables sans perte de données, ré-ajoutables, un seul menu « ... » partout, poignée de glissement à gauche de l'icône) — Factures/Fichiers/Notes internes rejoignent `customSections` au lieu d'être des `<Card>` codées en dur, et Vision perd son statut `locked`.

**Architecture:** `OverviewSectionKind` s'étend de 6 à 10 valeurs (`vision`, `invoices`, `files`, `notes` en plus des 6 existantes). Les 5 modules système sont identifiés par **id canonique** (pas par kind, puisque Vision garde `kind:'fields'`-compatible pour sa restitution — voir Task 1) via une table `SYSTEM_MODULES` centralisée dans `projectContentStore.ts`. Le flag `deliverablesRemoved: boolean` du chantier précédent se généralise en `removedSystemModules: string[]` (ids canoniques). La poignée de glissement quitte `action` (droite) pour rejoindre le titre (gauche), au niveau du composant `Card` partagé — un seul endroit à changer pour que tous les modules en bénéficient.

**Tech Stack:** React 19, TypeScript, Vite, i18next, styles inline, Supabase (JSONB via `project_content`).

**Spec :** `docs/superpowers/specs/2026-07-31-apercu-modules-unification-design.md`

## Global Constraints

- **Aucun test automatisé dans ce projet.** Vérification par typecheck + navigateur.
- Typecheck : `npx tsc -p tsconfig.app.json --noEmit` depuis `app/`. Le `-p` est **obligatoire**.
- **Jamais de texte utilisateur en dur.** Toute chaîne visible passe par `t('clé')`, ajoutée dans `app/src/locales/fr.json` ET `app/src/locales/en.json`. Les titres/placeholder de Fichiers et Notes internes sont AUJOURD'HUI en dur (`"Fichiers"`, `"Importer"`, `"Notes internes"`, `"Ajouter des notes de projet..."`) — à corriger en même temps que leur migration vers le système de modules (Tasks 6 et 7).
- Styles en `style={{}}` inline, pas de Tailwind.
- Travailler directement sur `master` (convention établie du projet, pas de worktree).
- Commit à la fin de chaque tâche, message en français.
- **Vision devient supprimable, déplaçable et renommable comme les 4 autres modules système** — elle perd son statut `locked`, mais reste positionnée en premier par défaut pour tout projet qui ne l'a jamais eue autrement.
- **Les 5 modules système (Vision, Livrables client, Factures, Fichiers, Notes internes) sont chacun limités à un seul exemplaire par projet**, supprimables sans perte de données réelles (leurs données vivent ailleurs : `taskStore`, `financeStore`, `fileStore`, ou pour Vision/Notes, restent en mémoire dans `customSectionData`/`ProjectContent.notes` même après suppression du module).
- **`applyTemplateById`** (« Charger un modèle d'Aperçu », `TravailOverview.tsx` ~ligne 527) et l'éditeur de structure de modèles (`Modeles.tsx`, `OverviewSectionsEditor`) restent **hors de portée** de ce chantier — ils continuent de fonctionner avec le modèle de données étendu sans modification, et sont seulement vérifiés à la Task 8, pas retouchés.

## Vocabulaire

- **Module système** = un des 5 : Vision, Livrables client, Factures, Fichiers, Notes internes. Identifié par un id canonique fixe (`VISION_SECTION_ID`, etc.), jamais par son `kind` seul (Vision garde une restitution visuelle partagée avec le kind `fields` générique — voir Task 1).
- **Module personnalisé** = tout le reste (Champs personnalisés, Note libre, Checklist, Galerie, Liens) — comportement inchangé par ce chantier (ajout/suppression libres, pas de limite de nombre, id `sec-<timestamp>`).

---

### Task 1 : Modèle de données — 4 nouveaux kinds + table des modules système

**Files:**
- Modify: `app/src/data/projectContentStore.ts`
- Modify: `app/src/screens/TravailOverview.tsx` (une seule ligne, voir Step 5 — évite une régression de rendu de Vision le temps que Task 2-4 arrivent)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Produces : `OverviewSectionKind` (10 valeurs), `INVOICES_SECTION_ID`, `FILES_SECTION_ID`, `NOTES_SECTION_ID`, `getDefaultInvoicesSection()`, `getDefaultFilesSection()`, `getDefaultNotesSection()`, `SYSTEM_MODULES: { id: string; kind: OverviewSectionKind; factory: () => CustomOverviewSection }[]`, `SYSTEM_KIND_ID: Partial<Record<OverviewSectionKind, string>>`, `ProjectContent.removedSystemModules?: string[]`

- [ ] **Step 1 : Étendre `OverviewSectionKind` et modifier `getDefaultVisionSection`**

Dans `app/src/data/projectContentStore.ts`, remplacer la ligne :

```ts
export type OverviewSectionKind = 'fields' | 'note' | 'deliverables' | 'checklist' | 'gallery' | 'links';
```

par :

```ts
export type OverviewSectionKind = 'fields' | 'note' | 'vision' | 'deliverables' | 'checklist' | 'gallery' | 'links' | 'invoices' | 'files' | 'notes';
```

Puis remplacer `getDefaultVisionSection()` :

```ts
export function getDefaultVisionSection(): CustomOverviewSection {
  return {
    id: VISION_SECTION_ID,
    kind: 'fields',
    title: i18n.t('overview.visionTitle'),
    icon: 'compass',
    locked: true,
    fields: [
      { id: 'concept', label: i18n.t('overview.visionConcept'), multiline: true },
      { id: 'tonalite', label: i18n.t('overview.visionTone'), multiline: true },
      { id: 'publicCible', label: i18n.t('overview.visionAudience'), multiline: true },
      { id: 'objectifs', label: i18n.t('overview.visionGoals'), multiline: true },
      { id: 'references', label: i18n.t('overview.visionReferences'), multiline: true },
    ],
  };
}
```

par (kind devient `'vision'`, `locked` retiré — Vision est désormais un module système comme les autres, plus jamais verrouillé) :

```ts
export function getDefaultVisionSection(): CustomOverviewSection {
  return {
    id: VISION_SECTION_ID,
    kind: 'vision',
    title: i18n.t('overview.visionTitle'),
    icon: 'compass',
    fields: [
      { id: 'concept', label: i18n.t('overview.visionConcept'), multiline: true },
      { id: 'tonalite', label: i18n.t('overview.visionTone'), multiline: true },
      { id: 'publicCible', label: i18n.t('overview.visionAudience'), multiline: true },
      { id: 'objectifs', label: i18n.t('overview.visionGoals'), multiline: true },
      { id: 'references', label: i18n.t('overview.visionReferences'), multiline: true },
    ],
  };
}
```

**Note pour les projets déjà existants :** leur Vision persistée porte encore `kind: 'fields', locked: true` (jamais réécrit rétroactivement — même principe de tolérance permanente que `migrateLegacyVision` un peu plus bas dans ce fichier). Le rendu doit donc accepter les deux (`kind === 'fields' || kind === 'vision'`, voir Step 5) indéfiniment ; `locked` n'est lu nulle part après ce chantier, donc sa présence résiduelle est inoffensive.

- [ ] **Step 2 : Ajouter les 3 nouvelles constantes d'id et leurs constructeurs par défaut**

Juste après `getDefaultDeliverablesSection()` dans le même fichier :

```ts
export const INVOICES_SECTION_ID = 'invoices';
export const FILES_SECTION_ID = 'files';
export const NOTES_SECTION_ID = 'notes';

export function getDefaultInvoicesSection(): CustomOverviewSection {
  return { id: INVOICES_SECTION_ID, kind: 'invoices', title: i18n.t('overview.invoicesTitle'), icon: 'receipt' };
}

export function getDefaultFilesSection(): CustomOverviewSection {
  return { id: FILES_SECTION_ID, kind: 'files', title: i18n.t('overview.filesTitle'), icon: 'folder' };
}

export function getDefaultNotesSection(): CustomOverviewSection {
  return { id: NOTES_SECTION_ID, kind: 'notes', title: i18n.t('overview.internalNotesTitle'), icon: 'sticky-note' };
}
```

- [ ] **Step 3 : Table centrale des modules système**

Juste après les 3 constructeurs ajoutés au Step 2 :

```ts
// Table centrale des 5 modules système — un seul endroit à modifier pour ajouter
// un futur module système. L'ORDRE de ce tableau EST l'ordre par défaut utilisé
// à la migration (TravailOverview.tsx, applyLoadedContent) pour les modules
// qu'un projet n'a jamais eus. Identifié par id canonique, pas par kind seul :
// Vision garde une compatibilité de rendu avec le kind générique 'fields' (voir
// Step 1), donc son kind seul ne suffit pas à la distinguer d'un module
// "Champs personnalisés" ordinaire — l'id, lui, est toujours unique et stable.
export const SYSTEM_MODULES: { id: string; kind: OverviewSectionKind; factory: () => CustomOverviewSection }[] = [
  { id: VISION_SECTION_ID, kind: 'vision', factory: getDefaultVisionSection },
  { id: DELIVERABLES_SECTION_ID, kind: 'deliverables', factory: getDefaultDeliverablesSection },
  { id: INVOICES_SECTION_ID, kind: 'invoices', factory: getDefaultInvoicesSection },
  { id: FILES_SECTION_ID, kind: 'files', factory: getDefaultFilesSection },
  { id: NOTES_SECTION_ID, kind: 'notes', factory: getDefaultNotesSection },
];

export const SYSTEM_SECTION_IDS: string[] = SYSTEM_MODULES.map(m => m.id);

// kind -> id canonique, pour les 5 kinds système uniquement. Utilisé par
// OverviewSectionForm pour assigner l'id canonique à la création (au lieu d'un
// id générique sec-<timestamp>) et pour savoir quels choix exclure du sélecteur
// de kind quand le module existe déjà dans le projet (par id, pas par kind —
// même raison qu'au Step 3 ci-dessus).
export const SYSTEM_KIND_ID: Partial<Record<OverviewSectionKind, string>> =
  Object.fromEntries(SYSTEM_MODULES.map(m => [m.kind, m.id]));
```

- [ ] **Step 4 : Généraliser le flag de suppression**

Remplacer l'interface `ProjectContent` :

```ts
export interface ProjectContent {
  notes?: string;
  customSections?: CustomOverviewSection[];
  customSectionData?: Record<string, CustomSectionValue>;
  /** L'utilisateur a explicitement supprimé le module Livrables client — la
   * migration à la lecture ne doit alors PAS le réinsérer (sinon la suppression
   * n'aurait aucun effet persistant, contrairement à un projet qui ne les a
   * simplement jamais eus). Remplace l'ancien champ deliverablesRemoved (booléen
   * unique) par un ensemble générique couvrant les 5 kinds système. */
  deliverablesRemoved?: boolean;
}
```

par :

```ts
export interface ProjectContent {
  notes?: string;
  customSections?: CustomOverviewSection[];
  customSectionData?: Record<string, CustomSectionValue>;
  /** @deprecated remplacé par removedSystemModules — conservé uniquement pour la
   * migration de lecture d'anciens projets (voir TravailOverview.tsx,
   * applyLoadedContent). Plus jamais écrit après ce chantier. */
  deliverablesRemoved?: boolean;
  /** Ids canoniques (VISION_SECTION_ID, DELIVERABLES_SECTION_ID, etc.) des
   * modules système que l'utilisateur a explicitement supprimés de l'Aperçu —
   * la migration à la lecture ne les réinsère pas, contrairement à un projet
   * qui ne les a simplement jamais eus. */
  removedSystemModules?: string[];
}
```

- [ ] **Step 5 : Éviter une régression de rendu de Vision le temps que Task 2-4 arrivent**

Dans `app/src/screens/TravailOverview.tsx`, chercher `section.kind === 'fields' ?` :

```bash
grep -n "section.kind === 'fields' ?" app/src/screens/TravailOverview.tsx
```

Remplacer cette seule condition :

```tsx
) : section.kind === 'fields' ? (
```

par :

```tsx
) : (section.kind === 'fields' || section.kind === 'vision') ? (
```

Sans ce changement, Vision (dont le kind vient de passer à `'vision'` au Step 1) ne matcherait plus aucune branche de rendu et s'afficherait vide.

- [ ] **Step 6 : Clés i18n pour les 3 nouveaux titres de module système**

`app/src/locales/fr.json`, namespace `overview` (chercher `"invoicesTitle"` pour se repérer, ajouter juste après `"noFiles"`) :

```json
    "filesTitle": "Fichiers",
    "internalNotesTitle": "Notes internes",
    "internalNotesPlaceholder": "Ajouter des notes de projet, contexte, instructions importantes...",
    "importFiles": "Importer",
```

`app/src/locales/en.json`, même emplacement :

```json
    "filesTitle": "Files",
    "internalNotesTitle": "Internal notes",
    "internalNotesPlaceholder": "Add project notes, context, important instructions...",
    "importFiles": "Import",
```

- [ ] **Step 7 : Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : des erreurs dans `OverviewSectionForm.tsx` (`Record<OverviewSectionKind, string>` — `KIND_LABEL_KEY`/`KIND_DESC_KEY` n'ont pas encore les 4 nouvelles clés `vision`/`invoices`/`files`/`notes`). C'est normal, corrigé à la Task 4 (vision) et implicitement couvert par les Tasks 5-7 (invoices/files/notes) qui étendent ces mêmes tables. Note les erreurs mais ne les corrige pas ici.

- [ ] **Step 8 : Commit**

```bash
git add app/src/data/projectContentStore.ts app/src/screens/TravailOverview.tsx app/src/locales
git commit -m "feat(overview): étend le modèle de données à 4 nouveaux modules système

OverviewSectionKind passe de 6 à 10 valeurs (vision, invoices, files, notes
en plus des 6 existantes). Vision perd son flag locked et change de kind
'fields' vers 'vision' (compatible en rendu avec 'fields' pour les anciens
projets déjà persistés). Nouvelle table SYSTEM_MODULES centralise les 5
modules système par id canonique — l'id reste la source de vérité pour les
identifier, jamais le kind seul (Vision partage son rendu avec le kind
générique 'fields'). deliverablesRemoved (booléen) se généralise en
removedSystemModules (tableau d'ids), avec migration de lecture de
l'ancien champ.

Cassé intentionnellement à cette étape (OverviewSectionForm.tsx ne compile
plus faute des 4 nouvelles clés dans KIND_LABEL_KEY/KIND_DESC_KEY) — corrigé
dans les tâches suivantes du même chantier."
```

---

### Task 2 : Poignée de glissement à gauche + menu « ... » partagé

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes : rien de nouveau (pur refactor de présentation)
- Produces : `Card` accepte toujours `draggable`/`onDragStart` mais rend désormais la poignée lui-même, à gauche, avant l'icône. Nouveau composant local `SectionOptionsMenu({ open, onToggle, onRename, onDelete })`.

**Contexte :** aujourd'hui la poignée de glissement est un `<span>` dupliqué dans le prop `action` (à droite) de 2 endroits : la branche `deliverables` et la branche générique (fields/note/checklist/gallery/links). Le menu « ... » (renommer/supprimer) n'existe que sur la branche générique — la branche `deliverables` a un bouton supprimer autonome ajouté au chantier précédent. Ce refactor déplace la poignée dans `Card` lui-même et unifie le menu en un seul composant, réutilisé partout.

- [ ] **Step 1 : Déplacer la poignée dans `Card`**

Chercher la définition du composant :

```bash
grep -n "^function Card" app/src/screens/TravailOverview.tsx
```

Remplacer tout le corps de `Card` :

```tsx
function Card({ children, title, icon, action, collapsible, defaultOpen = true, persistKey, draggable, onDragStart }: {
  children: React.ReactNode; title: string; icon: string; action?: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean; persistKey?: string;
  draggable?: boolean; onDragStart?: (e: React.DragEvent) => void;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [persistedOpen, setPersistedOpen] = usePersistedState(`sf_overview_section_open_${persistKey}`, defaultOpen);
  const open = persistKey ? persistedOpen : localOpen;
  const setOpen = persistKey ? setPersistedOpen : setLocalOpen;
  return (
    <div draggable={draggable} onDragStart={onDragStart} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div
        style={{ padding: '13px 18px', borderBottom: open ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: collapsible ? 'pointer' : 'default' }}
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SFIcon name={icon} size={14} color="var(--text-2)" />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
          {collapsible && (
            <SFIcon name={open ? 'chevron-up' : 'chevron-down'} size={13} color="var(--text-3)" />
          )}
        </div>
        <div onClick={e => e.stopPropagation()}>{action}</div>
      </div>
      {open && children}
    </div>
  );
}
```

par :

```tsx
function Card({ children, title, icon, action, collapsible, defaultOpen = true, persistKey, draggable, onDragStart }: {
  children: React.ReactNode; title: string; icon: string; action?: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean; persistKey?: string;
  draggable?: boolean; onDragStart?: (e: React.DragEvent) => void;
}) {
  const { t } = useTranslation();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [persistedOpen, setPersistedOpen] = usePersistedState(`sf_overview_section_open_${persistKey}`, defaultOpen);
  const open = persistKey ? persistedOpen : localOpen;
  const setOpen = persistKey ? setPersistedOpen : setLocalOpen;
  return (
    <div draggable={draggable} onDragStart={onDragStart} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div
        style={{ padding: '13px 18px', borderBottom: open ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: collapsible ? 'pointer' : 'default' }}
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {draggable && (
            <span
              onClick={e => e.stopPropagation()}
              title={t('overview.dragToReorder')}
              style={{ cursor: 'grab', display: 'flex', color: 'var(--text-3)', marginRight: 2 }}
            >
              <SFIcon name="grip-vertical" size={14} />
            </span>
          )}
          <SFIcon name={icon} size={14} color="var(--text-2)" />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
          {collapsible && (
            <SFIcon name={open ? 'chevron-up' : 'chevron-down'} size={13} color="var(--text-3)" />
          )}
        </div>
        <div onClick={e => e.stopPropagation()}>{action}</div>
      </div>
      {open && children}
    </div>
  );
}
```

(`onClick={e => e.stopPropagation()}` sur la poignée est nécessaire car elle vit maintenant dans le conteneur qui porte le `onClick` de collapse/expand — sans ça, cliquer la poignée replierait aussi la carte.)

- [ ] **Step 2 : Composant `SectionOptionsMenu`**

Ajouter, juste avant `ModuleInsertZone` dans le même fichier :

```tsx
function SectionOptionsMenu({ open, onToggle, onRename, onDelete }: {
  open: boolean; onToggle: () => void; onRename: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={onToggle}
        title={t('overview.sectionOptions')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <SFIcon name="ellipsis" size={15} />
      </button>
      {open && (
        <>
          <div onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
            <button onClick={onRename}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
              <SFIcon name="square-pen" size={12} /> {t('overview.renameSection')}
            </button>
            <button onClick={onDelete}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
              <SFIcon name="trash-2" size={12} /> {t('overview.deleteSection')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3 : Brancher `SectionOptionsMenu` sur la branche générique (fields/note/vision/checklist/gallery/links)**

Chercher :

```bash
grep -n "setSectionMenuOpenId(sectionMenuOpenId === section.id" app/src/screens/TravailOverview.tsx
```

Remplacer tout le bloc `action={...}` de la branche générique (`<Card title={section.title} ...>`, celle qui commence après le `return (` final de la boucle, PAS la branche `deliverables`) :

```tsx
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {!section.locked && (
                    <span title={t('overview.dragToReorder')} style={{ cursor: 'grab', display: 'flex', color: 'var(--text-3)', padding: 4 }}>
                      <SFIcon name="grip-vertical" size={14} />
                    </span>
                  )}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setSectionMenuOpenId(sectionMenuOpenId === section.id ? null : section.id)}
                    title={t('overview.sectionOptions')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <SFIcon name="ellipsis" size={15} />
                  </button>
                  {sectionMenuOpenId === section.id && (
                    <>
                      <div onClick={() => setSectionMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                        <button onClick={() => { setEditingSectionId(section.id); setSectionMenuOpenId(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                          <SFIcon name="square-pen" size={12} /> {t('overview.renameSection')}
                        </button>
                        {!section.locked && (
                          <button onClick={() => handleDeleteSection(section.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                            <SFIcon name="trash-2" size={12} /> {t('overview.deleteSection')}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                </div>
              }
```

par :

```tsx
              action={
                <SectionOptionsMenu
                  open={sectionMenuOpenId === section.id}
                  onToggle={() => setSectionMenuOpenId(sectionMenuOpenId === section.id ? null : section.id)}
                  onRename={() => { setEditingSectionId(section.id); setSectionMenuOpenId(null); }}
                  onDelete={() => handleDeleteSection(section.id)}
                />
              }
```

Sur la même balise `<Card ...>`, remplacer `draggable={!section.locked}` par `draggable` et `onDragStart={e => { if (section.locked) { e.preventDefault(); return; } setDraggedModuleIdx(sectionIdx); }}` par `onDragStart={() => setDraggedModuleIdx(sectionIdx)}` (plus rien n'est jamais `locked`, la garde est désormais inutile).

- [ ] **Step 4 : Brancher `SectionOptionsMenu` sur la branche `deliverables`**

Chercher :

```bash
grep -n "handleDeleteSection(DELIVERABLES_SECTION_ID)" app/src/screens/TravailOverview.tsx
```

Remplacer le bloc `action={...}` de la branche `deliverables` :

```tsx
                    action={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {!section.locked && (
                        <span title={t('overview.dragToReorder')} style={{ cursor: 'grab', display: 'flex', color: 'var(--text-3)', padding: 4 }}>
                          <SFIcon name="grip-vertical" size={14} />
                        </span>
                      )}
                      <SFButton variant="ghost" size="sm" icon="plus" onClick={() => {
                        setAddingDeliverable(true); setNewDlTitle(''); setNewDlFormat('16:9');
                        // Pas de présélection — l'utilisateur ne veut plus qu'un livrable
                        // atterrisse dans une section "Livraison" choisie sans le
                        // demander, même comme valeur par défaut implicite.
                        setNewDlSection('');
                        setNewDlSectionCustom('');
                      }}>
                        {t('overview.add')}
                      </SFButton>
                      <button onClick={() => handleDeleteSection(DELIVERABLES_SECTION_ID)}
                        title={t('overview.deleteSection')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--danger)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}>
                        <SFIcon name="trash-2" size={14} />
                      </button>
                      </div>
                    }
```

par :

```tsx
                    action={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <SFButton variant="ghost" size="sm" icon="plus" onClick={() => {
                          setAddingDeliverable(true); setNewDlTitle(''); setNewDlFormat('16:9');
                          // Pas de présélection — l'utilisateur ne veut plus qu'un livrable
                          // atterrisse dans une section "Livraison" choisie sans le
                          // demander, même comme valeur par défaut implicite.
                          setNewDlSection('');
                          setNewDlSectionCustom('');
                        }}>
                          {t('overview.add')}
                        </SFButton>
                        <SectionOptionsMenu
                          open={sectionMenuOpenId === section.id}
                          onToggle={() => setSectionMenuOpenId(sectionMenuOpenId === section.id ? null : section.id)}
                          onRename={() => { setEditingSectionId(section.id); setSectionMenuOpenId(null); }}
                          onDelete={() => handleDeleteSection(section.id)}
                        />
                      </div>
                    }
```

Sur le `<Card>` de cette branche, remplacer `draggable={!section.locked}` par `draggable` et `onDragStart={e => { if (section.locked) { e.preventDefault(); return; } setDraggedModuleIdx(sectionIdx); }}` par `onDragStart={() => setDraggedModuleIdx(sectionIdx)}`.

- [ ] **Step 5 : Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : les erreurs `KIND_LABEL_KEY`/`KIND_DESC_KEY` de la Task 1 persistent (normal, corrigées Task 4-7) ; aucune nouvelle erreur liée à ce Step.

- [ ] **Step 6 : Vérification manuelle**

```bash
cd app && npm run dev
```

1. Ouvrir une page Aperçu (session démo) — le module Vision (kind encore `'fields'` en localStorage à ce stade, tant que la migration de Task 4 n'a pas tourné) affiche toujours ses 5 champs normalement.
2. Chaque module (Vision, Livrables client, tout module personnalisé existant) affiche désormais une poignée de glissement à gauche de son icône, plus rien à droite dans l'en-tête à part le menu « ... » (et le bouton « Ajouter » pour Livrables client).
3. Cliquer le menu « ... » d'un module personnalisé → Renommer et Supprimer fonctionnent comme avant.
4. Cliquer le menu « ... » de Livrables client → Renommer et Supprimer apparaissent maintenant (avant ce chantier, Livrables client n'avait qu'un bouton supprimer nu) ; supprimer fonctionne comme avant (testé au chantier précédent).
5. Glisser-déposer pour réordonner fonctionne toujours (poignée à gauche maintenant).

- [ ] **Step 7 : Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "refactor(overview): poignée de glissement à gauche + menu unique pour tous les modules

Card rend désormais lui-même la poignée de glissement, à gauche de
l'icône — un seul endroit à changer profite à tous les modules (même
position que Travail.tsx pour la réorganisation des sections de tâches).
Nouveau composant SectionOptionsMenu partagé (Renommer + Supprimer),
branché sur la boucle générique ET sur Livrables client, qui perd son
bouton supprimer autonome au profit du même menu que tout le monde."
```

---

### Task 3 : Généraliser la suppression persistante à tout module système

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`
- Modify: `app/src/components/OverviewSectionForm.tsx`

**Interfaces:**
- Consumes : `SYSTEM_SECTION_IDS`, `SYSTEM_KIND_ID` (Task 1)
- Produces : `removedSystemModules: string[]` (state), `existingSystemIds: string[]` (prop d'`OverviewSectionForm`, remplace `deliverablesAlreadyExists`)

**Contexte :** le chantier précédent a corrigé un bug où supprimer Livrables client le faisait réapparaître au rechargement suivant, via un flag `deliverablesRemoved: boolean` spécifique. Cette tâche généralise ce mécanisme aux 5 modules système, en le gardant strictement équivalent en comportement pour Livrables client (aucune régression sur ce qui a été vérifié en direct au chantier précédent).

- [ ] **Step 1 : État généralisé**

Chercher :

```bash
grep -n "const \[deliverablesRemoved, setDeliverablesRemoved\]" app/src/screens/TravailOverview.tsx
```

Remplacer :

```tsx
  const [deliverablesRemoved, setDeliverablesRemoved] = useState(false);
```

par :

```tsx
  const [removedSystemModules, setRemovedSystemModules] = useState<string[]>([]);
```

- [ ] **Step 2 : `handleAddSection` — retirer un module système de la liste des supprimés quand il est ré-ajouté**

Chercher `const handleAddSection` et remplacer :

```tsx
  const handleAddSection = (section: CustomOverviewSection) => {
    setCustomSections(prev => [...prev, section]);
    if (section.kind === 'checklist' || section.kind === 'gallery' || section.kind === 'links') {
      setCustomSectionData(prev => ({ ...prev, [section.id]: [] }));
    }
    if (section.kind === 'deliverables') setDeliverablesRemoved(false);
    setAddingSectionOpen(false);
  };
```

par :

```tsx
  const handleAddSection = (section: CustomOverviewSection) => {
    setCustomSections(prev => [...prev, section]);
    if (section.kind === 'checklist' || section.kind === 'gallery' || section.kind === 'links') {
      setCustomSectionData(prev => ({ ...prev, [section.id]: [] }));
    }
    if (SYSTEM_SECTION_IDS.includes(section.id)) {
      setRemovedSystemModules(prev => prev.filter(id => id !== section.id));
    }
    setAddingSectionOpen(false);
  };
```

- [ ] **Step 3 : `handleDeleteSection` — généralisé par id, ne vide `customSectionData` que pour les modules non-système**

Chercher `const handleDeleteSection` et remplacer :

```tsx
  const handleDeleteSection = (id: string) => {
    if (!confirm(t('overview.confirmDeleteSection'))) return;
    const isDeliverables = customSections.find(s => s.id === id)?.kind === 'deliverables';
    setCustomSections(prev => prev.filter(s => s.id !== id));
    setCustomSectionData(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (isDeliverables) setDeliverablesRemoved(true);
    setSectionMenuOpenId(null);
  };
```

par :

```tsx
  const handleDeleteSection = (id: string) => {
    if (!confirm(t('overview.confirmDeleteSection'))) return;
    const isSystem = SYSTEM_SECTION_IDS.includes(id);
    setCustomSections(prev => prev.filter(s => s.id !== id));
    // Un module système (Vision, Livrables client, Factures, Fichiers, Notes
    // internes) ne perd jamais son contenu à la suppression — ses données
    // vivent ailleurs (taskStore/financeStore/fileStore) ou, pour Vision,
    // restent en mémoire pour réapparaître intactes si on le ré-ajoute. Un
    // module personnalisé, lui, perd bel et bien son contenu : un nouvel ajout
    // crée toujours un id frais, sans possibilité de retrouver l'ancien.
    if (!isSystem) {
      setCustomSectionData(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
    if (isSystem) setRemovedSystemModules(prev => prev.includes(id) ? prev : [...prev, id]);
    setSectionMenuOpenId(null);
  };
```

- [ ] **Step 4 : Généraliser `loadedContentRef`/`stateRef`/`applyLoadedContent`/pristine-check/sauvegarde débouncée**

Chercher `loadedContentRef = useRef` et remplacer chaque occurrence de `deliverablesRemoved` par `removedSystemModules`, avec le bon type et la bonne comparaison. Le fichier contient 6 occurrences à traiter ensemble (elles se suivent) :

```tsx
  const loadedContentRef = useRef<{
    projectId: string; notes: string;
    customSections: CustomOverviewSection[]; customSectionData: Record<string, CustomSectionValue>;
    deliverablesRemoved: boolean;
  } | null>(null);
  const stateRef = useRef({ notes, customSections, customSectionData, deliverablesRemoved });
  stateRef.current = { notes, customSections, customSectionData, deliverablesRemoved };
```

devient :

```tsx
  const loadedContentRef = useRef<{
    projectId: string; notes: string;
    customSections: CustomOverviewSection[]; customSectionData: Record<string, CustomSectionValue>;
    removedSystemModules: string[];
  } | null>(null);
  const stateRef = useRef({ notes, customSections, customSectionData, removedSystemModules });
  stateRef.current = { notes, customSections, customSectionData, removedSystemModules };
```

Dans `applyLoadedContent`, chercher :

```tsx
    const loadedDeliverablesRemoved = c.deliverablesRemoved ?? false;
```

remplacer par :

```tsx
    const loadedRemovedSystemModules: string[] = c.removedSystemModules ?? (c.deliverablesRemoved ? [DELIVERABLES_SECTION_ID] : []);
```

Puis, dans la même fonction, chercher :

```tsx
    if (!loadedSections.some(s => s.id === DELIVERABLES_SECTION_ID) && !loadedDeliverablesRemoved) {
```

remplacer par :

```tsx
    if (!loadedSections.some(s => s.id === DELIVERABLES_SECTION_ID) && !loadedRemovedSystemModules.includes(DELIVERABLES_SECTION_ID)) {
```

(Cette insertion spécifique à `deliverables` sera remplacée par la boucle générique sur `SYSTEM_MODULES` à la Task 4 — ce Step ne fait que renommer la variable sans changer la logique, pour rester une étape mécanique et vérifiable isolément.)

Enfin dans `applyLoadedContent`, chercher :

```tsx
    setDeliverablesRemoved(loadedDeliverablesRemoved);
    loadedContentRef.current = { projectId: project.id, notes: loadedNotes, customSections: loadedSections, customSectionData: loadedData, deliverablesRemoved: loadedDeliverablesRemoved };
```

remplacer par :

```tsx
    setRemovedSystemModules(loadedRemovedSystemModules);
    loadedContentRef.current = { projectId: project.id, notes: loadedNotes, customSections: loadedSections, customSectionData: loadedData, removedSystemModules: loadedRemovedSystemModules };
```

Puis chercher le check « pristine » :

```tsx
    const pristine =
      loaded.notes === cur.notes &&
      JSON.stringify(loaded.customSections) === JSON.stringify(cur.customSections) &&
      JSON.stringify(loaded.customSectionData) === JSON.stringify(cur.customSectionData) &&
      loaded.deliverablesRemoved === cur.deliverablesRemoved;
```

remplacer par :

```tsx
    const pristine =
      loaded.notes === cur.notes &&
      JSON.stringify(loaded.customSections) === JSON.stringify(cur.customSections) &&
      JSON.stringify(loaded.customSectionData) === JSON.stringify(cur.customSectionData) &&
      JSON.stringify(loaded.removedSystemModules) === JSON.stringify(cur.removedSystemModules);
```

Et enfin l'effet de sauvegarde débouncée :

```tsx
    if (
      loaded.notes === notes &&
      JSON.stringify(loaded.customSections) === JSON.stringify(customSections) &&
      JSON.stringify(loaded.customSectionData) === JSON.stringify(customSectionData) &&
      loaded.deliverablesRemoved === deliverablesRemoved
    ) return;
    const timer = window.setTimeout(() => setProjectContent(project.id, { notes, customSections, customSectionData, deliverablesRemoved }), 500);
    return () => clearTimeout(timer);
  }, [notes, customSections, customSectionData, deliverablesRemoved, project.id]);
```

devient :

```tsx
    if (
      loaded.notes === notes &&
      JSON.stringify(loaded.customSections) === JSON.stringify(customSections) &&
      JSON.stringify(loaded.customSectionData) === JSON.stringify(customSectionData) &&
      JSON.stringify(loaded.removedSystemModules) === JSON.stringify(removedSystemModules)
    ) return;
    const timer = window.setTimeout(() => setProjectContent(project.id, { notes, customSections, customSectionData, removedSystemModules }), 500);
    return () => clearTimeout(timer);
  }, [notes, customSections, customSectionData, removedSystemModules, project.id]);
```

- [ ] **Step 5 : Importer `SYSTEM_SECTION_IDS`**

Dans l'import existant de `projectContentStore` en tête de `TravailOverview.tsx`, ajouter `SYSTEM_SECTION_IDS` à la liste des imports nommés (à côté de `DELIVERABLES_SECTION_ID`, `getDefaultDeliverablesSection`, etc.).

- [ ] **Step 6 : Généraliser `OverviewSectionForm`**

Dans `app/src/components/OverviewSectionForm.tsx`, remplacer l'import :

```tsx
import { DELIVERABLES_SECTION_ID, type CustomOverviewSection, type OverviewFieldDef, type OverviewSectionKind } from '../data/projectContentStore';
```

par :

```tsx
import { SYSTEM_KIND_ID, type CustomOverviewSection, type OverviewFieldDef, type OverviewSectionKind } from '../data/projectContentStore';
```

Remplacer la signature du composant :

```tsx
export function OverviewSectionForm({ initial, onSave, onCancel, deliverablesAlreadyExists }: {
  initial?: CustomOverviewSection;
  onSave: (section: CustomOverviewSection) => void;
  onCancel: () => void;
  /** true si customSections contient déjà une entrée kind:'deliverables' — n'affiche pas ce choix, comme Vision n'est jamais proposée. */
  deliverablesAlreadyExists?: boolean;
}) {
```

par :

```tsx
export function OverviewSectionForm({ initial, onSave, onCancel, existingSystemIds = [] }: {
  initial?: CustomOverviewSection;
  onSave: (section: CustomOverviewSection) => void;
  onCancel: () => void;
  /** Ids canoniques des modules système déjà présents dans le projet (ex:
   * customSections.map(s => s.id)) — n'affiche pas ces choix dans le
   * sélecteur de kind, un module système ne peut exister qu'une fois. */
  existingSystemIds?: string[];
}) {
```

Remplacer `handleSave` :

```tsx
  const handleSave = () => {
    if (!canSave) return;
    onSave({
      // Livrables client garde toujours son id canonique (comme Vision) même
      // recréé après suppression, pour que handleDeleteSection/la migration à
      // la lecture (comparaison par id) continuent de le reconnaître.
      id: initial?.id ?? (kind === 'deliverables' ? DELIVERABLES_SECTION_ID : `sec-${Date.now()}`),
      kind,
      title: title.trim(),
      icon,
      ...(initial?.locked ? { locked: true } : {}),
      ...(kind === 'fields' ? { fields: fields.filter(f => f.label.trim().length > 0) } : {}),
    });
  };
```

par :

```tsx
  const handleSave = () => {
    if (!canSave) return;
    onSave({
      // Un module système (vision/deliverables/invoices/files/notes) garde
      // toujours son id canonique même recréé après suppression, pour que
      // handleDeleteSection/la migration à la lecture (comparaison par id)
      // continuent de le reconnaître.
      id: initial?.id ?? (SYSTEM_KIND_ID[kind] ?? `sec-${Date.now()}`),
      kind,
      title: title.trim(),
      icon,
      ...(kind === 'fields' ? { fields: fields.filter(f => f.label.trim().length > 0) } : {}),
    });
  };
```

(Le spread `...(initial?.locked ? { locked: true } : {})` est retiré — plus rien ne met jamais `locked` à `true`, il devenait mort.)

Remplacer le sélecteur de kind :

```tsx
      {!initial && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['fields', 'note', 'checklist', 'gallery', 'links'] as OverviewSectionKind[])
            .concat(deliverablesAlreadyExists ? [] : ['deliverables'])
            .map(k => (
```

par :

```tsx
      {!initial && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['fields', 'note', 'checklist', 'gallery', 'links'] as OverviewSectionKind[])
            .concat((['deliverables'] as OverviewSectionKind[]).filter(k => !existingSystemIds.includes(SYSTEM_KIND_ID[k]!)))
            .map(k => (
```

(Cette liste ne comprend encore que `deliverables` côté système — `vision`, `invoices`, `files`, `notes` s'y ajoutent à la Task 4 et aux Tasks 5-7, une fois que `KIND_LABEL_KEY`/`KIND_DESC_KEY` ont leurs entrées et que `getDefaultXxxSection()` sait fabriquer un contenu correct pour chacun.)

- [ ] **Step 7 : Mettre à jour l'appelant dans `TravailOverview.tsx`**

Chercher :

```bash
grep -n "deliverablesAlreadyExists=" app/src/screens/TravailOverview.tsx
```

Remplacer :

```tsx
                <OverviewSectionForm onSave={handleAddSection} onCancel={() => setAddingSectionOpen(false)}
                  deliverablesAlreadyExists={customSections.some(s => s.kind === 'deliverables')} />
```

par :

```tsx
                <OverviewSectionForm onSave={handleAddSection} onCancel={() => setAddingSectionOpen(false)}
                  existingSystemIds={customSections.map(s => s.id)} />
```

- [ ] **Step 8 : Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : les erreurs `KIND_LABEL_KEY`/`KIND_DESC_KEY` persistent (Task 1, corrigées Tasks 4-7). Aucune nouvelle erreur.

- [ ] **Step 9 : Vérification manuelle (régression du chantier précédent)**

```bash
cd app && npm run dev
```

Refaire exactement le test du chantier précédent : supprimer Livrables client (menu « ... » → Supprimer) → recharger la page → reste absent. Ré-ajouter via « Ajouter un module » → réapparaît avec l'id canonique `deliverables`. Le supprimer à nouveau → recharger → reste absent. Aucune régression par rapport au comportement déjà vérifié.

- [ ] **Step 10 : Commit**

```bash
git add app/src/screens/TravailOverview.tsx app/src/components/OverviewSectionForm.tsx
git commit -m "refactor(overview): généralise la suppression persistante à tout module système

deliverablesRemoved (booléen) devient removedSystemModules (tableau
d'ids), avec migration de lecture de l'ancien champ. handleDeleteSection
et handleAddSection sont désormais génériques (par id, via
SYSTEM_SECTION_IDS) au lieu d'être spécifiques à Livrables client.
OverviewSectionForm.deliverablesAlreadyExists devient
existingSystemIds — même mécanisme, prêt à accueillir vision/invoices/
files/notes dans les tâches suivantes. Comportement de Livrables client
revérifié identique à avant ce refactor."
```

---

### Task 4 : Vision rejoint pleinement le système (migration, ajout, restauration des champs)

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`
- Modify: `app/src/components/OverviewSectionForm.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes : `SYSTEM_MODULES` (Task 1)
- Produces : migration générique par boucle sur `SYSTEM_MODULES` (remplace l'insertion bespoke de Vision ET de Livrables client dans `applyLoadedContent`)

- [ ] **Step 1 : Migration générique dans `applyLoadedContent`**

Chercher :

```bash
grep -n "let loadedSections = " app/src/screens/TravailOverview.tsx
```

Remplacer tout ce bloc :

```tsx
    let loadedSections = (c.customSections ?? []).some(s => s.id === VISION_SECTION_ID)
      ? (c.customSections ?? [])
      : [getDefaultVisionSection(), ...(c.customSections ?? [])];
    // Ne réinsère le module Livrables client que s'il n'a jamais existé pour ce
    // projet (ancien format) — pas si l'utilisateur l'a explicitement supprimé
    // (deliverablesRemoved), sinon sa suppression n'aurait aucun effet persistant.
    const loadedRemovedSystemModules: string[] = c.removedSystemModules ?? (c.deliverablesRemoved ? [DELIVERABLES_SECTION_ID] : []);
    if (!loadedSections.some(s => s.id === DELIVERABLES_SECTION_ID) && !loadedRemovedSystemModules.includes(DELIVERABLES_SECTION_ID)) {
      const visionIdx = loadedSections.findIndex(s => s.id === VISION_SECTION_ID);
      loadedSections = [
        ...loadedSections.slice(0, visionIdx + 1),
        getDefaultDeliverablesSection(),
        ...loadedSections.slice(visionIdx + 1),
      ];
    }
```

par :

```tsx
    const loadedRemovedSystemModules: string[] = c.removedSystemModules ?? (c.deliverablesRemoved ? [DELIVERABLES_SECTION_ID] : []);
    let loadedSections = c.customSections ?? [];
    // Insère chaque module système qu'un projet n'a jamais eu (absent de
    // customSections ET pas explicitement supprimé) — dans l'ordre canonique de
    // SYSTEM_MODULES entre eux, juste avant le premier module non-système
    // existant (généralement aucun, pour un projet neuf). Ne perturbe jamais
    // l'ordre déjà choisi par l'utilisateur pour des modules système déjà migrés.
    const missingSystemModules = SYSTEM_MODULES.filter(m =>
      !loadedSections.some(s => s.id === m.id) && !loadedRemovedSystemModules.includes(m.id)
    );
    if (missingSystemModules.length > 0) {
      const firstNonSystemIdx = loadedSections.findIndex(s => !SYSTEM_SECTION_IDS.includes(s.id));
      const insertAt = firstNonSystemIdx === -1 ? loadedSections.length : firstNonSystemIdx;
      loadedSections = [
        ...loadedSections.slice(0, insertAt),
        ...missingSystemModules.map(m => m.factory()),
        ...loadedSections.slice(insertAt),
      ];
    }
```

Importer `SYSTEM_MODULES` dans l'import existant de `projectContentStore` (à côté de `SYSTEM_SECTION_IDS` ajouté à la Task 3).

**Vérifie que `getDefaultVisionSection` et `getDefaultDeliverablesSection` restent importés** (ils ne sont plus appelés directement ici, mais `getDefaultVisionSection` est encore utilisé ailleurs dans le fichier — `applyTemplateById`, ligne ~533 — ne pas retirer l'import).

- [ ] **Step 2 : `KIND_LABEL_KEY`/`KIND_DESC_KEY` — ajouter les 4 nouvelles entrées (vision seulement à cette tâche, invoices/files/notes en placeholder minimal pour satisfaire `Record<OverviewSectionKind, string>`, complétées aux Tasks 5-7)**

Dans `app/src/components/OverviewSectionForm.tsx`, remplacer :

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

par :

```tsx
const KIND_LABEL_KEY: Record<OverviewSectionKind, string> = {
  fields: 'overview.sectionKindFields',
  note: 'overview.sectionKindNote',
  vision: 'overview.sectionKindVision',
  deliverables: 'overview.sectionKindDeliverables',
  checklist: 'overview.sectionKindChecklist',
  gallery: 'overview.sectionKindGallery',
  links: 'overview.sectionKindLinks',
  invoices: 'overview.sectionKindInvoices',
  files: 'overview.sectionKindFiles',
  notes: 'overview.sectionKindNotes',
};
const KIND_DESC_KEY: Record<OverviewSectionKind, string> = {
  fields: 'overview.sectionKindFieldsDesc',
  note: 'overview.sectionKindNoteDesc',
  vision: 'overview.sectionKindVisionDesc',
  deliverables: 'overview.sectionKindDeliverablesDesc',
  checklist: 'overview.sectionKindChecklistDesc',
  gallery: 'overview.sectionKindGalleryDesc',
  links: 'overview.sectionKindLinksDesc',
  invoices: 'overview.sectionKindInvoicesDesc',
  files: 'overview.sectionKindFilesDesc',
  notes: 'overview.sectionKindNotesDesc',
};
```

(Les clés `sectionKindInvoices(Desc)`/`sectionKindFiles(Desc)`/`sectionKindNotes(Desc)` sont ajoutées aux locales dès cette étape avec leur texte final — seul leur usage dans le sélecteur de kind arrive aux Tasks 5-7, mais `Record<OverviewSectionKind, string>` exige les 10 clés dès maintenant pour compiler.)

- [ ] **Step 3 : Offrir « Vision du projet » dans le sélecteur + restaurer sa structure de champs fixe à la création**

Dans `app/src/components/OverviewSectionForm.tsx`, remplacer :

```tsx
          {(['fields', 'note', 'checklist', 'gallery', 'links'] as OverviewSectionKind[])
            .concat((['deliverables'] as OverviewSectionKind[]).filter(k => !existingSystemIds.includes(SYSTEM_KIND_ID[k]!)))
            .map(k => (
```

par :

```tsx
          {(['fields', 'note', 'checklist', 'gallery', 'links'] as OverviewSectionKind[])
            .concat((['vision', 'deliverables'] as OverviewSectionKind[]).filter(k => !existingSystemIds.includes(SYSTEM_KIND_ID[k]!)))
            .map(k => (
```

Puis, importer `getDefaultVisionSection` :

```tsx
import { SYSTEM_KIND_ID, getDefaultVisionSection, type CustomOverviewSection, type OverviewFieldDef, type OverviewSectionKind } from '../data/projectContentStore';
```

Et remplacer `handleSave` pour restaurer la structure fixe de Vision à la création (pas à l'édition — éditer ne fait que renommer) :

```tsx
  const handleSave = () => {
    if (!canSave) return;
    onSave({
      // Un module système (vision/deliverables/invoices/files/notes) garde
      // toujours son id canonique même recréé après suppression, pour que
      // handleDeleteSection/la migration à la lecture (comparaison par id)
      // continuent de le reconnaître.
      id: initial?.id ?? (SYSTEM_KIND_ID[kind] ?? `sec-${Date.now()}`),
      kind,
      title: title.trim(),
      icon,
      ...(kind === 'fields' ? { fields: fields.filter(f => f.label.trim().length > 0) } : {}),
    });
  };
```

par :

```tsx
  const handleSave = () => {
    if (!canSave) return;
    if (!initial && kind === 'vision') {
      // Vision garde toujours sa structure de champs fixe (concept, tonalité,
      // public cible, objectifs, références) — elle n'est pas redéfinissable
      // via l'éditeur de champs générique. Seuls le titre et l'icône sont
      // personnalisables à la (re)création.
      onSave({ ...getDefaultVisionSection(), title: title.trim(), icon });
      return;
    }
    onSave({
      id: initial?.id ?? (SYSTEM_KIND_ID[kind] ?? `sec-${Date.now()}`),
      kind,
      title: title.trim(),
      icon,
      ...(kind === 'fields' ? { fields: fields.filter(f => f.label.trim().length > 0) } : {}),
    });
  };
```

- [ ] **Step 4 : Clés i18n**

`app/src/locales/fr.json`, namespace `overview` (chercher `"sectionKindDeliverables"` pour se repérer) :

```json
    "sectionKindVision": "Vision du projet",
    "sectionKindVisionDesc": "5 champs guidés : concept créatif, tonalité, public cible, objectifs, références.",
    "sectionKindInvoices": "Factures",
    "sectionKindInvoicesDesc": "Résumé de facturation et liste des factures du projet.",
    "sectionKindFiles": "Fichiers",
    "sectionKindFilesDesc": "Les fichiers les plus récents du projet.",
    "sectionKindNotes": "Notes internes",
    "sectionKindNotesDesc": "Une zone de texte libre, pour l'équipe uniquement.",
```

`app/src/locales/en.json`, même emplacement :

```json
    "sectionKindVision": "Project vision",
    "sectionKindVisionDesc": "5 guided fields: creative concept, tone, target audience, goals, references.",
    "sectionKindInvoices": "Invoices",
    "sectionKindInvoicesDesc": "Billing summary and the project's invoice list.",
    "sectionKindFiles": "Files",
    "sectionKindFilesDesc": "The project's most recent files.",
    "sectionKindNotes": "Internal notes",
    "sectionKindNotesDesc": "A free text area, team-only.",
```

- [ ] **Step 5 : Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : zéro erreur — toutes les entrées `Record<OverviewSectionKind, string>` sont maintenant complètes.

- [ ] **Step 6 : Vérification manuelle**

```bash
cd app && npm run dev
```

1. Ouvrir un projet existant → Vision affiche toujours ses 5 champs avec leur contenu (migration silencieuse, aucun changement visible).
2. Menu « ... » de Vision → Renommer → changer le titre en « Contexte créatif » → Enregistrer → le titre change, les 5 champs restent inchangés.
3. Glisser Vision plus bas dans la liste → recharger → sa nouvelle position persiste (elle n'est plus jamais forcée en premier).
4. Supprimer Vision → elle disparaît → recharger → reste absente.
5. « Ajouter un module » → « Vision du projet » apparaît dans les choix (puisqu'elle a été supprimée) → la sélectionner, taper un titre, Enregistrer → les 5 champs (Concept créatif, Tonalité, Public cible, Objectifs, Références) réapparaissent vides mais avec leurs bons libellés — pas un éditeur de champs personnalisables.
6. Remplir un des 5 champs, le supprimer à nouveau, le ré-ajouter → le contenu tapé est toujours là (jamais perdu, contrairement à un module « Champs personnalisés » ordinaire).

- [ ] **Step 7 : Commit**

```bash
git add app/src/screens/TravailOverview.tsx app/src/components/OverviewSectionForm.tsx app/src/locales
git commit -m "feat(overview): Vision rejoint pleinement le système de modules

Migration généralisée : une seule boucle sur SYSTEM_MODULES insère chaque
module système manquant (dans l'ordre canonique, entre eux) au lieu des
deux insertions bespoke précédentes (Vision toujours en tête, Livrables
client juste après). Vision devient déplaçable, renommable et
supprimable comme les autres — le sélecteur 'Ajouter un module' la
propose désormais quand elle est absente, et sa structure de 5 champs
fixes est restaurée automatiquement à la recréation (pas redéfinissable
via l'éditeur de champs générique, seul le titre l'est)."
```

---

### Task 5 : Factures rejoint le système de modules

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes : `getDefaultInvoicesSection`, `INVOICES_SECTION_ID` (Task 1)
- Produces : `InvoicesModuleBody({ invoices, totalInvoiced, totalPaid, onOpenInvoice, onStatusChange })`

- [ ] **Step 1 : Extraire `InvoicesModuleBody`**

Ajouter, à côté de `GalleryModuleBody`/`LinksModuleBody` (même fichier, avant `export function TravailOverview()`) :

```tsx
function InvoicesModuleBody({ invoices, totalInvoiced, totalPaid, onOpenInvoice, onStatusChange }: {
  invoices: Invoice[]; totalInvoiced: number; totalPaid: number;
  onOpenInvoice: () => void; onStatusChange: (invoiceId: string, status: Invoice['status']) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {[
          { label: t('overview.totalInvoiced'), value: `${totalInvoiced.toLocaleString('fr-CA')} $`, color: 'var(--text)' },
          { label: t('overview.received'),      value: `${totalPaid.toLocaleString('fr-CA')} $`,     color: 'var(--ok)' },
          { label: t('overview.pending'),       value: `${(totalInvoiced - totalPaid).toLocaleString('fr-CA')} $`, color: 'var(--warn)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '12px 18px', borderRight: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>
      {invoices.length === 0 ? (
        <div style={{ padding: '24px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('overview.noInvoices')}</p>
        </div>
      ) : invoices.map((inv, i) => (
        <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
          onClick={onOpenInvoice}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name="file-text" size={15} color="var(--text-3)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{inv.number}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{inv.title}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('overview.dueDate', { date: formatFileDate(inv.dueDate) })}</p>
          </div>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{inv.total.toLocaleString('fr-CA')} $</span>
          <span onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
            <StatusPill status={inv.status} onChange={s => onStatusChange(inv.id, s)} />
          </span>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 2 : Retirer le bloc Factures codé en dur**

Chercher `{/* ── Factures ── */}` et retirer tout le bloc, du commentaire jusqu'au `</Card>` fermant inclus (visible dans le contexte ci-dessous — ne retire QUE ce bloc, pas ce qui suit) :

```tsx
          {/* ── Factures ── */}
          <Card title={t('overview.invoicesTitle')} icon="receipt" action={<SFButton variant="ghost" size="sm" icon="plus" onClick={() => navigate(`/projets/${project.id}/finances`)}>{t('overview.newInvoice')}</SFButton>}>
            {/* Summary strip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid var(--border)' }}>
              {[
                { label: t('overview.totalInvoiced'), value: `${totalInvoiced.toLocaleString('fr-CA')} $`, color: 'var(--text)' },
                { label: t('overview.received'),      value: `${totalPaid.toLocaleString('fr-CA')} $`,     color: 'var(--ok)' },
                { label: t('overview.pending'),       value: `${(totalInvoiced - totalPaid).toLocaleString('fr-CA')} $`, color: 'var(--warn)' },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 18px', borderRight: '1px solid var(--border)' }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
            {invoices.length === 0 ? (
              <div style={{ padding: '24px 18px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('overview.noInvoices')}</p>
              </div>
            ) : invoices.map((inv, i) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onClick={() => navigate(`/projets/${project.id}/finances`)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name="file-text" size={15} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{inv.number}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{inv.title}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('overview.dueDate', { date: formatFileDate(inv.dueDate) })}</p>
                </div>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{inv.total.toLocaleString('fr-CA')} $</span>
                <span onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                  <StatusPill status={inv.status} onChange={s => setInvoiceStatus(inv.id, s)} />
                </span>
              </div>
            ))}
          </Card>
```

- [ ] **Step 3 : Ajouter la branche `invoices` dans la boucle `customSections.map`**

Dans le rendu générique (`section.kind === 'note' ? ... : (section.kind === 'fields' || section.kind === 'vision') ? ... : section.kind === 'checklist' ? ... : section.kind === 'gallery' ? ... : section.kind === 'links' ? ... : null`), ajouter une branche `invoices` juste avant le `: null` final :

```tsx
                ) : section.kind === 'links' ? (
                  <LinksModuleBody
                    linkedIds={(customSectionData[section.id] as string[]) ?? []}
                    resources={resources}
                    onChange={next => setCustomSectionData(prev => ({ ...prev, [section.id]: next }))}
                    onOpen={rid => navigate(`/projets/${project.id}/ressources/${rid}`)}
                  />
                ) : null}
```

devient :

```tsx
                ) : section.kind === 'links' ? (
                  <LinksModuleBody
                    linkedIds={(customSectionData[section.id] as string[]) ?? []}
                    resources={resources}
                    onChange={next => setCustomSectionData(prev => ({ ...prev, [section.id]: next }))}
                    onOpen={rid => navigate(`/projets/${project.id}/ressources/${rid}`)}
                  />
                ) : section.kind === 'invoices' ? (
                  <InvoicesModuleBody
                    invoices={invoices}
                    totalInvoiced={totalInvoiced}
                    totalPaid={totalPaid}
                    onOpenInvoice={() => navigate(`/projets/${project.id}/finances`)}
                    onStatusChange={(invoiceId, status) => setInvoiceStatus(invoiceId, status)}
                  />
                ) : null}
```

Le `<div style={{ padding: '14px 18px' }}>` qui enveloppe ce ternary doit devenir conditionnel — `invoices` ne veut aucun padding (son résumé et ses lignes bordent déjà les bords de la carte) :

Chercher `<div style={{ padding: '14px 18px' }}>` juste avant ce ternary et remplacer par :

```tsx
              <div style={{ padding: section.kind === 'invoices' ? 0 : '14px 18px' }}>
```

- [ ] **Step 4 : Ajouter le bouton « Nouvelle facture » et brancher le menu système sur cette branche**

Cette branche est rendue par la `<Card>` générique (celle de Task 2, Step 3, avec `action={<SectionOptionsMenu .../>}`). Ajouter le bouton spécifique aux factures avant le menu, en remplaçant :

```tsx
              action={
                <SectionOptionsMenu
                  open={sectionMenuOpenId === section.id}
                  onToggle={() => setSectionMenuOpenId(sectionMenuOpenId === section.id ? null : section.id)}
                  onRename={() => { setEditingSectionId(section.id); setSectionMenuOpenId(null); }}
                  onDelete={() => handleDeleteSection(section.id)}
                />
              }
```

par :

```tsx
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {section.kind === 'invoices' && (
                    <SFButton variant="ghost" size="sm" icon="plus" onClick={() => navigate(`/projets/${project.id}/finances`)}>{t('overview.newInvoice')}</SFButton>
                  )}
                  <SectionOptionsMenu
                    open={sectionMenuOpenId === section.id}
                    onToggle={() => setSectionMenuOpenId(sectionMenuOpenId === section.id ? null : section.id)}
                    onRename={() => { setEditingSectionId(section.id); setSectionMenuOpenId(null); }}
                    onDelete={() => handleDeleteSection(section.id)}
                  />
                </div>
              }
```

- [ ] **Step 5 : Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : zéro erreur.

- [ ] **Step 6 : Vérification manuelle**

```bash
cd app && npm run dev
```

1. Ouvrir un projet avec des factures existantes (session démo) → le module Factures apparaît maintenant DANS la liste des modules (position migrée : après Vision/Livrables client/avant Fichiers puisque Fichiers/Notes internes n'ont pas encore été migrés à cette étape — c'est attendu, ils arrivent aux Tasks 6-7).
2. Résumé (Total facturé/Reçu/En attente) et liste des factures identiques à avant.
3. Cliquer une facture → navigue vers `/projets/:id/finances` comme avant.
4. Changer le statut d'une facture directement dans la liste → fonctionne comme avant.
5. Glisser le module Factures à une autre position → recharger → la position persiste.
6. Supprimer le module Factures → recharger → reste absent → les vraies factures existent toujours dans l'onglet Finance. Ré-ajouter via « Ajouter un module » → « Factures » apparaît dans les choix, le module réapparaît avec les mêmes factures (dérivées de `financeStore`, jamais perdues).
7. Menu « ... » de Factures → Renommer → fonctionne (le titre change, le contenu reste).

- [ ] **Step 7 : Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "feat(overview): Factures rejoint le système de modules

Déplace le bloc Factures (résumé + liste + bouton Nouvelle facture),
jusqu'ici codé en dur hors du système de sections, dans la boucle
customSections.map — extrait en composant InvoicesModuleBody (même
principe que GalleryModuleBody/LinksModuleBody). Déplaçable,
renommable, supprimable sans perte de données (les factures vivent
dans financeStore, jamais dans customSectionData)."
```

> **Correction post-écriture (trouvée en vérification manuelle) :** cette
> Task 5 telle qu'écrite ci-dessus ne mettait PAS à jour le sélecteur
> « Ajouter un module » — `OverviewSectionForm.tsx` n'offrait `invoices`
> nulle part dans sa liste de candidats, donc supprimer Factures rendait le
> module définitivement irrécupérable via l'UI, contredisant la garantie
> « supprimable et ré-ajoutable ». Corrigé par un commit de suivi
> (`fix(overview): offre Factures dans le sélecteur "Ajouter un module"`) :
> dans `app/src/components/OverviewSectionForm.tsx`, la ligne
> `.concat((['vision', 'deliverables'] as OverviewSectionKind[])...)` doit
> devenir `.concat((['vision', 'deliverables', 'invoices'] as OverviewSectionKind[])...)`.
> **Tasks 6 et 7 ci-dessous intègrent déjà cette correction pour `files`/`notes`
> directement dans leur Step 4 — ne pas répéter cette erreur.**

---

### Task 6 : Fichiers rejoint le système de modules

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes : `getDefaultFilesSection`, `FILES_SECTION_ID` (Task 1)
- Produces : `FilesModuleBody({ files, onOpenFile })`

- [ ] **Step 1 : Extraire `FilesModuleBody`**

Ajouter à côté d'`InvoicesModuleBody` :

```tsx
function FilesModuleBody({ files, onOpenFile }: { files: FileItem[]; onOpenFile: () => void }) {
  const { t } = useTranslation();
  return files.length === 0 ? (
    <div style={{ padding: '24px 18px', textAlign: 'center' }}>
      <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('overview.noFiles')}</p>
    </div>
  ) : (
    <>
      {files.map((doc, i) => (
        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < files.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
          onClick={onOpenFile}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name={FILE_TYPE_ICON[doc.type] ?? 'file'} size={15} color="var(--text-3)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{doc.ext.toUpperCase()}{doc.size ? ` · ${formatFileSize(doc.size)}` : ''} · {formatFileDate(doc.updatedAt)}</p>
          </div>
        </div>
      ))}
    </>
  );
}
```

`FileItem` est déjà importé en tête du fichier (utilisé par `const [files, setFiles] = useState<FileItem[]>(...)`) — aucun nouvel import nécessaire.

- [ ] **Step 2 : Retirer le bloc Fichiers codé en dur**

Chercher `{/* ── Fichiers ── */}` et retirer tout le bloc :

```tsx
          {/* ── Fichiers ── */}
          <Card title="Fichiers" icon="folder" action={<SFButton variant="ghost" size="sm" icon="upload" onClick={() => navigate(`/projets/${project.id}/fichiers`)}>Importer</SFButton>}>
            {recentFiles.length === 0 ? (
              <div style={{ padding: '24px 18px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('overview.noFiles')}</p>
              </div>
            ) : recentFiles.map((doc, i) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < recentFiles.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onClick={() => navigate(`/projets/${project.id}/fichiers`)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name={FILE_TYPE_ICON[doc.type] ?? 'file'} size={15} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{doc.ext.toUpperCase()}{doc.size ? ` · ${formatFileSize(doc.size)}` : ''} · {formatFileDate(doc.updatedAt)}</p>
                </div>
              </div>
            ))}
          </Card>
```

- [ ] **Step 3 : Ajouter la branche `files`**

Étendre le ternary (juste après la nouvelle branche `invoices` de la Task 5) :

```tsx
                ) : section.kind === 'invoices' ? (
                  <InvoicesModuleBody
                    invoices={invoices}
                    totalInvoiced={totalInvoiced}
                    totalPaid={totalPaid}
                    onOpenInvoice={() => navigate(`/projets/${project.id}/finances`)}
                    onStatusChange={(invoiceId, status) => setInvoiceStatus(invoiceId, status)}
                  />
                ) : null}
```

devient :

```tsx
                ) : section.kind === 'invoices' ? (
                  <InvoicesModuleBody
                    invoices={invoices}
                    totalInvoiced={totalInvoiced}
                    totalPaid={totalPaid}
                    onOpenInvoice={() => navigate(`/projets/${project.id}/finances`)}
                    onStatusChange={(invoiceId, status) => setInvoiceStatus(invoiceId, status)}
                  />
                ) : section.kind === 'files' ? (
                  <FilesModuleBody
                    files={recentFiles}
                    onOpenFile={() => navigate(`/projets/${project.id}/fichiers`)}
                  />
                ) : null}
```

Et le padding conditionnel (Task 5, Step 3) devient :

```tsx
              <div style={{ padding: (section.kind === 'invoices' || section.kind === 'files') ? 0 : '14px 18px' }}>
```

- [ ] **Step 4 : Bouton « Importer »**

Étendre l'`action` de la Task 5, Step 4 :

```tsx
                  {section.kind === 'invoices' && (
                    <SFButton variant="ghost" size="sm" icon="plus" onClick={() => navigate(`/projets/${project.id}/finances`)}>{t('overview.newInvoice')}</SFButton>
                  )}
```

devient :

```tsx
                  {section.kind === 'invoices' && (
                    <SFButton variant="ghost" size="sm" icon="plus" onClick={() => navigate(`/projets/${project.id}/finances`)}>{t('overview.newInvoice')}</SFButton>
                  )}
                  {section.kind === 'files' && (
                    <SFButton variant="ghost" size="sm" icon="upload" onClick={() => navigate(`/projets/${project.id}/fichiers`)}>{t('overview.importFiles')}</SFButton>
                  )}
```

(`t('overview.importFiles')` remplace le texte en dur `"Importer"` — corrige au passage un manquement à la règle « jamais de texte en dur », clé déjà ajoutée à la Task 1.)

- [ ] **Step 4bis : Offrir « Fichiers » dans le sélecteur « Ajouter un module »**

**Important — ne pas sauter cette étape** (Task 5 l'avait initialement omise pour `invoices`, corrigé après coup en vérification manuelle — voir la note dans Task 5). Dans `app/src/components/OverviewSectionForm.tsx`, chercher la ligne :

```tsx
            .concat((['vision', 'deliverables', 'invoices'] as OverviewSectionKind[]).filter(k => !existingSystemIds.includes(SYSTEM_KIND_ID[k]!)))
```

remplacer par :

```tsx
            .concat((['vision', 'deliverables', 'invoices', 'files'] as OverviewSectionKind[]).filter(k => !existingSystemIds.includes(SYSTEM_KIND_ID[k]!)))
```

(`KIND_LABEL_KEY['files']`/`KIND_DESC_KEY['files']` existent déjà depuis la Task 4 — rien d'autre à ajouter côté locales pour cette étape.)

- [ ] **Step 5 : Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : zéro erreur.

- [ ] **Step 6 : Vérification manuelle**

```bash
cd app && npm run dev
```

Même parcours que Factures (Task 5, Step 6) appliqué à Fichiers : position dans la liste, contenu identique (5 fichiers les plus récents), clic → navigation, glisser-déposer, suppression sans perte des vrais fichiers, réapparition à l'ajout, renommage via le menu.

- [ ] **Step 7 : Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "feat(overview): Fichiers rejoint le système de modules

Même déplacement que Factures (Task 5) : bloc Fichiers extrait en
FilesModuleBody, rejoint la boucle customSections.map. Corrige au
passage un texte en dur (\"Fichiers\", \"Importer\") en clés i18n
(overview.filesTitle, overview.importFiles)."
```

---

### Task 7 : Notes internes rejoint le système de modules

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes : `getDefaultNotesSection`, `NOTES_SECTION_ID` (Task 1)
- Produces : rien de nouveau exposé (branche inline, pas de composant dédié — contenu trop simple pour le justifier)

- [ ] **Step 1 : Retirer le bloc Notes internes codé en dur**

Chercher `{/* ── Notes internes ── */}` et retirer tout le bloc :

```tsx
          {/* ── Notes internes ── */}
          <Card title="Notes internes" icon="sticky-note">
            <div style={{ padding: '14px 18px' }}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ajouter des notes de projet, contexte, instructions importantes..."
                rows={5}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', colorScheme: 'dark' }}
              />
            </div>
          </Card>
```

- [ ] **Step 2 : Ajouter la branche `notes` dans le ternary**

```tsx
                ) : section.kind === 'files' ? (
                  <FilesModuleBody
                    files={recentFiles}
                    onOpenFile={() => navigate(`/projets/${project.id}/fichiers`)}
                  />
                ) : null}
```

devient :

```tsx
                ) : section.kind === 'files' ? (
                  <FilesModuleBody
                    files={recentFiles}
                    onOpenFile={() => navigate(`/projets/${project.id}/fichiers`)}
                  />
                ) : section.kind === 'notes' ? (
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={t('overview.internalNotesPlaceholder')}
                    rows={5}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', colorScheme: 'dark' }}
                  />
                ) : null}
```

`notes` reçoit le padding standard `14px 18px` (pas 0) — le padding conditionnel de la Task 6 reste tel quel (`(section.kind === 'invoices' || section.kind === 'files') ? 0 : '14px 18px'`), `notes` tombe naturellement dans le `else`.

- [ ] **Step 2bis : Offrir « Notes internes » dans le sélecteur « Ajouter un module »**

Même correction que Task 6, Step 4bis, pour le dernier kind système. Dans `app/src/components/OverviewSectionForm.tsx`, chercher :

```tsx
            .concat((['vision', 'deliverables', 'invoices', 'files'] as OverviewSectionKind[]).filter(k => !existingSystemIds.includes(SYSTEM_KIND_ID[k]!)))
```

remplacer par :

```tsx
            .concat((['vision', 'deliverables', 'invoices', 'files', 'notes'] as OverviewSectionKind[]).filter(k => !existingSystemIds.includes(SYSTEM_KIND_ID[k]!)))
```

Les 5 kinds système sont maintenant tous offerts dans le sélecteur quand ils sont absents du projet.

- [ ] **Step 3 : Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : zéro erreur.

- [ ] **Step 4 : Vérification manuelle**

```bash
cd app && npm run dev
```

1. Le module Notes internes apparaît dans la liste, avec le texte déjà tapé (si existant).
2. Taper du texte → recharger → persiste (comportement inchangé, `ProjectContent.notes`).
3. Glisser Notes internes à une autre position → recharger → la position persiste.
4. Supprimer le module → recharger → reste absent → **le texte n'est pas perdu** : ré-ajouter via « Ajouter un module » → le texte tapé précédemment est toujours là (`ProjectContent.notes` n'est jamais touché par la suppression d'un module, seule sa visibilité change).
5. Menu « ... » → Renommer → fonctionne.

- [ ] **Step 5 : Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "feat(overview): Notes internes rejoint le système de modules

Dernier des 5 modules système à migrer. Contenu trop simple pour
justifier un composant dédié (une textarea liée à ProjectContent.notes,
inchangé) — branche inline dans le ternary de rendu, comme 'note'.
Corrige au passage un texte en dur (\"Notes internes\", placeholder) en
clés i18n déjà ajoutées à la Task 1."
```

---

### Task 8 : Vérification d'ensemble

**Files:** aucun changement de code attendu.

- [ ] **Step 1 : Build complet**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit && npm run build
```

Attendu : zéro erreur TypeScript, build réussi (avertissements de taille de chunk préexistants, sans rapport avec ce chantier).

- [ ] **Step 2 : Parcours complet dans le navigateur**

```bash
cd app && npm run dev
```

1. **Ordre par défaut** : ouvrir un projet dont le localStorage/Supabase ne contient encore aucun des 5 modules système (simuler via la console, voir Step 3) → l'ordre après migration est Vision → Livrables client → Factures → Fichiers → Notes internes → modules personnalisés existants.
2. **Espacement uniforme** : mesurer visuellement (ou via `getBoundingClientRect()` en console) l'espace entre chaque paire de modules adjacents dans la liste — identique partout, plus de saut visible entre Vision/Livrables client et le reste.
3. **Glisser-déposer croisé** : avec les 5 modules système + au moins un module personnalisé présents, glisser Notes internes tout en haut (avant Vision), glisser Factures entre deux modules personnalisés → recharger → l'ordre choisi persiste exactement.
4. **Suppression + réapparition, pour chacun des 5** : supprimer, recharger (reste absent), ré-ajouter via « Ajouter un module », vérifier que le contenu (réel ou restauré) est correct :
   - Vision → 5 champs avec leurs bons libellés, contenu antérieur restauré s'il y en avait.
   - Livrables client → mêmes livrables qu'avant (dérivés de `taskStore`).
   - Factures → mêmes factures qu'avant (dérivées de `financeStore`).
   - Fichiers → mêmes fichiers qu'avant (dérivés de `fileStore`).
   - Notes internes → même texte qu'avant.
5. **Renommage, pour chacun des 5** : menu « ... » → Renommer → changer le titre → Enregistrer → le nouveau titre s'affiche, le contenu du module est intact.
6. **Poignée de glissement** : présente et à gauche de l'icône pour tous les modules sans exception (aucun module verrouillé ne subsiste).
7. **Modèles d'Aperçu (`Modeles.tsx`)** — hors de portée fonctionnelle de ce chantier, vérifier seulement l'absence de régression : ouvrir l'éditeur d'un modèle d'Aperçu, « Ajouter une section » → confirmer que la liste de choix compile et s'affiche sans erreur (elle peut désormais proposer plus de kinds système qu'avant — acceptable, non retouché intentionnellement). Ouvrir « Charger un modèle d'Aperçu » depuis un vrai projet → confirmer que ça fonctionne toujours sans erreur console.

- [ ] **Step 3 : Vérifier la compatibilité avec l'ancien format**

Dans la console du navigateur (session démo), simuler un projet enregistré avant ce chantier (Vision `kind:'fields',locked:true`, seul Livrables client en plus, ancien flag `deliverablesRemoved`) :

```js
const key = Object.keys(localStorage).find(k => k.startsWith('sf_project_content'));
const raw = JSON.parse(localStorage.getItem(key));
const pid = Object.keys(raw)[0];
raw[pid].customSections = [
  { id: 'vision', kind: 'fields', title: 'Vision du projet', icon: 'compass', locked: true, fields: [
    { id: 'concept', label: 'Concept créatif', multiline: true },
    { id: 'tonalite', label: 'Tonalité', multiline: true },
    { id: 'publicCible', label: 'Public cible', multiline: true },
    { id: 'objectifs', label: 'Objectifs', multiline: true },
    { id: 'references', label: 'Références', multiline: true },
  ] },
  { id: 'deliverables', kind: 'deliverables', title: 'Livrables client', icon: 'package' },
];
delete raw[pid].removedSystemModules;
raw[pid].deliverablesRemoved = false;
localStorage.setItem(key, JSON.stringify(raw));
location.reload();
```

Attendu : après rechargement, sans erreur console — Vision affiche toujours ses 5 champs (rendu via la compatibilité `kind === 'fields' || kind === 'vision'`), Factures/Fichiers/Notes internes apparaissent (migrés, insérés après Livrables client puisqu'aucun module personnalisé n'existe dans ce jeu de données simulé), tout est déplaçable/supprimable/renommable normalement dès ce premier chargement.

- [ ] **Step 4 : Commit éventuel**

S'il a fallu corriger quelque chose :

```bash
git add app/src && git commit -m "fix(overview): corrections issues de la vérification d'ensemble"
```

Sinon, rien à committer — la vérification suffit.
