# Conversion de tâches en sous-tâches (clic droit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une action « Convertir en sous-tâche de... » accessible par clic droit (liste et Kanban d'un projet), et supprimer le bouton "..." dupliqué de la vue liste en fusionnant ses options dans le menu clic droit.

**Architecture:** Une fonction `convertTasksToSubtasks` dans `taskStore.ts` (même pattern que `moveTasks` existant) déplace des tâches d'une section vers le champ `subtasks` d'une tâche cible. Un composant partagé `SubtaskTargetPicker` (portail fixe avec recherche) sert de sélecteur de cible, monté une seule fois dans `Travail.tsx` (le composant parent qui héberge à la fois la vue liste et `<TravailBoard>`) et déclenché depuis les deux vues via une prop `onConvertRequest`.

**Tech Stack:** React 19 + TypeScript, pas de state management global (stores singleton avec `subscribe`), style inline avec tokens CSS `var(--...)`, icônes via `SFIcon` (Lucide kebab-case).

## Global Constraints

- Même projet seulement — le picker ne montre que les tâches du projet courant, pas de sélecteur de projet.
- Ne PAS ajouter cette fonctionnalité à `Taches.tsx` (Mes tâches) — exception délibérée documentée dans le spec, à ne pas "corriger" par souci de parité.
- Si une tâche convertie a déjà ses propres `subtasks`, ils voyagent avec elle sans transformation (pas de flatten, pas de blocage).
- `convertTasksToSubtasks` ne vérifie pas que `targetTaskId ∉ taskIds` — c'est la responsabilité de l'appelant (le picker exclut déjà la sélection courante de ses candidats).
- Aucune migration Supabase nécessaire (`subtasks` est déjà dans la colonne jsonb `data` de chaque ligne `tasks`).
- Un seul fichier `app/src/components/SubtaskTargetPicker.tsx`, utilisé par `Travail.tsx` ET `TravailBoard.tsx` — pas de duplication de code entre les deux écrans.
- Style inline `style={{}}` + tokens CSS (`var(--surface-2)`, `var(--border)`, `var(--text-3)`, etc.), `SFIcon` pour les icônes.
- Pas de tests automatisés dans ce projet — vérification via `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, et test manuel au serveur de preview.

---

### Task 1: `convertTasksToSubtasks` dans `taskStore.ts`

**Files:**
- Modify: `app/src/data/taskStore.ts:326` (juste après la fonction `moveTasks`, avant `subscribeStore` à la ligne 328)

**Interfaces:**
- Consumes: `getSections(projectId): SectionData[]` et `setSections(projectId, sections): void` (déjà exportées dans ce même fichier, lignes 182 et 198).
- Produces: `convertTasksToSubtasks(projectId: string, taskIds: string[], targetTaskId: string): void` — utilisée par Task 3 (`Travail.tsx`) et indirectement par Task 4 (`TravailBoard.tsx`, via le picker monté dans `Travail.tsx`).

- [ ] **Step 1: Ajouter la fonction**

Dans `app/src/data/taskStore.ts`, insérer ce bloc immédiatement après la fin de `moveTasks` (ligne 326, juste avant la ligne vide qui précède `export function subscribeStore`) :

```ts
export function convertTasksToSubtasks(projectId: string, taskIds: string[], targetTaskId: string): void {
  const idSet = new Set(taskIds);
  const movedTasks: Task[] = [];
  const withoutMoved = getSections(projectId).map(s => {
    const kept: Task[] = [];
    s.tasks.forEach(t => { if (idSet.has(t.id)) movedTasks.push(t); else kept.push(t); });
    return { ...s, tasks: kept };
  });
  if (!movedTasks.length) return;

  const next = withoutMoved.map(s => ({
    ...s,
    tasks: s.tasks.map(t => t.id === targetTaskId
      ? { ...t, subtasks: [...(t.subtasks ?? []), ...movedTasks] }
      : t),
  }));
  setSections(projectId, next);
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune nouvelle erreur liée à `taskStore.ts` (compare le nombre total d'erreurs avant/après — la fonction n'est pas encore appelée nulle part, donc aucun changement de compte attendu).

- [ ] **Step 3: Commit**

```bash
cd "D:\Vibe Coding\Rush"
git add app/src/data/taskStore.ts
git commit -m "feat(tasks): add convertTasksToSubtasks store function"
```

---

### Task 2: Composant `SubtaskTargetPicker`

**Files:**
- Create: `app/src/components/SubtaskTargetPicker.tsx`

**Interfaces:**
- Consumes: `SFIcon` depuis `../components/ui` (déjà exporté, utilisé partout dans `Travail.tsx`/`TravailBoard.tsx` avec les noms `"git-branch"` et `"search"` — `"search"` est une icône Lucide valide utilisée ailleurs dans le projet pour les barres de recherche).
- Produces: composant exporté `SubtaskTargetPicker` avec la signature exacte :
  ```ts
  interface SubtaskTargetPickerProps {
    pos: { x: number; y: number };
    candidates: Task[];
    onPick: (targetTaskId: string) => void;
    onClose: () => void;
  }
  export function SubtaskTargetPicker(props: SubtaskTargetPickerProps): JSX.Element
  ```
  Utilisé par Task 3 (`Travail.tsx`) — Task 4 (`TravailBoard.tsx`) ne l'importe pas directement, il déclenche seulement le picker déjà monté dans `Travail.tsx` via `onConvertRequest`.

- [ ] **Step 1: Créer le fichier**

Créer `app/src/components/SubtaskTargetPicker.tsx` avec ce contenu complet :

```tsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SFIcon } from './ui';
import type { Task } from '../types';

interface SubtaskTargetPickerProps {
  pos: { x: number; y: number };
  candidates: Task[];
  onPick: (targetTaskId: string) => void;
  onClose: () => void;
}

export function SubtaskTargetPicker({ pos, candidates, onPick, onClose }: SubtaskTargetPickerProps) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = candidates.filter(t => t.title.toLowerCase().includes(query.trim().toLowerCase()));

  const left = Math.min(pos.x, window.innerWidth - 280);
  const top = Math.min(pos.y, window.innerHeight - 320);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed', left, top, width: 260, zIndex: 700,
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <SFIcon name="search" size={13} color="var(--text-3)" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Convertir en sous-tâche de..."
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)' }}
        />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 && (
          <p style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>Aucune tâche disponible</p>
        )}
        {filtered.map(t => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px',
              border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
              fontSize: 13, fontFamily: 'var(--ff-text)', color: 'var(--text)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            {!!t.subtasks?.length && <SFIcon name="git-branch" size={12} color="var(--text-3)" />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune nouvelle erreur (le composant n'est pas encore importé nulle part).

- [ ] **Step 3: Commit**

```bash
cd "D:\Vibe Coding\Rush"
git add app/src/components/SubtaskTargetPicker.tsx
git commit -m "feat(tasks): add SubtaskTargetPicker component"
```

---

### Task 3: `Travail.tsx` — état `convertRequest`, rendu du picker, menu clic droit enrichi, suppression du bouton "..."

**Files:**
- Modify: `app/src/screens/Travail.tsx`
  - imports (ligne 8)
  - `TaskContextMenu` (lignes 344-366)
  - `Section` — signature + forwarding vers `TaskRow` (lignes 972-1002, 1259-1271)
  - `TaskRow` — signature, état, rendu du bouton "..." + menu clic droit (lignes 413-448, 692-738)
  - composant parent — état `convertRequest`, câblage vers `Section`/`TravailBoard`, rendu du picker (lignes 1838-1848, 2133-2153, 2183-2188, 2300+)

**Interfaces:**
- Consumes: `convertTasksToSubtasks(projectId, taskIds, targetTaskId)` de Task 1 ; `SubtaskTargetPicker` de Task 2 ; `multiSelIds: Set<string>`, `sections: SectionData[]`, `setSections`, `getSections`, `project.id` — tous déjà présents dans le composant parent.
- Produces: prop `onConvertRequest?: (task: Task, pos: { x: number; y: number }) => void` sur `TaskRow`, `Section`, et transmise à `TravailBoard` (consommée par Task 4).

- [ ] **Step 1: Importer `convertTasksToSubtasks` et `SubtaskTargetPicker`**

Dans `app/src/screens/Travail.tsx`, remplacer la ligne 8 :

```ts
import { getSections, setSections as setSections_store, subscribeStore, updateTask, moveTask, moveTasks, copyTasks, moveSection, copySection, deleteTask } from '../data/taskStore';
```

par :

```ts
import { getSections, setSections as setSections_store, subscribeStore, updateTask, moveTask, moveTasks, copyTasks, moveSection, copySection, deleteTask, convertTasksToSubtasks } from '../data/taskStore';
```

Et ajouter, juste après la ligne d'import de `TaskPanel` (ligne 21 actuelle, `import { TaskPanel } from '../components/TaskPanel';`) :

```ts
import { SubtaskTargetPicker } from '../components/SubtaskTargetPicker';
```

- [ ] **Step 2: Enrichir `TaskContextMenu`**

Remplacer le bloc complet de `TaskContextMenu` (lignes 344-366 actuelles) par :

```tsx
function TaskContextMenu({ pos, onDelete, onOpen, onMove, onConvert, onClose }: {
  pos: { x: number; y: number };
  onDelete: () => void;
  onOpen: () => void;
  onMove?: () => void;
  onConvert: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  const item = (label: React.ReactNode, action: () => void, danger = false) => (
    <button onClick={() => { action(); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >{label}</button>
  );
  return createPortal(
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 200, padding: '4px 0', overflow: 'hidden' }}>
      {item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>Ouvrir le détail</span></>, onOpen)}
      {onMove && item(<><SFIcon name="move-right" size={13} color="var(--text-3)" /><span>Déplacer vers...</span></>, onMove)}
      {item(<><SFIcon name="git-branch" size={13} color="var(--text-3)" /><span>Convertir en sous-tâche de...</span></>, onConvert)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>Supprimer</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Ajouter `onConvertRequest` à la signature de `Section` et le transmettre à `TaskRow`**

Dans le bloc de props de `Section` (lignes 972-1002 actuelles), ajouter le paramètre à la déstructuration (ligne 976, juste après `onMoveTaskToSection`) :

```ts
function Section({
  label, tasks, completed, selectedTask, onSelectTask, onToggleComplete,
  onDragStart, isDragging, onAddTask, onDelete, onDeleteTask, onMoveSection, onCopySection, onRename,
  projectId, projectName, projectColor, multiSelIds,
  draggedTask, onTaskDragStart, onTaskDrop, onTaskDragEnd, allSections, onMoveTaskToSection, onConvertRequest,
}: {
```

et dans le bloc de types (juste après `onMoveTaskToSection: (task: Task, fromLabel: string, toLabel: string) => void;`, avant le `}) {` de fermeture) :

```ts
  onMoveTaskToSection: (task: Task, fromLabel: string, toLabel: string) => void;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
}) {
```

Puis, dans le rendu de `<TaskRow>` (lignes 1261-1271 actuelles), ajouter la prop en la transmettant telle quelle :

```tsx
              <TaskRow
                task={task}
                selected={selectedTask?.id === task.id}
                multiSelected={multiSelIds.has(task.id)}
                onSelect={onSelectTask}
                onTaskDragStart={() => onTaskDragStart(task)}
                onTaskDragEnd={onTaskDragEnd}
                allSections={allSections}
                onMoveToSection={toLabel => onMoveTaskToSection(task, label, toLabel)}
                onDelete={() => onDeleteTask(task.id)}
                onConvertRequest={onConvertRequest}
              />
```

- [ ] **Step 4: `TaskRow` — ajouter la prop, appeler `onConvertRequest` depuis le menu, supprimer le bouton "..."**

Dans la signature de `TaskRow` (lignes 413-433 actuelles), ajouter `onConvertRequest` à la déstructuration et au bloc de types :

```tsx
function TaskRow({
  task,
  selected,
  multiSelected,
  onSelect,
  onTaskDragStart,
  onTaskDragEnd,
  allSections,
  onMoveToSection,
  onDelete,
  onConvertRequest,
}: {
  task: Task;
  selected: boolean;
  onSelect: (t: Task, e?: React.MouseEvent) => void;
  multiSelected?: boolean;
  onTaskDragStart?: () => void;
  onTaskDragEnd?: () => void;
  allSections?: SectionData[];
  onMoveToSection?: (toSectionLabel: string) => void;
  onDelete?: () => void;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
}) {
```

Ensuite, remplacer le bloc « Delete button + Context menu "..." » (lignes 692-721 actuelles — du commentaire `{/* Delete button — visible on hover */}` jusqu'à la fermeture de la `<div>` du bouton "..." avant `</div>` de la ligne 722, exclue) par la version sans bouton "..." :

```tsx
      {/* Delete button — visible on hover */}
      <button
        onClick={e => { e.stopPropagation(); onDelete?.(); }}
        title="Supprimer la tâche"
        style={{ visibility: hovered ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, display: 'flex', borderRadius: 5, flexShrink: 0 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
      >
        <SFIcon name="trash-2" size={13} />
      </button>
    </div>
```

(Cette dernière `</div>` remplace celle de la ligne 722 actuelle qui fermait le conteneur de la ligne — la structure du conteneur ne change pas, seul le bouton "..." et son `InlineDropdown` associé disparaissent.)

Puis mettre à jour le rendu de `TaskContextMenu` (lignes 731-738 actuelles) pour lui passer `onMove` et `onConvert` :

```tsx
    {showMoveModal && allSections && onMoveToSection && (
      <MoveTaskModal
        task={task}
        sections={allSections}
        onMove={onMoveToSection}
        onClose={() => setShowMoveModal(false)}
      />
    )}
    {ctxPos && (
      <TaskContextMenu
        pos={ctxPos}
        onDelete={() => { onDelete?.(); setCtxPos(null); }}
        onOpen={() => { onSelect(task); setCtxPos(null); }}
        onMove={allSections && allSections.length > 1 ? () => { setCtxPos(null); setShowMoveModal(true); } : undefined}
        onConvert={() => { onConvertRequest(task, ctxPos); setCtxPos(null); }}
        onClose={() => setCtxPos(null)}
      />
    )}
    </>
```

Enfin, dans le type de `open` (ligne 444 actuelle), retirer `'context'` qui ne servait qu'au bouton "..." supprimé :

```ts
  const [open, setOpen] = useState<'priority' | 'assignee' | 'status' | 'dueDate' | null>(null);
```

- [ ] **Step 5: État `convertRequest` + rendu du picker + câblage vers `Section` et `TravailBoard`**

Dans le composant parent, ajouter l'état juste après `const [bulkCopyOpen, setBulkCopyOpen] = useState(false);` (ligne 1840 actuelle) :

```ts
  const [convertRequest, setConvertRequest] = useState<{ taskIds: string[]; pos: { x: number; y: number } } | null>(null);
```

Ajouter la fonction de résolution juste après la définition de `setSections` (après la fermeture de la ligne 1836 `};`, avant `const [selectedTask, setSelectedTask] = useState<Task | null>(null);` à la ligne 1837) :

```ts
  const handleConvertRequest = (task: Task, pos: { x: number; y: number }) => {
    const ids = multiSelIds.has(task.id) && multiSelIds.size > 1 ? [...multiSelIds] : [task.id];
    setConvertRequest({ taskIds: ids, pos });
  };
```

Note : `multiSelIds` est déclaré à la ligne 1838, juste après cet emplacement — en JavaScript/TypeScript une fonction définie avec `const` qui référence une variable déclarée plus bas dans le même scope de composant ne pose problème que si elle est **appelée** avant que `multiSelIds` soit initialisé ; ici `handleConvertRequest` n'est appelée que depuis des handlers de clic (après le rendu complet), donc c'est sûr. Si le linter s'y oppose (`no-use-before-define`), déplacer cette fonction juste après la ligne `const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());` à la place.

Transmettre `onConvertRequest={handleConvertRequest}` à `<TravailBoard>` (dans le bloc de props, lignes 2133-2153 actuelles, juste après `multiSelIds={multiSelIds}` à la ligne 2136) :

```tsx
        <TravailBoard
          sections={visibleSections}
          selectedTask={selectedTask}
          multiSelIds={multiSelIds}
          onConvertRequest={handleConvertRequest}
          onSelectTask={handleSelectTask}
```

Transmettre `onConvertRequest={handleConvertRequest}` à `<Section>` (bloc de props, lignes 2163-2188 actuelles, juste après `multiSelIds={multiSelIds}` à la ligne 2187) :

```tsx
                multiSelIds={multiSelIds}
                onConvertRequest={handleConvertRequest}
              />
```

Enfin, rendre le picker. Ajouter ce bloc juste après la fermeture du bloc « Bulk copy tasks modal » existant (après la ligne 2328 actuelle, `)}`, avant la ligne vide qui suit) :

```tsx
      {/* Convert to subtask picker */}
      {convertRequest && (
        <SubtaskTargetPicker
          pos={convertRequest.pos}
          candidates={sections.flatMap(s => s.tasks).filter(t => !convertRequest.taskIds.includes(t.id))}
          onPick={targetId => {
            convertTasksToSubtasks(project.id, convertRequest.taskIds, targetId);
            setSections(getSections(project.id));
            setMultiSelIds(new Set());
            setConvertRequest(null);
          }}
          onClose={() => setConvertRequest(null)}
        />
      )}
```

- [ ] **Step 6: Vérifier la compilation**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune nouvelle erreur par rapport à la référence avant cette tâche (relever le nombre total d'erreurs juste avant de commencer cette tâche, comparer après). Corriger toute erreur de câblage de props avant de continuer.

- [ ] **Step 7: Vérifier le lint**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run lint`
Expected: aucune nouvelle erreur/avertissement par rapport à la référence (le retrait de l'état `open === 'context'` et de `InlineDropdown` dans `TaskRow` ne doit laisser aucun import ou variable inutilisé — vérifier notamment que `InlineDropdown` reste utilisé ailleurs dans le fichier avant de garder son import; sinon le linter le signalera comme inutilisé).

- [ ] **Step 8: Commit**

```bash
cd "D:\Vibe Coding\Rush"
git add app/src/screens/Travail.tsx
git commit -m "feat(tasks): add convert-to-subtask context menu action, remove duplicate '...' menu in list view"
```

---

### Task 4: `TravailBoard.tsx` — menu clic droit enrichi

**Files:**
- Modify: `app/src/screens/TravailBoard.tsx`
  - `CardContextMenu` (lignes 89-157)
  - `Props` interface (lignes 161-177)
  - `TravailBoard` — signature + rendu de `CardContextMenu` (lignes 181-187, 608-618)

**Interfaces:**
- Consumes: prop `onConvertRequest: (task: Task, pos: { x: number; y: number }) => void` transmise depuis `Travail.tsx` (câblée dans Task 3, Step 5).
- Produces: rien de nouveau consommé par d'autres tâches — c'est la dernière modification de code de ce plan.

- [ ] **Step 1: Ajouter `onConvert` à `CardContextMenu`**

Remplacer la signature de `CardContextMenu` (lignes 89-97 actuelles) par :

```tsx
function CardContextMenu({ pos, onOpen, onDelete, onConvert, onClose, sections, currentSectionIdx, onMoveToSection }: {
  pos: { x: number; y: number };
  onOpen: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onClose: () => void;
  sections: SectionData[];
  currentSectionIdx: number;
  onMoveToSection: (toIdx: number) => void;
}) {
```

Puis, dans le rendu (lignes 117-156 actuelles), ajouter l'item « Convertir en sous-tâche de... » juste après le bloc `{item(<>...Ouvrir le détail...</>, onOpen)}` (ligne 119) et avant le bloc `{otherSections.length > 0 && !showMove && (...)}` (ligne 121) :

```tsx
      {item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>{t('tasks.openDetail')}</span></>, onOpen)}
      {item(<><SFIcon name="git-branch" size={13} color="var(--text-3)" /><span>Convertir en sous-tâche de...</span></>, onConvert)}

      {otherSections.length > 0 && !showMove && (
```

- [ ] **Step 2: Ajouter `onConvertRequest` à `Props` et à la signature de `TravailBoard`**

Dans l'interface `Props` (lignes 161-177 actuelles), ajouter le champ juste après `multiSelIds?: Set<string>;` (ligne 164) :

```ts
interface Props {
  sections: SectionData[];
  selectedTask: Task | null;
  multiSelIds?: Set<string>;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
  onSelectTask: (t: Task, e?: React.MouseEvent) => void;
```

Dans la déstructuration de `TravailBoard` (lignes 181-187 actuelles), ajouter le paramètre juste après `multiSelIds,` (ligne 182) :

```tsx
export function TravailBoard({
  sections, selectedTask, multiSelIds, onConvertRequest,
  onSelectTask, onUpdateTask, onToggleSectionComplete,
  onAddTask, onMoveTask, onAddSection,
  onDeleteTask, onDeleteSection, onRenameSection,
  projectId, projectName, projectColor,
}: Props) {
```

- [ ] **Step 3: Câbler `onConvert` dans le rendu de `CardContextMenu`**

Remplacer le bloc de rendu (lignes 608-618 actuelles) par :

```tsx
      {/* Context menu */}
      {ctxMenu && (
        <CardContextMenu
          pos={{ x: ctxMenu.x, y: ctxMenu.y }}
          onOpen={() => { onSelectTask(ctxMenu.task); setCtxMenu(null); }}
          onDelete={() => { onDeleteTask(ctxMenu.task); setCtxMenu(null); }}
          onConvert={() => { onConvertRequest(ctxMenu.task, { x: ctxMenu.x, y: ctxMenu.y }); setCtxMenu(null); }}
          onClose={() => setCtxMenu(null)}
          sections={sections}
          currentSectionIdx={ctxMenu.sectionIdx}
          onMoveToSection={toIdx => { onMoveTask(ctxMenu.task, ctxMenu.sectionIdx, toIdx); setCtxMenu(null); }}
        />
      )}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune nouvelle erreur par rapport à la référence avant cette tâche. En particulier, vérifier qu'aucun autre appelant de `<TravailBoard>` n'existe sans la nouvelle prop obligatoire `onConvertRequest` — `Travail.tsx` est le seul appelant (déjà mis à jour en Task 3, Step 5).

- [ ] **Step 5: Vérifier le lint**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run lint`
Expected: aucune nouvelle erreur/avertissement par rapport à la référence.

- [ ] **Step 6: Commit**

```bash
cd "D:\Vibe Coding\Rush"
git add app/src/screens/TravailBoard.tsx
git commit -m "feat(tasks): add convert-to-subtask context menu action in Kanban view"
```

---

### Task 5: Vérification manuelle end-to-end

**Files:** aucun fichier modifié — vérification uniquement.

**Interfaces:**
- Consumes: l'application complète telle que construite par les Tasks 1-4.
- Produces: rien — dernière tâche du plan.

- [ ] **Step 1: Lancer le serveur de dev**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run dev`
Expected: serveur Vite démarré sur `http://localhost:5173` sans erreur dans la console.

- [ ] **Step 2: Vérifier la vue liste — conversion multiple**

Dans le navigateur, se connecter en session démo, ouvrir un projet ayant au moins 3 tâches dans une même section, vue Liste :
1. Ctrl-clic sur 2 tâches pour les sélectionner (les deux lignes doivent apparaître surlignées).
2. Clic droit sur une des deux tâches sélectionnées → le menu doit afficher : Ouvrir le détail / Déplacer vers... (si plusieurs sections existent) / Convertir en sous-tâche de... / Supprimer.
3. Cliquer « Convertir en sous-tâche de... » → un petit menu de recherche doit apparaître, ancré près du clic, avec un champ de recherche et la liste des autres tâches du projet (les 2 tâches sélectionnées ne doivent PAS apparaître dans cette liste).
4. Cliquer une 3e tâche dans le picker.
Expected: les 2 tâches sélectionnées disparaissent de la section ; ouvrir le détail de la 3e tâche (celle choisie comme cible) doit afficher les 2 tâches dans la section « Sous-tâches » du panneau, avec un badge indiquant 2 sous-tâches sur sa ligne dans la liste (colonne SOUS-TÂCHES).

- [ ] **Step 3: Vérifier que le bouton "..." a disparu de la vue liste**

Survoler n'importe quelle ligne de tâche dans la vue Liste.
Expected: seul le bouton de suppression (icône poubelle) apparaît au survol à droite de la ligne — plus d'icône `ellipsis` (« ... ») ni de menu déroulant associé.

- [ ] **Step 4: Vérifier « Déplacer vers... » toujours fonctionnel depuis le clic droit**

Dans un projet ayant au moins 2 sections, clic droit sur une tâche → « Déplacer vers... » → choisir une autre section.
Expected: la tâche se déplace vers la section choisie, comme avant la suppression du bouton "...".

- [ ] **Step 5: Vérifier la vue Kanban**

Basculer le projet en vue Kanban (bouton de vue en haut de l'écran), clic droit sur une carte de tâche.
Expected: le menu affiche désormais « Convertir en sous-tâche de... » entre « Ouvrir le détail » et « Déplacer vers » ; le choisir puis sélectionner une tâche cible dans le picker fait disparaître la carte de la colonne et l'ajoute aux sous-tâches de la cible (vérifiable en ouvrant son détail).

- [ ] **Step 6: Vérifier l'absence dans Mes tâches**

Ouvrir « Mes tâches » (`/taches`), clic droit sur une tâche.
Expected: aucune option « Convertir en sous-tâche de... » n'apparaît — comportement inchangé par rapport à avant ce plan.

- [ ] **Step 7: Typecheck et lint finaux**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: comptes d'erreurs/avertissements identiques à la référence notée avant le début de ce plan (aucune régression introduite par l'ensemble des 4 tâches précédentes).

- [ ] **Step 8: Commit final si des ajustements ont été faits pendant la vérification**

Si des corrections mineures ont été nécessaires pendant la vérification manuelle (Steps 2-6), les committer :

```bash
cd "D:\Vibe Coding\Rush"
git add -A
git commit -m "fix(tasks): address issues found during manual verification of subtask conversion"
```

Si aucune correction n'a été nécessaire, ne rien committer à cette étape.
