# Sections d'Aperçu personnalisables + modèles d'Aperçu — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la page Aperçu d'un projet personnalisable (champs de Vision, sections ajoutées) et faire de cette structure un modèle indépendant et réutilisable, sélectionnable et changeable comme un `ResourceTemplate` de type `overview`, au même titre que la structure de dossiers (`type: 'file'`).

**Architecture:** Deux petites extensions au modèle de données existant (`ProjectContent` pour les données réelles d'un projet, `ResourceTemplate`/`ResourceTemplateType` pour les modèles réutilisables) plutôt qu'un nouveau système parallèle. Un composant partagé (`OverviewSectionForm`) pour créer/éditer la définition d'une section, réutilisé à la fois dans l'Aperçu d'un projet et dans l'éditeur de modèles.

**Tech Stack:** React 19 + TypeScript, Supabase (une seule colonne ajoutée : `projects.overview_template_id`), aucune nouvelle table.

## Global Constraints

- Pas de tests automatisés dans ce projet — la vérification se fait par `npx tsc --noEmit -p tsconfig.app.json` (0 erreur exigé après chaque tâche) et par usage réel dans le serveur de preview (voir CLAUDE.md).
- Toujours suivre le pattern démo/réel déjà établi : `isDemoSession()` bascule entre localStorage et Supabase, jamais l'un sans l'autre.
- Tous les styles en `style={}` inline avec les tokens CSS (`var(--...)`), jamais de classes Tailwind pour du nouveau contenu dans ce projet.
- Toute nouvelle chaîne de texte visible passe par `t('namespace.key')` — jamais de texte en dur. Ajouter les clés dans `app/src/locales/fr.json` ET `en.json` avant de les utiliser.
- Ne jamais utiliser `<input type="date">` (règle du projet, sans rapport direct ici mais à respecter si un champ de date apparaissait).
- Toute migration Supabase est un fichier écrit dans `docs/superpowers/specs/`, jamais exécutée automatiquement — l'utilisateur doit la coller lui-même dans le SQL Editor.

---

## Task 1 : Types partagés + colonne `overview_template_id`

**Files:**
- Modify: `app/src/data/projectContentStore.ts`
- Modify: `app/src/types/index.ts:43-66` (interface `Project`)
- Modify: `app/src/data/templates.ts:679` (`ResourceTemplateType`), `app/src/data/templates.ts:687-704` (`ResourceTemplate`), `app/src/data/templates.ts:67-79` (`ProjectTemplate`)
- Modify: `app/src/data/projectStore.ts:42-64` (`ProjectRow`), `:66-89` (`toProject`), `:91-115` (`toRow`), `:170-192` (`toRowPatch`)
- Create: `docs/superpowers/specs/2026-07-27-overview-template-column-migration.sql`

**Interfaces:**
- Produces: `OverviewSectionKind`, `OverviewFieldDef`, `CustomOverviewSection` (exportés depuis `app/src/data/projectContentStore.ts`) — tous les tasks suivants les importent de là.
- Produces: `ProjectContent.customSections?: CustomOverviewSection[]`, `ProjectContent.customSectionData?: Record<string, string | Record<string, string>>`.
- Produces: `ResourceTemplateType` inclut désormais `'overview'`. `ResourceTemplate.overviewSections?: CustomOverviewSection[]`.
- Produces: `ProjectTemplate.defaultOverviewTemplateId?: string`. `Project.overviewTemplateId?: string`.

- [ ] **Step 1: Ajouter les types de section personnalisée et étendre `ProjectContent`**

Dans `app/src/data/projectContentStore.ts`, juste après les imports existants, ajouter :

```ts
export type OverviewSectionKind = 'fields' | 'note';

export interface OverviewFieldDef {
  id: string;
  label: string;
  multiline?: boolean;
}

export interface CustomOverviewSection {
  id: string;
  kind: OverviewSectionKind;
  title: string;
  icon: string;
  fields?: OverviewFieldDef[]; // uniquement pour kind: 'fields'
}
```

Puis modifier l'interface `ProjectContent` existante (elle contient déjà `notes?: string; vision?: ProjectVision;`) pour ajouter :

```ts
export interface ProjectContent {
  notes?: string;
  vision?: ProjectVision;
  customSections?: CustomOverviewSection[];
  customSectionData?: Record<string, string | Record<string, string>>;
}
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur liée à `projectContentStore.ts`.

- [ ] **Step 3: Étendre `ResourceTemplateType` et `ResourceTemplate`**

Dans `app/src/data/templates.ts` ligne 679, remplacer :
```ts
export type ResourceTemplateType = 'document' | 'screenplay' | 'video_review' | 'file' | 'moodboard';
```
par :
```ts
export type ResourceTemplateType = 'document' | 'screenplay' | 'video_review' | 'file' | 'moodboard' | 'overview';
```

Dans l'interface `ResourceTemplate` (ligne 687-704), ajouter un champ après `folderStructure?: FolderNode[];` :
```ts
  overviewSections?: CustomOverviewSection[]; // uniquement quand type === 'overview'
```
Ajouter l'import en haut du fichier : `import type { CustomOverviewSection } from './projectContentStore';`

- [ ] **Step 4: Ajouter `defaultOverviewTemplateId` à `ProjectTemplate`**

Dans `app/src/data/templates.ts:67-79`, ajouter un champ après `defaultFolderStructureId?: string;` :
```ts
  defaultOverviewTemplateId?: string;
```

- [ ] **Step 5: Ajouter `overviewTemplateId` à `Project`**

Dans `app/src/types/index.ts:43-66`, ajouter un champ après `folderStructureTemplateId?: string;` :
```ts
  overviewTemplateId?: string;
```

- [ ] **Step 6: Câbler `overviewTemplateId` dans projectStore.ts (même pattern que `folderStructureTemplateId`)**

Dans `app/src/data/projectStore.ts`, ligne 60 (`ProjectRow`), ajouter après `folder_structure_template_id: string | null;` :
```ts
  overview_template_id: string | null;
```

Dans `toProject` (ligne 85), ajouter après `folderStructureTemplateId: row.folder_structure_template_id ?? undefined,` :
```ts
    overviewTemplateId: row.overview_template_id ?? undefined,
```

Dans `toRow` (ligne 110), ajouter après `folder_structure_template_id: p.folderStructureTemplateId ?? null,` :
```ts
    overview_template_id: p.overviewTemplateId ?? null,
```

Dans `toRowPatch` (ligne 187), ajouter après `if (updates.folderStructureTemplateId !== undefined) patch.folder_structure_template_id = updates.folderStructureTemplateId ?? null;` :
```ts
  if (updates.overviewTemplateId !== undefined) patch.overview_template_id = updates.overviewTemplateId ?? null;
```

- [ ] **Step 7: Écrire la migration**

Créer `docs/superpowers/specs/2026-07-27-overview-template-column-migration.sql` :
```sql
-- Backs Project.overviewTemplateId (app/src/types/index.ts) — quel
-- ResourceTemplate de type 'overview' est actuellement appliqué à ce
-- projet. Même nature que folder_structure_template_id (une simple
-- référence texte, pas de contrainte FK car les ResourceTemplate
-- built-in n'ont pas de ligne DB).
--
-- Run once in the Supabase SQL Editor.

alter table projects add column overview_template_id text;
```

- [ ] **Step 8: Vérifier la compilation complète**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : aucune nouvelle erreur par rapport à la baseline (comparer le compte total avant/après si la baseline n'est pas à 0 dans ce checkout).

- [ ] **Step 9: Commit**

```bash
git add app/src/data/projectContentStore.ts app/src/types/index.ts app/src/data/templates.ts app/src/data/projectStore.ts docs/superpowers/specs/2026-07-27-overview-template-column-migration.sql
git commit -m "feat(overview): add CustomOverviewSection types, overview ResourceTemplateType, overviewTemplateId"
```

---

## Task 2 : Composant partagé `OverviewSectionForm` (créer/éditer une définition de section)

**Files:**
- Create: `app/src/components/OverviewSectionForm.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `CustomOverviewSection`, `OverviewFieldDef`, `OverviewSectionKind` (from Task 1, `app/src/data/projectContentStore.ts`).
- Produces: `export function OverviewSectionForm({ initial, onSave, onCancel }: { initial?: CustomOverviewSection; onSave: (section: CustomOverviewSection) => void; onCancel: () => void }): JSX.Element` — un formulaire complet (titre, icône, type de bloc, éditeur de champs si kind === 'fields'), utilisé tel quel par Task 5 (Aperçu) et Task 8 (Modèles).

- [ ] **Step 1: Ajouter les clés i18n**

Dans `app/src/locales/fr.json`, dans le bloc `"overview": { ... }` existant (déjà présent, voir les clés `colDeliverable` etc. ajoutées plus tôt dans ce chantier), ajouter :
```json
    "addSection": "Ajouter une section",
    "sectionTitlePlaceholder": "Titre de la section…",
    "sectionKindFields": "Champs personnalisés",
    "sectionKindNote": "Note libre",
    "sectionKindFieldsDesc": "Une liste de champs texte que tu définis",
    "sectionKindNoteDesc": "Une seule zone de texte libre",
    "addField": "Ajouter un champ",
    "fieldLabelPlaceholder": "Nom du champ…",
    "fieldMultiline": "Texte long",
    "removeField": "Retirer ce champ",
    "sectionEditorSave": "Enregistrer",
    "sectionEditorCancel": "Annuler"
```
Dans `app/src/locales/en.json`, dans le même bloc `"overview"` :
```json
    "addSection": "Add section",
    "sectionTitlePlaceholder": "Section title…",
    "sectionKindFields": "Custom fields",
    "sectionKindNote": "Free note",
    "sectionKindFieldsDesc": "A list of text fields you define",
    "sectionKindNoteDesc": "A single free-text area",
    "addField": "Add field",
    "fieldLabelPlaceholder": "Field name…",
    "fieldMultiline": "Long text",
    "removeField": "Remove this field",
    "sectionEditorSave": "Save",
    "sectionEditorCancel": "Cancel"
```

- [ ] **Step 2: Écrire le composant**

Créer `app/src/components/OverviewSectionForm.tsx` :
```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFButton } from './ui';
import type { CustomOverviewSection, OverviewFieldDef, OverviewSectionKind } from '../data/projectContentStore';

const SECTION_ICONS = ['sticky-note', 'users', 'link', 'target', 'briefcase', 'map-pin', 'phone', 'calendar', 'star', 'flag'];

function makeFieldId(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function OverviewSectionForm({ initial, onSave, onCancel }: {
  initial?: CustomOverviewSection;
  onSave: (section: CustomOverviewSection) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? SECTION_ICONS[0]);
  const [kind, setKind] = useState<OverviewSectionKind>(initial?.kind ?? 'fields');
  const [fields, setFields] = useState<OverviewFieldDef[]>(initial?.fields ?? []);

  const addField = () => setFields(prev => [...prev, { id: makeFieldId(), label: '', multiline: false }]);
  const updateField = (id: string, patch: Partial<OverviewFieldDef>) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id));

  const canSave = title.trim().length > 0 && (kind === 'note' || fields.some(f => f.label.trim().length > 0));

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id ?? `sec-${Date.now()}`,
      kind,
      title: title.trim(),
      icon,
      ...(kind === 'fields' ? { fields: fields.filter(f => f.label.trim().length > 0) } : {}),
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)',
    background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
    outline: 'none', boxSizing: 'border-box', colorScheme: 'dark',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('overview.sectionTitlePlaceholder')} style={inputStyle} autoFocus />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SECTION_ICONS.map(ic => (
          <button key={ic} onClick={() => setIcon(ic)}
            style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1px solid ${icon === ic ? 'var(--accent)' : 'var(--border)'}`, background: icon === ic ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)' }}>
            <SFIcon name={ic} size={14} color={icon === ic ? 'var(--accent)' : 'var(--text-3)'} />
          </button>
        ))}
      </div>

      {!initial && (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['fields', 'note'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)}
              style={{ flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--border)'}`, background: kind === k ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{k === 'fields' ? t('overview.sectionKindFields') : t('overview.sectionKindNote')}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{k === 'fields' ? t('overview.sectionKindFieldsDesc') : t('overview.sectionKindNoteDesc')}</p>
            </button>
          ))}
        </div>
      )}

      {kind === 'fields' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input value={f.label} onChange={e => updateField(f.id, { label: e.target.value })} placeholder={t('overview.fieldLabelPlaceholder')} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => updateField(f.id, { multiline: !f.multiline })} title={t('overview.fieldMultiline')}
                style={{ padding: '6px 8px', borderRadius: 7, border: `1px solid ${f.multiline ? 'var(--accent)' : 'var(--border)'}`, background: f.multiline ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)', cursor: 'pointer', color: f.multiline ? 'var(--accent)' : 'var(--text-3)' }}>
                <SFIcon name="align-left" size={13} />
              </button>
              <button onClick={() => removeField(f.id)} title={t('overview.removeField')}
                style={{ padding: '6px 8px', borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <SFIcon name="x" size={13} />
              </button>
            </div>
          ))}
          <button onClick={addField} style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
            <SFIcon name="plus" size={12} /> {t('overview.addField')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
          {t('overview.sectionEditorCancel')}
        </button>
        <SFButton variant="primary" size="sm" icon="check" disabled={!canSave} onClick={handleSave}>
          {t('overview.sectionEditorSave')}
        </SFButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur liée à `OverviewSectionForm.tsx` (le composant n'est encore importé nulle part, donc pas de vérification visuelle possible à ce stade).

- [ ] **Step 4: Commit**

```bash
git add app/src/components/OverviewSectionForm.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(overview): add shared OverviewSectionForm component"
```

---

## Task 3 : Persistance de l'état ouvert/fermé des cartes de l'Aperçu

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx` (composant local `Card`, ligne ~131-154 avant ce chantier — la ligne exacte peut avoir bougé après les tâches précédentes de ce chantier ; chercher `function Card({`)

**Interfaces:**
- Consumes: `usePersistedState<T>(key: string, fallback: T)` depuis `app/src/hooks/usePersistedState.ts` (déjà existant, signature : retourne `[T, Dispatch<SetStateAction<T>>]`).
- Produces: `Card` accepte un nouveau prop optionnel `persistKey?: string`. Quand fourni, l'état ouvert/fermé est mémorisé sous la clé `sf_overview_section_open_${persistKey}` ; sinon comportement inchangé (`useState(defaultOpen)`).

- [ ] **Step 1: Ajouter la persistance au composant `Card`**

Dans `app/src/screens/TravailOverview.tsx`, ajouter l'import :
```ts
import { usePersistedState } from '../hooks/usePersistedState';
```

Remplacer la fonction `Card` existante :
```tsx
function Card({ children, title, icon, action, collapsible, defaultOpen = true }: {
  children: React.ReactNode; title: string; icon: string; action?: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
```
par :
```tsx
function Card({ children, title, icon, action, collapsible, defaultOpen = true, persistKey }: {
  children: React.ReactNode; title: string; icon: string; action?: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean; persistKey?: string;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [persistedOpen, setPersistedOpen] = usePersistedState(`sf_overview_section_open_${persistKey}`, defaultOpen);
  const open = persistKey ? persistedOpen : localOpen;
  const setOpen = persistKey ? setPersistedOpen : setLocalOpen;
```

(Le reste du corps de `Card` — le `onClick`, le rendu du chevron, `{open && children}` — reste identique, `open`/`setOpen` référencent maintenant soit la version locale soit la version persistée selon que `persistKey` est fourni.)

- [ ] **Step 2: Passer `persistKey` et `defaultOpen: true` sur la carte Vision**

Chercher `<Card title={t('overview.visionTitle')} icon="compass" collapsible defaultOpen={false}>` et remplacer par :
```tsx
<Card title={t('overview.visionTitle')} icon="compass" collapsible defaultOpen={true} persistKey={`${project.id}_vision`}>
```

- [ ] **Step 3: Vérifier dans le navigateur**

Démarrer le serveur de preview (`rush-app` dans `.claude/launch.json`), se connecter avec le compte démo Léa Marchand, aller sur `/projets/pj1/overview`. Vérifier que Vision du projet est dépliée par défaut. Cliquer pour la replier, recharger la page (`Ctrl+Shift+R`) : elle doit rester repliée.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "fix(overview): persist Vision card's open/closed state per user, default to open"
```

---

## Task 4 : Charger/enregistrer `customSections` + `customSectionData`

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes: `getProjectContent(projectId)`, `setProjectContent(projectId, content)` (existants depuis Task précédente de ce chantier, déjà utilisés pour `vision`/`notes`), `CustomOverviewSection` (Task 1).
- Produces: états locaux `customSections: CustomOverviewSection[]` et `customSectionData: Record<string, string | Record<string,string>>`, disponibles pour Task 5/6/7/8 de ce plan.

- [ ] **Step 1: Étendre le chargement/sauvegarde existants**

Dans `app/src/screens/TravailOverview.tsx`, chercher le bloc (ajouté lors du chantier précédent) :
```tsx
  const [vision, setVision] = useState<ProjectVision>(DEFAULT_VISION);
  const [notes, setNotes] = useState('');

  const loadedContentRef = useRef<{ projectId: string; notes: string; vision: ProjectVision } | null>(null);
  useEffect(() => {
    const c = getProjectContent(project.id);
    const loadedVision = c.vision ?? DEFAULT_VISION;
    const loadedNotes = c.notes ?? '';
    setVision(loadedVision);
    setNotes(loadedNotes);
    loadedContentRef.current = { projectId: project.id, notes: loadedNotes, vision: loadedVision };
  }, [project.id]);

  useEffect(() => {
    const loaded = loadedContentRef.current;
    if (!loaded || loaded.projectId !== project.id) return;
    if (loaded.notes === notes && JSON.stringify(loaded.vision) === JSON.stringify(vision)) return;
    const timer = window.setTimeout(() => setProjectContent(project.id, { vision, notes }), 500);
    return () => clearTimeout(timer);
  }, [vision, notes, project.id]);
```

Remplacer entièrement par :
```tsx
  const [vision, setVision] = useState<ProjectVision>(DEFAULT_VISION);
  const [notes, setNotes] = useState('');
  const [customSections, setCustomSections] = useState<CustomOverviewSection[]>([]);
  const [customSectionData, setCustomSectionData] = useState<Record<string, string | Record<string, string>>>({});

  const loadedContentRef = useRef<{
    projectId: string; notes: string; vision: ProjectVision;
    customSections: CustomOverviewSection[]; customSectionData: Record<string, string | Record<string, string>>;
  } | null>(null);

  useEffect(() => {
    const c = getProjectContent(project.id);
    const loadedVision = c.vision ?? DEFAULT_VISION;
    const loadedNotes = c.notes ?? '';
    const loadedSections = c.customSections ?? [];
    const loadedData = c.customSectionData ?? {};
    setVision(loadedVision);
    setNotes(loadedNotes);
    setCustomSections(loadedSections);
    setCustomSectionData(loadedData);
    loadedContentRef.current = { projectId: project.id, notes: loadedNotes, vision: loadedVision, customSections: loadedSections, customSectionData: loadedData };
  }, [project.id]);

  useEffect(() => {
    const loaded = loadedContentRef.current;
    if (!loaded || loaded.projectId !== project.id) return;
    if (
      loaded.notes === notes &&
      JSON.stringify(loaded.vision) === JSON.stringify(vision) &&
      JSON.stringify(loaded.customSections) === JSON.stringify(customSections) &&
      JSON.stringify(loaded.customSectionData) === JSON.stringify(customSectionData)
    ) return;
    const timer = window.setTimeout(() => setProjectContent(project.id, { vision, notes, customSections, customSectionData }), 500);
    return () => clearTimeout(timer);
  }, [vision, notes, customSections, customSectionData, project.id]);
```

Ajouter l'import de `CustomOverviewSection` (et `OverviewFieldDef` pour la prochaine tâche) à la ligne d'import existante :
```ts
import { getProjectContent, setProjectContent, type ProjectVision, type CustomOverviewSection, type OverviewFieldDef } from '../data/projectContentStore';
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur. `customSections`/`customSectionData` ne sont pas encore utilisés dans le rendu — un avertissement "declared but never read" est normal et temporaire, sera résolu par Task 5.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "feat(overview): load/persist customSections and customSectionData"
```

---

## Task 5 : Afficher les sections personnalisées + éditer leurs valeurs

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes: `customSections`, `customSectionData`, `setCustomSectionData` (Task 4).
- Produces: rendu visuel des sections personnalisées dans la colonne gauche, entre la carte Notes internes et la fin de la colonne (aucune section suivante existante à ce stade).

- [ ] **Step 1: Ajouter le rendu des sections personnalisées**

Dans `app/src/screens/TravailOverview.tsx`, juste après la fermeture de la carte **Notes internes** (`</Card>` qui suit le `<textarea>` de notes, avant `</div>` de fin de colonne gauche), ajouter :

```tsx
          {/* ── Sections personnalisées ── */}
          {customSections.map(section => (
            <Card key={section.id} title={section.title} icon={section.icon} collapsible defaultOpen={true} persistKey={`${project.id}_${section.id}`}>
              <div style={{ padding: '14px 18px' }}>
                {section.kind === 'note' ? (
                  <textarea
                    value={(customSectionData[section.id] as string) ?? ''}
                    onChange={e => setCustomSectionData(prev => ({ ...prev, [section.id]: e.target.value }))}
                    rows={5}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', colorScheme: 'dark' }}
                  />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {(section.fields ?? []).map(field => {
                      const values = (customSectionData[section.id] as Record<string, string>) ?? {};
                      const onChange = (v: string) => setCustomSectionData(prev => ({
                        ...prev,
                        [section.id]: { ...(prev[section.id] as Record<string, string> ?? {}), [field.id]: v },
                      }));
                      return (
                        <VisionField
                          key={field.id}
                          label={field.label}
                          placeholder=""
                          value={values[field.id] ?? ''}
                          onChange={onChange}
                          multiline={field.multiline}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          ))}
```

(`VisionField` est le composant local déjà défini plus haut dans ce fichier pour les champs de la carte Vision — réutilisé tel quel.)

- [ ] **Step 2: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur.

- [ ] **Step 3: Vérifier dans le navigateur (injection manuelle temporaire)**

Comme il n'y a pas encore de bouton pour ajouter une section (Task 6), vérifier le rendu en insérant temporairement une section de test via la console du navigateur (à retirer après vérification) :
```js
localStorage.setItem('sf_project_content', JSON.stringify({
  ...JSON.parse(localStorage.getItem('sf_project_content') || '{}'),
  pj1: { customSections: [{ id: 'sec-test', kind: 'note', title: 'Test', icon: 'sticky-note' }], customSectionData: {} },
}));
location.reload();
```
Vérifier que la carte "Test" apparaît sous Notes internes, avec une zone de texte, et que taper dedans puis recharger conserve le texte.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "feat(overview): render custom sections (fields and note kinds) with live persistence"
```

---

## Task 6 : « + Ajouter une section » et menu « ... » (renommer/icône/champs/supprimer)

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `OverviewSectionForm` (Task 2), `customSections`/`setCustomSections`/`customSectionData`/`setCustomSectionData` (Task 4).

- [ ] **Step 1: Ajouter les clés i18n**

Dans `app/src/locales/fr.json`, bloc `"overview"` :
```json
    "editSection": "Modifier la section",
    "renameSection": "Renommer / modifier",
    "deleteSection": "Supprimer la section",
    "confirmDeleteSection": "Supprimer cette section et son contenu ?"
```
Dans `app/src/locales/en.json` :
```json
    "editSection": "Edit section",
    "renameSection": "Rename / edit",
    "deleteSection": "Delete section",
    "confirmDeleteSection": "Delete this section and its content?"
```

- [ ] **Step 2: État local + handlers**

Dans `app/src/screens/TravailOverview.tsx`, ajouter l'import :
```ts
import { OverviewSectionForm } from '../components/OverviewSectionForm';
```

Ajouter, à côté des autres `useState` du composant `TravailOverview` :
```tsx
  const [addingSectionOpen, setAddingSectionOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionMenuOpenId, setSectionMenuOpenId] = useState<string | null>(null);

  const handleAddSection = (section: CustomOverviewSection) => {
    setCustomSections(prev => [...prev, section]);
    setAddingSectionOpen(false);
  };
  const handleEditSection = (updated: CustomOverviewSection) => {
    setCustomSections(prev => prev.map(s => s.id === updated.id ? updated : s));
    setEditingSectionId(null);
  };
  const handleDeleteSection = (id: string) => {
    if (!confirm(t('overview.confirmDeleteSection'))) return;
    setCustomSections(prev => prev.filter(s => s.id !== id));
    setCustomSectionData(prev => { const next = { ...prev }; delete next[id]; return next; });
    setSectionMenuOpenId(null);
  };
```

- [ ] **Step 3: Ajouter le menu « ... » sur chaque section personnalisée**

Dans le bloc écrit à Task 5, modifier l'ouverture de `<Card>` pour lui passer une `action` (menu) — remplacer :
```tsx
            <Card key={section.id} title={section.title} icon={section.icon} collapsible defaultOpen={true} persistKey={`${project.id}_${section.id}`}>
```
par :
```tsx
            <Card key={section.id} title={section.title} icon={section.icon} collapsible defaultOpen={true} persistKey={`${project.id}_${section.id}`}
              action={
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setSectionMenuOpenId(sectionMenuOpenId === section.id ? null : section.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
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
                        <button onClick={() => handleDeleteSection(section.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                          <SFIcon name="trash-2" size={12} /> {t('overview.deleteSection')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              }
            >
```

- [ ] **Step 4: Ajouter le bouton « + Ajouter une section » et les deux modales**

Juste après le `.map(section => ...)` de Task 5 (donc après le `))}` qui ferme la boucle), ajouter :
```tsx
          <button onClick={() => setAddingSectionOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 10, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="plus" size={13} /> {t('overview.addSection')}
          </button>

          {addingSectionOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}
              onMouseDown={e => { if (e.target === e.currentTarget) setAddingSectionOpen(false); }}>
              <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                <OverviewSectionForm onSave={handleAddSection} onCancel={() => setAddingSectionOpen(false)} />
              </div>
            </div>
          )}

          {editingSectionId && (() => {
            const section = customSections.find(s => s.id === editingSectionId);
            if (!section) return null;
            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}
                onMouseDown={e => { if (e.target === e.currentTarget) setEditingSectionId(null); }}>
                <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  <OverviewSectionForm initial={section} onSave={handleEditSection} onCancel={() => setEditingSectionId(null)} />
                </div>
              </div>
            );
          })()}
```

- [ ] **Step 5: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur.

- [ ] **Step 6: Vérifier dans le navigateur**

Sur `/projets/pj1/overview` (compte démo), cliquer « + Ajouter une section », créer une section « Contacts » de type Champs personnalisés avec un champ « Téléphone », enregistrer. Vérifier qu'elle apparaît, que le champ est éditable et persiste après un rechargement complet (`Ctrl+Shift+R`). Ouvrir le menu « ... », renommer la section, vérifier que le titre change. Supprimer la section, confirmer, vérifier qu'elle disparaît et ne réapparaît pas après rechargement.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/TravailOverview.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(overview): add/edit/delete custom sections from the Aperçu page"
```

---

## Task 7 : Modèles d'Aperçu dans l'écran Modèles (`ResourceTemplateType: 'overview'`)

**Files:**
- Modify: `app/src/screens/Modeles.tsx` (plusieurs points d'intégration, listés ci-dessous — chercher chaque motif exact avec Grep avant d'éditer, les numéros de ligne indiqués datent d'avant ce chantier et peuvent avoir légèrement bougé)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `ResourceTemplateType` (Task 1, inclut désormais `'overview'`), `loadAllResourceTemplates()`/`saveCustomResourceTemplates()` (existants, `app/src/data/templates.ts`), `OverviewSectionForm` (Task 2).

- [ ] **Step 1: Ajouter les clés i18n**

Dans `app/src/locales/fr.json`, chercher le bloc contenant `"resTypeFile": "Structure de dossiers"` (ou équivalent — chercher `resTypeFile`) et ajouter juste après :
```json
    "resTypeOverview": "Modèle d'Aperçu",
```
Dans `app/src/locales/en.json`, même emplacement :
```json
    "resTypeOverview": "Overview template",
```

- [ ] **Step 2: Ajouter l'entrée de navigation**

Chercher `{ key: 'file', labelKey: 'models.resTypeFile', icon: 'folder' },` (ligne ~2016) et ajouter juste après :
```ts
  { key: 'overview', labelKey: 'models.resTypeOverview', icon: 'layout-panel-top' },
```

- [ ] **Step 3: Compter les modèles de ce type pour l'affichage du badge**

Chercher `const fileCount = resourceTemplates.filter(t => t.type === 'file').length;` (ligne ~2356) et ajouter juste après :
```ts
            const overviewCount = resourceTemplates.filter(t => t.type === 'overview').length;
```
Chercher `{navItem('file', 'folder', 'Fichiers', fileCount)}` (ligne ~2366) et ajouter juste après :
```tsx
                {navItem('overview', 'layout-panel-top', t('models.resTypeOverview'), overviewCount)}
```

- [ ] **Step 4: Exclure `'overview'` du filtre générique "tous types de ressources" si nécessaire**

Chercher `.filter(r => r.type !== 'file')` (ligne ~1611 — utilisé pour exclure les modèles de structure de dossiers d'une liste qui ne devrait montrer que des ressources "de contenu"). Si ce filtre sert à peupler un sélecteur de ressources pour un modèle de PROJET (pas de fichiers), l'étendre :
```ts
.filter(r => r.type !== 'file' && r.type !== 'overview')
```
Vérifier le contexte exact avec `Grep` avant d'appliquer — ne modifier que si le filtre correspond bien à "ressources de contenu à associer à un projet", pas à un autre usage.

- [ ] **Step 5: Créer un nouveau modèle d'Aperçu**

Chercher le bloc qui gère la création d'un nouveau modèle selon `typeFilter` (ligne ~2248, `if (typeFilter === 'projets') { ... } else if (typeFilter === 'formulaires') { ... }`). Ajouter une branche :
```ts
else if (typeFilter === 'overview') {
  const newTpl: ResourceTemplate = {
    id: `res-${Date.now()}`, type: 'overview', name: 'Nouveau modèle d\'Aperçu', description: '',
    color: '#6366f1', icon: 'layout-panel-top', tags: [], builtIn: false,
    createdAt: new Date().toISOString().split('T')[0], overviewSections: [],
  };
  saveCustomResourceTemplates([...loadCustomResourceTemplates(), newTpl]);
  setSelectedResTpl(newTpl);
}
```
(Adapter le nom exact de la fonction de sélection courante — chercher comment les autres types de ressources définissent leur "template sélectionné pour édition" dans ce fichier, ex. `setSelectedResTpl`/`setPreviewTpl`, et réutiliser le même state.)

- [ ] **Step 6: Éditeur pour un modèle de type `overview`**

Chercher où le contenu de l'éditeur bascule selon `tpl.type` (ex. `{tpl.type === 'file' && (...)}` ligne ~184 et ligne ~1779, `if (type === 'file') return (...)` ligne ~1925). Ajouter une branche équivalente qui rend la liste des `overviewSections` du modèle en cours d'édition, avec un bouton « + Ajouter une section » ouvrant `OverviewSectionForm`, et un menu de suppression par section — même logique que Task 6 mais appliquée à `tpl.overviewSections` au lieu de `customSections`, et sauvegardée via `saveCustomResourceTemplates` (remplacement du tableau complet) au lieu de `setProjectContent`. Exemple pour le point de rendu principal :
```tsx
{tpl.type === 'overview' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
    {(tpl.overviewSections ?? []).map(section => (
      <div key={section.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <SFIcon name={section.icon} size={14} color="var(--text-3)" />
        <span style={{ flex: 1, fontSize: 13 }}>{section.title}</span>
        <button onClick={() => {
          const updated = { ...tpl, overviewSections: (tpl.overviewSections ?? []).filter(s => s.id !== section.id) };
          saveCustomResourceTemplates(loadCustomResourceTemplates().map(t => t.id === tpl.id ? updated : t));
          setSelectedResTpl(updated);
        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
          <SFIcon name="trash-2" size={13} />
        </button>
      </div>
    ))}
    {addingOverviewSection ? (
      <OverviewSectionForm
        onSave={section => {
          const updated = { ...tpl, overviewSections: [...(tpl.overviewSections ?? []), section] };
          saveCustomResourceTemplates(loadCustomResourceTemplates().map(t => t.id === tpl.id ? updated : t));
          setSelectedResTpl(updated);
          setAddingOverviewSection(false);
        }}
        onCancel={() => setAddingOverviewSection(false)}
      />
    ) : (
      <button onClick={() => setAddingOverviewSection(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 9, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
        <SFIcon name="plus" size={12} /> {t('overview.addSection')}
      </button>
    )}
  </div>
)}
```
Ajouter l'état local nécessaire (`const [addingOverviewSection, setAddingOverviewSection] = useState(false);`) et l'import `import { OverviewSectionForm } from '../components/OverviewSectionForm';`.

Adapter les noms exacts (`tpl`, `setSelectedResTpl`, la variable qui contient le modèle en cours d'édition) au code réel du fichier — les noms ci-dessus sont indicatifs, à faire correspondre à ce qui existe déjà pour `'file'`/`'document'`/etc. dans ce même fichier.

- [ ] **Step 7: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur.

- [ ] **Step 8: Vérifier dans le navigateur**

Aller sur `/modeles`, sélectionner la catégorie "Modèle d'Aperçu", créer un nouveau modèle, lui ajouter une section "Contacts" (Champs personnalisés, champ "Téléphone"), enregistrer, recharger la page, vérifier que le modèle et sa section sont toujours là.

- [ ] **Step 9: Commit**

```bash
git add app/src/screens/Modeles.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(models): manage Overview templates (ResourceTemplateType 'overview') in Modèles"
```

---

## Task 8 : Bouton « Changer de modèle d'Aperçu » sur la page Aperçu

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `loadAllResourceTemplates()` (existant, filtré sur `type === 'overview'`), `updateProject` (existant, `app/src/data/projectStore.ts`), `setCustomSections`/`setProjectContent`.

- [ ] **Step 1: Ajouter les clés i18n**

Dans `app/src/locales/fr.json`, bloc `"overview"` :
```json
    "changeOverviewTemplate": "Changer de modèle d'Aperçu",
    "chooseOverviewTemplate": "Choisir un modèle d'Aperçu",
    "overviewTemplateNone": "Aucun modèle (garder tel quel)",
    "confirmChangeOverviewTemplate": "Remplacer les sections personnalisées actuelles par celles de ce modèle ?"
```
Dans `app/src/locales/en.json` :
```json
    "changeOverviewTemplate": "Change Overview template",
    "chooseOverviewTemplate": "Choose an Overview template",
    "overviewTemplateNone": "No template (keep as-is)",
    "confirmChangeOverviewTemplate": "Replace the current custom sections with this template's?"
```

- [ ] **Step 2: Ajouter l'import et l'état**

Ajouter l'import :
```ts
import { loadAllResourceTemplates, type ResourceTemplate } from '../data/templates';
```
Ajouter l'état local, à côté des autres `useState` :
```tsx
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
```

- [ ] **Step 3: Ajouter le bouton et la modale de sélection**

Juste avant le bouton « + Ajouter une section » écrit à Task 6, ajouter :
```tsx
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAddingSectionOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="plus" size={13} /> {t('overview.addSection')}
            </button>
            <button onClick={() => setTemplatePickerOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="layout-panel-top" size={13} /> {t('overview.changeOverviewTemplate')}
            </button>
          </div>

          {templatePickerOpen && (() => {
            const overviewTemplates = loadAllResourceTemplates().filter((tp): tp is ResourceTemplate => tp.type === 'overview');
            const applyTemplate = (tpl: ResourceTemplate | null) => {
              if (!confirm(t('overview.confirmChangeOverviewTemplate'))) return;
              const newSections = tpl?.overviewSections ?? [];
              setCustomSections(newSections);
              setCustomSectionData({});
              updateProject(project.id, { overviewTemplateId: tpl?.id });
              setTemplatePickerOpen(false);
            };
            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}
                onMouseDown={e => { if (e.target === e.currentTarget) setTemplatePickerOpen(false); }}>
                <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, width: 420, maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t('overview.chooseOverviewTemplate')}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => applyTemplate(null)}
                      style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer' }}>
                      {t('overview.overviewTemplateNone')}
                    </button>
                    {overviewTemplates.map(tpl => (
                      <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
                        <SFIcon name={tpl.icon} size={14} color="var(--text-3)" />
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setTemplatePickerOpen(false)} style={{ marginTop: 14, padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', width: '100%' }}>
                    {t('overview.sectionEditorCancel')}
                  </button>
                </div>
              </div>
            );
          })()}
```
Retirer le bouton « + Ajouter une section » dupliqué qui existait déjà seul avant Task 8 (celui écrit à Task 6 Step 4) — il est maintenant regroupé dans le `<div style={{ display: 'flex', gap: 8 }}>` ci-dessus.

- [ ] **Step 4: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur.

- [ ] **Step 5: Vérifier dans le navigateur**

Sur `/projets/pj1/overview`, cliquer « Changer de modèle d'Aperçu », choisir le modèle d'Aperçu créé à Task 7, confirmer, vérifier que ses sections remplacent celles existantes. Recharger la page, vérifier la persistance.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/TravailOverview.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(overview): add template picker to switch a project's Overview structure"
```

---

## Task 9 : Sélection du modèle d'Aperçu à la création d'un projet

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx`

**Interfaces:**
- Consumes: `loadAllResourceTemplates()`, `selectedTemplate.defaultOverviewTemplateId` (Task 1), `setProjectContent` (`app/src/data/projectContentStore.ts`).

- [ ] **Step 1: Ajouter l'état et le pré-remplissage**

Dans `app/src/components/ProjectsListView.tsx`, chercher `const [folderStructTplId, setFolderStructTplId] = useState<string | null>(null);` (ligne ~88) et ajouter juste après :
```ts
  const [overviewTplId, setOverviewTplId] = useState<string | null>(null);
  const overviewTemplates = loadAllResourceTemplates().filter(t => t.type === 'overview');
```

Chercher la fonction `next` (ligne ~111) et dans la branche `if (step === 'start')`, ajouter le pré-remplissage juste après `setFolderStructTplId(selectedTemplate?.defaultFolderStructureId ?? null);` :
```ts
      setOverviewTplId(selectedTemplate?.defaultOverviewTemplateId ?? null);
```

- [ ] **Step 2: Ajouter le sélecteur dans l'étape "fichiers"**

Dans le bloc `{step === 'fichiers' && (...)}` (ligne ~406), après le `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>{folderStructTemplates.map(...)}</div>` existant, ajouter une deuxième liste (même style que celle des dossiers, condensée) :
```tsx
              {overviewTemplates.length > 0 && (
                <>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>
                    {t('models.resTypeOverview')}
                  </p>
                  <div
                    onClick={() => setOverviewTplId(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${overviewTplId === null ? 'var(--accent)' : 'var(--border)'}`, background: overviewTplId === null ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)' }}
                  >
                    <SFIcon name="layout-panel-top" size={16} color="var(--text-3)" />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('overview.overviewTemplateNone')}</span>
                    {overviewTplId === null && <SFIcon name="circle-check" size={16} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                  </div>
                  {overviewTemplates.map(tpl => (
                    <div key={tpl.id} onClick={() => setOverviewTplId(tpl.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${overviewTplId === tpl.id ? 'var(--accent)' : 'var(--border)'}`, background: overviewTplId === tpl.id ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)' }}
                    >
                      <SFIcon name={tpl.icon} size={16} color="var(--text-3)" />
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{tpl.name}</span>
                      {overviewTplId === tpl.id && <SFIcon name="circle-check" size={16} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                    </div>
                  ))}
                </>
              )}
```

- [ ] **Step 3: Appliquer à la création du projet**

Dans la fonction `create` (ligne ~129), dans l'objet `newProject`, ajouter :
```ts
      overviewTemplateId: overviewTplId ?? undefined,
```
Après l'appel à `setSections(projectId, sections);` (et avant `if (folderStructTplId) { ... }`), ajouter :
```ts
    if (overviewTplId) {
      const overviewTpl = loadAllResourceTemplates().find(t => t.id === overviewTplId);
      if (overviewTpl?.overviewSections?.length) {
        setProjectContent(projectId, { customSections: overviewTpl.overviewSections });
      }
    }
```
Ajouter l'import :
```ts
import { setProjectContent } from '../data/projectContentStore';
```

- [ ] **Step 4: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur.

- [ ] **Step 5: Vérifier dans le navigateur**

Créer un nouveau projet, à l'étape "Fichiers", vérifier que la liste des modèles d'Aperçu apparaît sous celle des structures de dossiers, en sélectionner un, terminer la création. Ouvrir l'Aperçu du nouveau projet, vérifier que ses sections personnalisées sont bien celles du modèle choisi.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ProjectsListView.tsx
git commit -m "feat(projects): let new-project wizard pick an Overview template"
```

---

## Task 10 : Rendre les champs de Vision eux-mêmes renommables/ajoutables/supprimables

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes: `CustomOverviewSection`, `OverviewFieldDef` (Task 1), `OverviewSectionForm` (Task 2), `customSections`/`setCustomSections`/`customSectionData`/`setCustomSectionData` (Task 4/5).
- Produces: la carte "Vision du projet" devient un rendu spécial de la PREMIÈRE entrée de `customSections` (id fixe `'vision'`), non supprimable dans son ensemble mais dont les champs sont éditables via le même `OverviewSectionForm` que les autres sections. `ProjectVision`/`vision` (l'ancien stockage dédié) est abandonné au profit de `customSectionData['vision']`, avec migration automatique à la lecture pour ne pas perdre les données déjà saisies durant les tâches précédentes de ce chantier.

Vision était jusqu'ici un type figé (`ProjectVision` : concept/tonalité/publicCible/objectifs/references) stocké séparément. Cette tâche l'unifie avec le système de sections personnalisées : Vision devient la première section de `customSections`, avec un indicateur `locked: true` qui empêche sa suppression complète (mais pas l'édition de ses champs), pour que "personnaliser les champs de Vision" et "ajouter des sections" soient un seul et même mécanisme au lieu de deux.

- [ ] **Step 1: Ajouter `locked` à `CustomOverviewSection` et une constante pour la Vision par défaut**

Dans `app/src/data/projectContentStore.ts`, modifier l'interface ajoutée à Task 1 :
```ts
export interface CustomOverviewSection {
  id: string;
  kind: OverviewSectionKind;
  title: string;
  icon: string;
  fields?: OverviewFieldDef[];
  locked?: boolean; // ne peut pas être supprimée dans son ensemble (ex. Vision du projet) — ses champs restent éditables
}
```
Retirer l'interface `ProjectVision` si elle est encore définie dans ce fichier (elle ne l'est pas — `ProjectVision` vit dans `app/src/screens/TravailOverview.tsx` d'après le chantier précédent ; vérifier avec `Grep 'interface ProjectVision'` et la retirer de son fichier d'origine à l'étape suivante).

- [ ] **Step 2: Retirer `ProjectVision`/`vision` de `ProjectContent`, ajouter la constante `VISION_SECTION`**

Dans `app/src/data/projectContentStore.ts`, retirer `vision?: ProjectVision;` de l'interface `ProjectContent` (elle devient une section normale dans `customSections`/`customSectionData`, plus un champ dédié).

Ajouter, exporté depuis ce même fichier :
```ts
export const VISION_SECTION_ID = 'vision';

export const DEFAULT_VISION_SECTION: CustomOverviewSection = {
  id: VISION_SECTION_ID,
  kind: 'fields',
  title: 'Vision du projet',
  icon: 'compass',
  locked: true,
  fields: [
    { id: 'concept', label: 'Concept créatif', multiline: true },
    { id: 'tonalite', label: 'Tonalité', multiline: true },
    { id: 'publicCible', label: 'Public cible', multiline: true },
    { id: 'objectifs', label: 'Objectifs', multiline: true },
    { id: 'references', label: 'Références', multiline: true },
  ],
};
```

- [ ] **Step 3: Migration à la lecture (garder les données Vision déjà saisies)**

Toujours dans `app/src/data/projectContentStore.ts`, modifier `getProjectContent` pour que, si le contenu chargé a encore l'ancienne forme `{ vision: {...} }` (d'un projet sauvegardé avant cette tâche) mais pas encore de section `'vision'` dans `customSections`, les données soient migrées à la volée :

```ts
export function getProjectContent(projectId: string): ProjectContent {
  const raw = isDemoSession() ? (_demoContent[projectId] ?? {}) : (ensureFetchStarted(projectId), _supabaseContent[projectId] ?? {});
  return migrateLegacyVision(raw);
}

// Ancien format (avant cette tâche) : { vision: { concept, tonalite, publicCible, objectifs, references } }.
// Nouveau format : une entrée customSections avec id VISION_SECTION_ID + les valeurs dans
// customSectionData[VISION_SECTION_ID]. Purement une lecture de confort — n'écrit rien ;
// le prochain setProjectContent() persistera la nouvelle forme naturellement.
function migrateLegacyVision(content: ProjectContent & { vision?: Record<string, string> }): ProjectContent {
  const legacyVision = content.vision;
  const hasSection = (content.customSections ?? []).some(s => s.id === VISION_SECTION_ID);
  if (!legacyVision || hasSection) return content;
  return {
    ...content,
    customSections: [DEFAULT_VISION_SECTION, ...(content.customSections ?? [])],
    customSectionData: { ...content.customSectionData, [VISION_SECTION_ID]: legacyVision },
  };
}
```

(Adapter le corps réel de `getProjectContent` existant — cette étape ne fait qu'ENVELOPPER son retour actuel avec `migrateLegacyVision`, pas le réécrire depuis zéro ; vérifier avec `Read` la forme exacte avant d'éditer.)

- [ ] **Step 4: Toujours garantir une section Vision présente**

Dans `app/src/screens/TravailOverview.tsx`, dans l'effet qui charge le contenu (Task 4 Step 1), après `const loadedSections = c.customSections ?? [];`, garantir que la Vision est toujours en première position même pour un projet tout neuf sans aucun contenu :
```ts
    const loadedSections = (c.customSections ?? []).some(s => s.id === VISION_SECTION_ID)
      ? (c.customSections ?? [])
      : [DEFAULT_VISION_SECTION, ...(c.customSections ?? [])];
```
Ajouter l'import : `import { VISION_SECTION_ID, DEFAULT_VISION_SECTION } from '../data/projectContentStore';`

Retirer entièrement l'ancien état `vision`/`setVision`, la constante `DEFAULT_VISION`, l'interface `ProjectVision` (si encore présente dans ce fichier) et la carte Vision codée en dur (`<Card title={t('overview.visionTitle')} icon="compass" ...>` avec ses 5 `<VisionField>`) — elle est maintenant rendue par la boucle générique `customSections.map(...)` de Task 5, puisque Vision est désormais juste la première entrée de `customSections`.

- [ ] **Step 5: Empêcher la suppression d'une section `locked`, autoriser l'édition de ses champs**

Dans le menu « ... » ajouté à Task 6 Step 3, conditionner le bouton de suppression :
```tsx
                        {!section.locked && (
                          <button onClick={() => handleDeleteSection(section.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                            <SFIcon name="trash-2" size={12} /> {t('overview.deleteSection')}
                          </button>
                        )}
```
Dans `OverviewSectionForm` (Task 2), le formulaire d'édition (`initial` fourni) fonctionne déjà pour renommer/ajouter/retirer des champs quel que soit `locked` — aucun changement nécessaire là, `locked` ne concerne que la suppression de la section entière, gérée au niveau de l'appelant.

- [ ] **Step 6: Vérifier la compilation**

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur. Si `ProjectVision` est encore référencé ailleurs dans le code (chercher avec `Grep 'ProjectVision'` dans tout `app/src`), corriger chaque site avant de considérer cette tâche terminée.

- [ ] **Step 7: Vérifier dans le navigateur**

Sur un projet démo ayant déjà des données Vision saisies avant cette tâche (si aucun projet de test n'en a, en saisir d'abord avant Task 10, recharger pour confirmer la sauvegarde, PUIS appliquer Task 10) : recharger la page après l'implémentation, vérifier que le contenu déjà saisi dans Concept/Tonalité/etc. est toujours affiché (migration réussie). Ouvrir le menu « ... » de la carte Vision : vérifier qu'il n'y a pas d'option Supprimer, mais que "Renommer / modifier" ouvre l'éditeur avec les 5 champs existants, permet d'en ajouter un 6e, d'en renommer un, et d'en retirer un — puis vérifier la persistance après rechargement.

- [ ] **Step 8: Commit**

```bash
git add app/src/data/projectContentStore.ts app/src/screens/TravailOverview.tsx
git commit -m "feat(overview): make Vision's own fields editable by unifying it into customSections"
```

---

## Self-Review (à faire par l'implémenteur avant de considérer le plan terminé)

- Comparer chaque décision du spec (`docs/superpowers/specs/2026-07-27-overview-templates-design.md`) à une tâche de ce plan : Vision dépliée par défaut (Task 3), état persistant (Task 3), personnalisation des champs de Vision (Task 10), bibliothèque de sections (Task 2/5/6), modèle d'Aperçu indépendant référencé (Task 1/7), changement post-création (Task 8), sélection à la création (Task 9) — tous couverts.
- Aucune migration de table — seule `overview_template_id` (Task 1) — conforme au spec corrigé.
- Task 10 doit s'exécuter après Task 6 (dépend du menu « ... ») et Task 9 (le champ `locked` doit exister avant que Task 9 puisse copier des sections de modèle sans risquer d'en marquer une verrouillée par erreur — en pratique aucun modèle d'Aperçu ne doit jamais définir `locked: true` sur ses propres sections, seule `DEFAULT_VISION_SECTION` l'utilise).
