# Assignation multiple des tâches — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'assigner une tâche à plusieurs personnes à égalité, avec une seule case « terminée » partagée.

**Architecture :** `Task.assignee: User | null` devient `Task.assignees: User[]`. Les tâches sont stockées en JSON dans une colonne unique, donc aucune migration Supabase : une fonction `normalizeTask()` convertit l'ancien format à la lecture. Les six écrans qui gèrent l'assignation partagent aujourd'hui le même bloc dupliqué ; ils sont remplacés par un composant `AssigneeGroup` unique.

**Tech Stack :** React 19, TypeScript, Vite, i18next, styles inline, Supabase (JSONB).

**Spec :** `docs/superpowers/specs/2026-07-30-multi-assignes-design.md`

## Global Constraints

- **Aucun test automatisé dans ce projet.** Chaque tâche se vérifie par `npx tsc -p tsconfig.app.json --noEmit` (zéro erreur) plus une vérification manuelle dans le navigateur. N'écris pas de fichiers de test : il n'y a pas de lanceur de tests.
- Typecheck : `npx tsc -p tsconfig.app.json --noEmit` depuis `app/`. Le `-p` est obligatoire — `npx tsc --noEmit` seul ne compile aucun fichier et donne un faux négatif.
- Serveur de dev : `npm run dev` depuis `app/` (http://localhost:5173, ou 5188 si déjà pris).
- **Jamais de texte utilisateur en dur.** Toute chaîne visible passe par `t('clé')`, et la clé doit être ajoutée dans `app/src/locales/fr.json` **et** `app/src/locales/en.json`.
- Styles en `style={{}}` inline. Pas de classes Tailwind.
- `SFIcon` prend un nom d'icône Lucide en kebab-case et renvoie `null` silencieusement si le nom est inconnu.
- Travailler directement sur `master` (convention établie du projet, pas de worktree).
- Commit à la fin de chaque tâche, message en français.

## Vocabulaire du domaine

- **Tâche de projet** : appartient à une section d'un projet, gérée par `taskStore.ts`.
- **Tâche libre** (*freestanding*) : tâche personnelle sans projet, gérée par `myTaskStore.ts`.
- **Session démo** (`isDemoSession() === true`) : données mock + `localStorage`, aucun appel réseau. **Session réelle** : Supabase.
- Dans une session démo, « Mes tâches » est une liste **totalement indépendante** qui ne contient aucune tâche de projet.

## Structure des fichiers

| Fichier | Rôle | Tâche |
|---------|------|-------|
| `app/src/data/normalizeTask.ts` | **Créé.** Convertit l'ancien format `{assignee}` en `{assignees}`, récursivement sur les sous-tâches. | 1 |
| `app/src/types/index.ts` | `Task.assignees: User[]` | 1 |
| `app/src/data/templates.ts` | `TemplateTask.assignees` | 1 |
| `app/src/data/mock.ts` | 59 seeds convertis par script | 1 |
| `app/src/data/taskStore.ts` | 2 points de lecture normalisés ; déclenche la notification (tâche 7) | 1, 7 |
| `app/src/data/myTaskStore.ts` | 2 points de lecture normalisés ; filtre « je figure parmi les assignés » | 1, 6 |
| `app/src/components/ui/AssigneeGroup.tsx` | **Créé.** Avatars empilés + menu multi-sélection. Seul composant d'assignation de l'app. | 2 |
| `app/src/components/ui/index.ts` | Export de `AssigneeGroup` | 2 |
| `app/src/screens/Travail.tsx` | 2 sélecteurs (ligne de tâche, ligne d'ajout) | 1, 3 |
| `app/src/components/TaskPanel.tsx` | 1 sélecteur (panneau de détail) | 1, 4 |
| `app/src/screens/TravailBoard.tsx` | 1 sélecteur (carte Kanban) | 1, 5 |
| `app/src/screens/TravailOverview.tsx` | 1 sélecteur (ligne de livrable) | 1, 5 |
| `app/src/screens/Taches.tsx` | 2 sélecteurs + affichage « avec (X) » | 1, 6 |
| `app/src/components/ProjectTaskRow.tsx` | 1 sélecteur (éditeur de modèles) | 1, 7 |
| `app/src/data/notificationStore.ts` | Nouveau `NotifKind: 'taskCompleted'` | 8 |
| `app/src/screens/Activite.tsx` | 4 tables indexées par `NotifKind` | 8 |

**Stratégie de découpage.** La tâche 1 change le type et corrige *mécaniquement* tous les appelants pour que l'app compile et se comporte **exactement comme avant** (un seul assigné affiché). Les tâches 3 à 7 remplacent ensuite surface par surface par le vrai multi-sélection. Chaque tâche laisse donc l'app fonctionnelle.

---

### Task 1: Modèle de données en liste, comportement inchangé

**Files:**
- Create: `app/src/data/normalizeTask.ts`
- Modify: `app/src/types/index.ts:85`
- Modify: `app/src/data/templates.ts:53`
- Modify: `app/src/data/mock.ts` (59 occurrences, par script)
- Modify: `app/src/data/taskStore.ts:37-41`, `:107-111`
- Modify: `app/src/data/myTaskStore.ts:27`, `:88-91`
- Modify: `app/src/screens/Travail.tsx:413`, `:439`, `:616-631`, `:779`, `:872-886`, `:1983`
- Modify: `app/src/components/TaskPanel.tsx`, `app/src/screens/TravailBoard.tsx`, `app/src/screens/TravailOverview.tsx`, `app/src/screens/Taches.tsx`, `app/src/components/ProjectTaskRow.tsx` (lectures/écritures `assignee`)
- Modify: `app/src/screens/VideoReview.tsx:628`, `app/src/screens/Modeles.tsx:557` et `:2153`, `app/src/components/ProjectsListView.tsx:170`, `app/src/components/RequestApprovalButton.tsx:67`

**Interfaces:**
- Produces: `Task.assignees: User[]` (liste vide = non assignée) ; `TemplateTask.assignees?: {id,name,initials,avatarColor}[]` ; `normalizeTask(raw: unknown): Task`

**Objectif de cette tâche :** l'app compile et se comporte **à l'identique**. Aucun changement visible. Un seul assigné s'affiche partout, comme avant. Le multi-sélection arrive aux tâches suivantes.

- [ ] **Step 1: Créer le convertisseur**

Créer `app/src/data/normalizeTask.ts` :

```ts
// app/src/data/normalizeTask.ts
// Les tâches sont stockées en JSON (colonne `data` de la table `tasks`, ou
// localStorage en démo). Celles écrites avant l'assignation multiple portent
// `assignee: User | null` ; celles écrites depuis portent `assignees: User[]`.
// Plutôt qu'une migration SQL, on convertit à la lecture — les deux formats
// cohabitent sans conflit, et l'ancien disparaît à la première réécriture.
import type { Task, User } from '../types';

export function normalizeTask(raw: unknown): Task {
  const t = raw as Task & { assignee?: User | null };
  const { assignee, ...rest } = t;
  const base = (t.assignees
    ? t
    : { ...rest, assignees: assignee ? [assignee] : [] }) as Task;
  return base.subtasks
    ? { ...base, subtasks: base.subtasks.map(normalizeTask) }
    : base;
}

export function normalizeSectionTasks<T extends { tasks: Task[] }>(section: T): T {
  return { ...section, tasks: section.tasks.map(normalizeTask) };
}
```

- [ ] **Step 2: Changer les deux types**

`app/src/types/index.ts` ligne 85, dans `interface Task` :

```ts
// avant
  assignee: User | null;
// après
  assignees: User[];
```

`app/src/data/templates.ts` ligne 53, dans `interface TemplateTask` :

```ts
// avant
  assignee?: { id: string; name: string; initials: string; avatarColor: string };
// après
  assignees?: { id: string; name: string; initials: string; avatarColor: string }[];
```

- [ ] **Step 3: Convertir les données de démo par script**

`mock.ts` contient 59 fois `assignee:USERS.x` ou `assignee: USERS.x`. Conversion mécanique :

```bash
cd "D:/Vibe Coding/Rush" && python -c "
import io, re
p='app/src/data/mock.ts'
s=io.open(p,encoding='utf-8').read()
s2,n=re.subn(r'assignee:(\s*)(USERS\.\w+)', r'assignees:\1[\2]', s)
io.open(p,'w',encoding='utf-8',newline='').write(s2)
print('remplacements:', n)
"
```

Attendu : `remplacements: 59`. Si le compte diffère, inspecter les occurrences restantes avec `grep -n "assignee[^s]" app/src/data/mock.ts` et les traiter à la main (par exemple `assignee: null` → `assignees: []`).

- [ ] **Step 4: Normaliser les quatre points de lecture**

`taskStore.ts` — ajouter l'import puis normaliser à l'initialisation (le `localStorage` peut contenir l'ancien format) :

```ts
import { normalizeSectionTasks } from './normalizeTask';

let _store: ProjectStore = (() => {
  const seeded = seedStore();
  const persisted = loadPersisted<ProjectStore | null>(STORAGE_KEY, null);
  const merged = persisted ? { ...seeded, ...persisted } : seeded;
  return Object.fromEntries(
    Object.entries(merged).map(([k, sections]) => [k, sections.map(normalizeSectionTasks)])
  );
})();
```

`taskStore.ts` dans `fetchSupabaseSections` (~ligne 107) :

```ts
  _supabaseSections[projectId] = rows.map(r => ({
    label: r.label,
    completed: r.completed,
    tasks: trows.filter(t => t.section_id === r.id).map(t => normalizeTask(t.data)),
  }));
```

`myTaskStore.ts` ligne 27 :

```ts
import { normalizeTask } from './normalizeTask';

let _tasks: Task[] = loadPersisted(STORAGE_KEY, MY_TASKS.map(t => ({ ...t }))).map(normalizeTask);
```

`myTaskStore.ts` dans `fetchSupabaseMyTasks` (~ligne 88) :

```ts
  _freestandingTasks = ((freestandingRows ?? []) as MyTaskRow[]).map(r => normalizeTask(r.data));
  _assignedTasks = ((projectTaskRows ?? []) as ProjectTaskRow[])
    .map(r => normalizeTask(r.data))
    .filter(t => !!myUserId && t.assignees.some(u => u.id === myUserId));
```

Note : le filtre passe de `t.assignee?.id === myUserId` à `t.assignees.some(...)`. C'est le seul changement de comportement de cette tâche, et il est nécessaire pour que le filtre compile.

- [ ] **Step 5: Corriger les cinq sites de création**

Une ligne chacun :

| Fichier:ligne | Avant | Après |
|---------------|-------|-------|
| `screens/VideoReview.tsx:628` | `assignee: USERS.lea,` | `assignees: [USERS.lea],` |
| `screens/Modeles.tsx:557` | `assignee: owner,` | `assignees: owner ? [owner] : [],` |
| `screens/Modeles.tsx:2153` | `assignee: USERS.lea,` | `assignees: [USERS.lea],` |
| `components/ProjectsListView.tsx:170` | `assignee: members[0] ?? USERS.lea,` | `assignees: [members[0] ?? USERS.lea],` |
| `components/RequestApprovalButton.tsx:67` | `assignee: USERS.lea,` | `assignees: [USERS.lea],` |

- [ ] **Step 6: Corriger mécaniquement les six sélecteurs**

Pour chacun des six écrans, l'état local reste **un seul `User | null`** à cette étape. Seules les lectures et écritures changent de forme.

Exemple sur `Travail.tsx` (`TaskRow`), à reproduire dans les cinq autres :

```ts
// ligne 413 — lecture initiale
const [assignee, setAssignee] = useState<User | null>(task.assignees[0] ?? null);

// ligne 439 — resynchronisation quand la prop change
setAssignee(task.assignees[0] ?? null);

// ligne 629 — écriture
if (rowProjectId) updateTask(rowProjectId, task.id, { assignees: u ? [u] : [] });

// ligne 626-627 environ — l'entrée « non assigné » du menu
() => { setAssignee(null); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { assignees: [] }); }
```

Dans `AddTaskRow` de `Travail.tsx` (~ligne 779), l'objet construit :

```ts
    assignees: assignee ? [assignee] : [],
```

Même traitement dans `TaskPanel.tsx`, `TravailBoard.tsx`, `TravailOverview.tsx`, `Taches.tsx`, `ProjectTaskRow.tsx`. Laisse le typecheck te guider : il signalera chaque site restant.

Points nommés, relevés à l'avance :

| Fichier:ligne | Avant | Après |
|---------------|-------|-------|
| `Taches.tsx` (~744) | `updateMyTask(task.id, { assignee: undefined })` | `updateMyTask(task.id, { assignees: [] })` |
| `TaskPanel.tsx:500` | `assignee: task.assignee ?? null` | `assignee: task.assignees[0] ?? null` |
| `TaskPanel.tsx:522` | `useState<User \| null>(task.assignee)` | `useState<User \| null>(task.assignees[0] ?? null)` |
| `ProjectTaskRow.tsx:170` | `const assignee = task.assignee;` | `const assignee = task.assignees[0] ?? null;` |
| `ProjectTaskRow.tsx:345` | `onUpdate({ assignee: null as unknown as Task['assignee'] })` | `onUpdate({ assignees: [] })` |
| `ProjectTaskRow.tsx:349` | `onUpdate({ assignee: u })` | `onUpdate({ assignees: [u] })` |
| `TravailBoard.tsx:589` | `assignee: null,` | `assignees: [],` |
| `TravailBoard.tsx:719` | `onUpdateTask(dropTask.id, { assignee: firstUser })` | `onUpdateTask(dropTask.id, { assignees: [] })` — l'entrée « non assigné » assignait `firstUser`, ce qui est incohérent avec les cinq autres écrans ; la liste vide est le comportement correct |
| `TravailBoard.tsx:726` | `onUpdateTask(dropTask.id, { assignee: u })` | `onUpdateTask(dropTask.id, { assignees: [u] })` |

**Ne pas toucher** au type `LocalSubtask` (`TaskPanel.tsx:106`) à cette étape : c'est un type local au panneau, il ne casse pas la compilation et sera converti à la tâche 4.

- [ ] **Step 7: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : aucune sortie (zéro erreur). Tant qu'il reste des erreurs, elles pointent vers un site `assignee` non converti — corrige-les toutes avant de continuer.

- [ ] **Step 8: Vérification manuelle — rien ne doit avoir changé**

```bash
cd app && npm run dev
```

Sur un projet de démo :
1. La liste de tâches affiche les mêmes avatars qu'avant.
2. Changer l'assigné d'une tâche depuis la liste → l'avatar change, le panneau de détail affiche la même personne.
3. Kanban, aperçu projet, Mes Tâches, éditeur de modèles → avatars présents, sélecteurs fonctionnels.
4. Recharger la page → l'assigné choisi persiste.
5. Console navigateur : aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add app/src && git commit -m "refactor(tasks): Task.assignees en liste, comportement inchangé

Prépare l'assignation multiple. Le type passe de assignee: User | null à
assignees: User[], et normalizeTask() convertit l'ancien format à la lecture
(les tâches sont en JSON dans une colonne unique — aucune migration Supabase).

Tous les appelants sont corrigés mécaniquement pour n'afficher qu'un assigné :
aucun changement visible à cette étape."
```

---

### Task 2: Composant `AssigneeGroup`

**Files:**
- Create: `app/src/components/ui/AssigneeGroup.tsx`
- Modify: `app/src/components/ui/index.ts`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `Task.assignees: User[]` (tâche 1)
- Produces: `<AssigneeGroup assignees={User[]} onChange?={(next: User[]) => void} size?={number} max?={number} readOnly?={boolean} showNames?={boolean} />`

**Contexte :** `SFAvatarGroup` (`app/src/components/ui/SFAvatar.tsx:43`) fait déjà les avatars empilés + pastille `+N` — le réutiliser plutôt que réécrire l'empilement. Il ne gère ni l'état vide ni la sélection : c'est ce qu'ajoute `AssigneeGroup`.

**Ne pas utiliser `InlineDropdown` :** il en existe trois copies divergentes dans le projet (`ProjectTaskRow.tsx:81` exporté avec `anchorRect`, `TaskPanel.tsx:134` privé, une variante `anchorRef` dans `Taches.tsx`). `AssigneeGroup` embarque son propre menu porté par `createPortal` pour rester autonome.

- [ ] **Step 1: Ajouter les clés i18n**

Dans `app/src/locales/fr.json`, namespace `tasks` :

```json
    "noOne": "Personne",
```

Dans `app/src/locales/en.json`, même namespace :

```json
    "noOne": "No one",
```

La clé existante `tasks.unassigned` reste utilisée pour l'état vide — ne pas la dupliquer.

- [ ] **Step 2: Écrire le composant**

Créer `app/src/components/ui/AssigneeGroup.tsx` :

```tsx
// app/src/components/ui/AssigneeGroup.tsx
// Seul composant d'assignation de l'app. Remplace le bloc « avatar + menu
// déroulant de l'équipe » qui était dupliqué dans six écrans.
//
// Le menu est porté par createPortal plutôt que rendu sur place : les lignes
// de tâche ont un `overflow: hidden` qui le tronquerait. Il ne se referme pas
// entre deux clics — on coche plusieurs personnes d'affilée.
import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { User } from '../../types';
import { getTeam } from '../../data/teamStore';
import { SFAvatar, SFAvatarGroup } from './SFAvatar';
import { SFIcon } from './SFIcon';

export function AssigneeGroup({
  assignees,
  onChange,
  size = 20,
  max = 2,
  readOnly = false,
  showNames = false,
}: {
  assignees: User[];
  onChange?: (next: User[]) => void;
  size?: number;
  max?: number;
  readOnly?: boolean;
  /** Affiche le nom à côté de l'avatar quand il n'y a qu'une personne. */
  showNames?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = (u: User) => {
    const next = assignees.some(a => a.id === u.id)
      ? assignees.filter(a => a.id !== u.id)
      : [...assignees, u];
    onChange?.(next);
  };

  const label = assignees.length === 1
    ? assignees[0].name
    : assignees.length === 0
      ? t('tasks.unassigned')
      : assignees.map(u => u.name).join(', ');

  const trigger = assignees.length === 0
    ? (
      <span style={{
        width: size, height: size, borderRadius: '50%',
        border: '1.5px dashed var(--border-2)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <SFIcon name="user" size={Math.round(size * 0.55)} color="var(--text-3)" />
      </span>
    )
    : <SFAvatarGroup
        avatars={assignees.map(u => ({ initials: u.initials, bg: u.avatarColor, name: u.name }))}
        size={size}
        max={max}
      />;

  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      {trigger}
      {showNames && (
        <span style={{
          fontSize: 12, color: assignees.length ? 'var(--text-2)' : 'var(--text-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
      )}
    </span>
  );

  if (readOnly) return <span title={label}>{content}</span>;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={label}
        onMouseDown={e => e.preventDefault()}
        onClick={e => {
          e.stopPropagation();
          setRect(e.currentTarget.getBoundingClientRect());
          setOpen(v => !v);
        }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', minWidth: 0 }}
      >
        {content}
      </button>
      {open && <AssigneeMenu
        anchorRect={rect}
        assignees={assignees}
        onToggle={toggle}
        onClearAll={() => { onChange?.([]); setOpen(false); }}
        onClose={() => setOpen(false)}
      />}
    </>
  );
}

function AssigneeMenu({ anchorRect, assignees, onToggle, onClearAll, onClose }: {
  anchorRect: DOMRect | null;
  assignees: User[];
  onToggle: (u: User) => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });

  // Même logique de placement que les InlineDropdown existants : bascule
  // au-dessus de l'ancre s'il n'y a pas la place en dessous.
  useLayoutEffect(() => {
    if (!ref.current || !anchorRect) return;
    const h = ref.current.offsetHeight;
    const w = ref.current.offsetWidth;
    const top = anchorRect.bottom + 4 + h > window.innerHeight && anchorRect.top >= h + 4
      ? anchorRect.top - h - 4
      : anchorRect.bottom + 4;
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, [anchorRect]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return createPortal(
    <>
      <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
      <div ref={ref} onClick={e => e.stopPropagation()} style={{
        position: 'fixed', ...pos, zIndex: 200, background: 'var(--surface)',
        border: '1px solid var(--border-2)', borderRadius: 10, padding: 4,
        minWidth: 200, maxHeight: 280, overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}>
        <button
          type="button"
          onClick={onClearAll}
          style={rowStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name="user" size={10} color="var(--text-3)" />
          </span>
          <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>{t('tasks.noOne')}</span>
        </button>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        {getTeam().map(u => {
          const on = assignees.some(a => a.id === u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onToggle(u)}
              style={rowStyle}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />
              <span style={{ flex: 1, textAlign: 'left' }}>{u.name}</span>
              {on && <SFIcon name="check" size={13} color="var(--accent)" />}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '7px 10px', border: 'none', background: 'none', cursor: 'pointer',
  textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)',
  color: 'var(--text)', borderRadius: 7,
};
```

- [ ] **Step 3: Exporter le composant**

Ajouter à la fin de `app/src/components/ui/index.ts` :

```ts
export { AssigneeGroup } from './AssigneeGroup';
```

- [ ] **Step 4: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : aucune sortie. Le composant n'est encore utilisé nulle part — c'est normal, TypeScript ne signale pas un export inutilisé.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ui/AssigneeGroup.tsx app/src/components/ui/index.ts app/src/locales && git commit -m "feat(ui): composant AssigneeGroup (avatars empilés + multi-sélection)

Réutilise SFAvatarGroup pour l'empilement et la pastille +N, et ajoute l'état
vide et le menu à cases à cocher. Menu porté par createPortal et autonome :
les trois InlineDropdown du projet ont des API divergentes.

Pas encore branché — le câblage des six écrans suit."
```

---

### Task 3: Brancher dans Travail.tsx (liste de projet)

**Files:**
- Modify: `app/src/screens/Travail.tsx` (`TaskRow` ~413-440 et ~610-635 ; `AddTaskRow` ~750-790 et ~865-890)

**Interfaces:**
- Consumes: `<AssigneeGroup assignees onChange size max readOnly showNames />` (tâche 2), `Task.assignees: User[]` (tâche 1)

- [ ] **Step 1: `TaskRow` — état en liste**

Remplacer l'état local et sa resynchronisation :

```ts
// ~ligne 413
const [assignees, setAssignees] = useState<User[]>(task.assignees);

// ~ligne 439, dans le useEffect de resynchronisation
setAssignees(task.assignees);
```

Retirer `'assignee'` de l'union du `useState` `open` (~ligne 420) : le menu est désormais interne à `AssigneeGroup`.

```ts
const [open, setOpen] = useState<'priority' | 'status' | 'dueDate' | null>(null);
```

- [ ] **Step 2: `TaskRow` — remplacer le bloc d'affichage**

Remplacer tout le bloc `{/* Assignee — inline dropdown */}` (le `<div style={{ position: 'relative' }}>` contenant le bouton et le `{open === 'assignee' && ...}`, environ lignes 610-635) par :

```tsx
      {/* Assignés */}
      <AssigneeGroup
        assignees={assignees}
        showNames
        onChange={next => {
          setAssignees(next);
          if (rowProjectId) updateTask(rowProjectId, task.id, { assignees: next });
        }}
      />
```

Ajouter `AssigneeGroup` à l'import existant depuis `'../components/ui'`.

- [ ] **Step 3: `AddTaskRow` — même traitement**

```ts
// ~ligne 750
const [assignees, setAssignees] = useState<User[]>([]);
```

Retirer `'assignee'` de l'union `openField` (~ligne 755).

Dans `buildTask` (~ligne 779) :

```ts
    assignees,
```

Dans `clearFields`, remplacer `setAssignee(null)` par `setAssignees([])`.

Remplacer le bloc d'affichage (~lignes 865-890) par :

```tsx
        <AssigneeGroup assignees={assignees} showNames onChange={setAssignees} />
```

- [ ] **Step 4: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : aucune sortie.

- [ ] **Step 5: Vérification manuelle**

```bash
cd app && npm run dev
```

1. Ouvrir un projet → onglet des tâches.
2. Cliquer l'avatar d'une tâche → menu avec cases à cocher. Cocher trois personnes **sans que le menu se ferme**.
3. La ligne affiche deux avatars superposés puis `+1`. Survoler l'avatar → les trois noms.
4. Cliquer hors du menu → il se ferme. Recharger la page → les trois personnes sont toujours là.
5. Décocher tout via « Personne » → rond pointillé.
6. Ligne « + Ajouter une tâche » : assigner deux personnes, valider par Entrée → la tâche créée porte les deux.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Travail.tsx && git commit -m "feat(tasks): multi-assignation dans la liste de projet"
```

---

### Task 4: Brancher dans TaskPanel.tsx (panneau de détail)

**Files:**
- Modify: `app/src/components/TaskPanel.tsx`

**Interfaces:**
- Consumes: `<AssigneeGroup />` (tâche 2), `Task.assignees` (tâche 1)

Le panneau propage ses modifications via `onUpdate?: (patch: Partial<Task>) => void` (ligne 451).

Il contient **deux** sélecteurs d'assigné : celui de la tâche elle-même, et un autre pour les sous-tâches, qui reposent sur un type local `LocalSubtask` (ligne 106) distinct de `Task`. Les deux sont traités ici.

- [ ] **Step 1: Sélecteur de la tâche**

État local, ligne ~522 :

```ts
const [editAssignees, setEditAssignees] = useState<User[]>(task.assignees);
```

Resynchroniser quand la prop change, à côté des resynchronisations déjà présentes dans le fichier :

```ts
useEffect(() => { setEditAssignees(task.assignees); }, [task.assignees]);
```

Remplacer le bouton avatar et son `InlineDropdown` (~lignes 330-350) par :

```tsx
<AssigneeGroup
  assignees={editAssignees}
  size={24}
  max={3}
  showNames
  onChange={next => { setEditAssignees(next); onUpdate?.({ assignees: next }); }}
/>
```

`max={3}` : le panneau est plus large que la liste, il peut montrer trois visages avant la pastille.

Retirer `'assignee'` de l'union `panelOpen` (ligne 526).

- [ ] **Step 2: Sous-tâches — convertir `LocalSubtask`**

Ligne 106, dans `interface LocalSubtask` :

```ts
// avant
  assignee: User | null;
// après
  assignees: User[];
```

Ligne ~500, la construction depuis `task.subtasks` :

```ts
      assignees: s.assignees ?? [], dueDate: '', comments: [] as CommentObj[],
```

**Correction volontaire :** l'ancien code écrivait `assignee: task.assignee ?? null`, c'est-à-dire l'assigné de la tâche **parente** pour chacune de ses sous-tâches — toutes affichaient donc la même personne, quelle que soit leur assignation réelle. `s.assignees` lit bien celle de la sous-tâche. Le mentionner dans le message de commit.

Lignes ~612 et ~628, les deux créations de sous-tâche vide :

```ts
    const sub: LocalSubtask = { id: `sub-${Date.now()}`, title: '', checked: false, priority: 'none', status: '', statusLabel: '', assignees: [], dueDate: '', comments: [] };
```

Ligne ~223, le test de champs renseignés :

```ts
  const hasFields = sub.priority !== 'none' || sub.assignees.length > 0 || !!sub.dueDate;
```

Lignes ~323-324, l'affichage dans `SubTaskRow` :

```tsx
          {sub.assignees.length > 0 && (
            <AssigneeGroup assignees={sub.assignees} size={16} readOnly />
          )}
```

Lignes ~358-370, le sélecteur du popover de champs — remplacer le bouton « non assigné » et la liste de `getTeam()` par :

```tsx
                    <AssigneeGroup
                      assignees={sub.assignees}
                      size={22}
                      onChange={next => onUpdate({ assignees: next })}
                    />
```

Ici `onUpdate` est celui de `SubTaskRow` (`(patch: Partial<LocalSubtask>) => void`, ligne 179), pas celui du panneau.

- [ ] **Step 3: Nettoyer**

Supprimer l'import de `getTeam` s'il n'est plus utilisé, et l'`InlineDropdown` privé du fichier (ligne 134) s'il n'a plus d'appelant. Le typecheck signale les deux.

- [ ] **Step 4: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : aucune sortie.

- [ ] **Step 5: Vérification manuelle**

1. Ouvrir une tâche à trois assignés (créée à la tâche 3) → le panneau montre les trois avatars.
2. Retirer une personne depuis le panneau → la ligne de tâche derrière se met à jour immédiatement.
3. Ajouter une personne depuis la ligne → le panneau ouvert se met à jour.
4. Ajouter une sous-tâche, lui assigner deux personnes → elles s'affichent sur la ligne de sous-tâche.
5. Vérifier qu'une sous-tâche **sans** assigné n'hérite plus de celui de sa tâche parente (c'était le bug corrigé au Step 2).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/TaskPanel.tsx && git commit -m "feat(tasks): multi-assignation dans le panneau de détail

Convertit aussi le type local LocalSubtask, et corrige au passage un bug
préexistant : les sous-tâches affichaient l'assigné de leur tâche parente
au lieu du leur."
```

---

### Task 5: Brancher dans le Kanban et l'aperçu projet

**Files:**
- Modify: `app/src/screens/TravailBoard.tsx`
- Modify: `app/src/screens/TravailOverview.tsx:806-826`

**Interfaces:**
- Consumes: `<AssigneeGroup />` (tâche 2), `Task.assignees` (tâche 1)

- [ ] **Step 1: Kanban**

Les cartes lisent la tâche directement (pas d'état local miroir) et propagent via `onUpdateTask(taskId, patch)`.

Remplacer le bouton avatar (~lignes 563-575) par :

```tsx
                            <AssigneeGroup
                              assignees={task.assignees}
                              size={20}
                              onChange={next => onUpdateTask(task.id, { assignees: next })}
                            />
```

Supprimer le bloc `{openDrop && dropTask && openDrop.type === 'assignee' && (...)}` (~lignes 714-730), devenu inutile, et retirer `'assignee'` de l'union du type `openDrop` (ligne 220).

Si la variable `firstUser` n'a plus d'appelant après cette suppression, la retirer aussi — le typecheck le signalera.

- [ ] **Step 2: Aperçu projet (livrables)**

Dans `TravailOverview.tsx`, remplacer le bloc `{/* Assignee — clickable dropdown */}` (~lignes 806-826) par :

```tsx
                  {/* Assignés */}
                  <div>
                    <AssigneeGroup
                      assignees={dl.assignees}
                      size={24}
                      onChange={next => updateTask(project.id, dl.id, { assignees: next })}
                    />
                  </div>
```

Retirer `'assignee'` de l'union du type `openDl` (~ligne 305) et la variable `isAssigneeOpen` (~ligne 595), devenues inutiles.

- [ ] **Step 3: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : aucune sortie.

- [ ] **Step 4: Vérification manuelle**

1. Onglet Kanban d'un projet → une tâche à trois assignés montre `(X)(Y) +1`.
2. Assigner deux personnes depuis une carte Kanban → revenir à la vue liste, les deux y sont.
3. Onglet Aperçu → un livrable accepte plusieurs assignés, et l'affichage suit.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/TravailBoard.tsx app/src/screens/TravailOverview.tsx && git commit -m "feat(tasks): multi-assignation dans le Kanban et l'aperçu projet"
```

---

### Task 6: Mes Tâches — sélecteur, filtre et « avec (X) »

**Files:**
- Modify: `app/src/screens/Taches.tsx` (~383-420, ~730-755, ~1086-1250, ~1395)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `<AssigneeGroup />` (tâche 2), filtre `assignees.some(...)` (tâche 1)

**Contexte :** le filtre « je figure parmi les assignés » a déjà été posé à la tâche 1 (`myTaskStore.ts`). Cette tâche traite l'interface.

- [ ] **Step 1: Clé i18n**

`fr.json`, namespace `tasks` :

```json
    "sharedWith": "avec",
```

`en.json` :

```json
    "sharedWith": "with",
```

- [ ] **Step 2: Sélecteur éditable — liste complète**

~ligne 383, état local :

```ts
const [assignees, setAssignees] = useState<User[]>(task.assignees);
```

~ligne 418, resynchronisation :

```ts
setAssignees(task.assignees);
```

Retirer `'assignee'` de l'union `open` (~ligne 385) et supprimer `assigneeBtnRef` (~ligne 391) devenu inutile.

Remplacer le bloc bouton + `InlineDropdown` (~lignes 730-755) par :

```tsx
        <AssigneeGroup
          assignees={assignees}
          size={22}
          onChange={next => { setAssignees(next); updateMyTask(task.id, { assignees: next }); }}
        />
```

**Important :** ce sélecteur affiche la liste **complète**, sans filtrer l'utilisateur courant — il faut pouvoir se retirer soi-même d'une tâche.

- [ ] **Step 3: Affichage « avec (X) » — les autres seulement**

Ajouter, dans la ligne de tâche, après le titre : un `AssigneeGroup` en lecture seule alimenté par les **autres** assignés.

Récupérer l'utilisateur courant en haut du composant de ligne :

```ts
import { getCurrentUser } from '../data/authStore';
// …
const me = getCurrentUser();
const others = assignees.filter(u => u.id !== me?.id);
```

Puis, juste après le titre de la tâche :

```tsx
        {others.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>{t('tasks.sharedWith')}</span>
            <AssigneeGroup assignees={others} size={16} readOnly />
          </span>
        )}
```

- [ ] **Step 4: Ligne d'ajout**

~ligne 1086 :

```ts
const [assignees, setAssignees] = useState<User[]>([]);
```

Retirer `'assignee'` de l'union `openField` (~ligne 1092).

Le type `AddOpts` (~ligne 997) :

```ts
type AddOpts = { priority: Priority; assignees: User[]; project: typeof PROJECTS[0] | null; status: string; statusLabel: string; dueDate: string };
```

Les trois appels `onAdd`/`onAddMany` (~lignes 1130, 1139, 1150) passent `assignees` au lieu de `assignee`.

Remplacer le bloc bouton + menu (~lignes 1231-1248) par :

```tsx
          <AssigneeGroup assignees={assignees} size={22} onChange={setAssignees} />
```

~ligne 1395, le `defaultAssignee` :

```ts
      assignees: opts.assignees.length ? opts.assignees : (defaultAssignee ? [defaultAssignee] : []),
```

Vérifier le nom réel de la variable avec `grep -n "defaultAssignee" app/src/screens/Taches.tsx` et adapter.

- [ ] **Step 5: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : aucune sortie.

- [ ] **Step 6: Vérification manuelle (session réelle requise)**

Le partage entre deux personnes n'est observable qu'en session réelle : en démo, « Mes tâches » est une liste indépendante sans tâches de projet.

En démo, vérifier au minimum :
1. Le sélecteur d'assignés accepte plusieurs personnes.
2. Une tâche dont un **autre** que soi est assigné affiche « avec (X) ».
3. Une tâche assignée à soi seul n'affiche rien après le titre.

En session réelle (si un second compte est disponible) :
4. Assigner une tâche de projet à soi + un collègue → elle apparaît dans les deux « Mes tâches ».
5. La cocher d'un côté → elle est cochée de l'autre après rechargement.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/Taches.tsx app/src/locales && git commit -m "feat(tasks): multi-assignation dans Mes Tâches + mention « avec »"
```

---

### Task 7: Brancher dans l'éditeur de modèles

**Files:**
- Modify: `app/src/components/ProjectTaskRow.tsx`

**Interfaces:**
- Consumes: `<AssigneeGroup />` (tâche 2), `TemplateTask.assignees` (tâche 1)

- [ ] **Step 1: Remplacer le sélecteur**

Ce composant n'a **pas** d'état local pour l'assigné : il lit `task` directement (ligne 170) et propage via `onUpdate(patch: Partial<Task>)` (ligne 160). Ne pas introduire de `useState` ici — ce serait s'écarter du motif du fichier.

Supprimer la ligne 170 (`const assignee = task.assignees[0] ?? null;`, telle que laissée par la tâche 1), puis remplacer le bouton avatar et son `InlineDropdown` (~lignes 330-355) par :

```tsx
        <AssigneeGroup
          assignees={task.assignees}
          size={20}
          showNames
          onChange={next => onUpdate({ assignees: next })}
        />
```

Retirer `'assignee'` de l'union `open` (ligne 174).

**Ne pas supprimer** l'`InlineDropdown` exporté ligne 81 : d'autres fichiers l'importent depuis ce module.

- [ ] **Step 2: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : aucune sortie.

- [ ] **Step 3: Vérification manuelle**

1. Modèles → ouvrir un modèle de projet → onglet Tâches.
2. Assigner deux personnes à une tâche du modèle, enregistrer.
3. Rouvrir le modèle → les deux personnes sont là.
4. Charger ce modèle dans un projet → la tâche créée porte les deux assignés.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ProjectTaskRow.tsx && git commit -m "feat(templates): multi-assignation dans l'éditeur de modèles"
```

---

### Task 8: Notification à la complétion d'une tâche partagée

**Files:**
- Modify: `app/src/data/notificationStore.ts:22`, `:45`
- Modify: `app/src/data/taskStore.ts:242-255`
- Modify: `app/src/screens/Activite.tsx:36`, `:49`, `:130`, `:150`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `Task.assignees` (tâche 1)
- Produces: `NotifKind` étendu de `'taskCompleted'`

**Contexte — la notification est visible par tout le studio.** La table `notifications` est scopée par `studio_id` et n'a pas de champ destinataire ; `notification_reads` ne retient que qui a lu. Toutes les notifications de l'app (mentions, commentaires) fonctionnent déjà ainsi. Cibler les seuls assignés demanderait une colonne `recipient_ids` et une migration Supabase manuelle — écarté par le spec. Le texte nomme la tâche, ce qui la rend ignorable.

- [ ] **Step 1: Étendre `NotifKind`**

`notificationStore.ts` ligne 22 :

```ts
export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version' | 'approval' | 'invitation' | 'deliverableApproved' | 'storageLimit' | 'taskCompleted';
```

Ligne 45, dans `taskMessages: Record<NotifKind, string[]>`, ajouter l'entrée que TypeScript va exiger :

```ts
    taskCompleted: [], // jamais généré par ce seed — vient de taskStore.updateTask
```

- [ ] **Step 2: Déclencher depuis `taskStore.updateTask`**

C'est le **seul** point de déclenchement nécessaire. Vérifié : les quatre écrans qui cochent une tâche y passent, y compris « Mes tâches » en session réelle (`myTaskStore.ts:159` délègue à `updateProjectTask`, alias de cette fonction). En démo, « Mes tâches » est une liste indépendante sans tâches de projet — ni oubli, ni double notification.

Ajouter les imports en tête de `taskStore.ts` :

```ts
import { isDemoSession, onLogout, getCurrentUser } from './authStore';
import { addNotif } from './notificationStore';
```

(`notificationStore` n'importe pas `taskStore` — pas de cycle.)

Remplacer `updateTask` (lignes 242-255) :

```ts
export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);

  // Une tâche partagée qui passe à « terminée » l'est pour tout le monde :
  // on prévient l'équipe, sinon elle disparaît de la liste des autres
  // assignés sans explication. Seulement au passage non-cochée → cochée, et
  // seulement si la tâche est effectivement partagée.
  const before = sections.flatMap(s => s.tasks).find(t => t.id === taskId);
  if (before && patch.checked === true && before.checked !== true && before.assignees.length > 1) {
    const me = getCurrentUser();
    addNotif({
      kind: 'taskCompleted',
      actor: me?.name ?? 'Rush',
      text: `a terminé « ${before.title} »`,
      timestamp: Date.now(),
      taskId,
      projectId,
    });
  }

  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => {
      if (t.id !== taskId) return t;
      const resolvedPatch = (patch.status !== undefined && patch.correctionsRequested === undefined)
        ? { ...patch, correctionsRequested: false }
        : patch;
      return { ...t, ...resolvedPatch };
    }),
  }));
  setSections(projectId, next);
}
```

`getCurrentUser()` renvoie l'utilisateur de session (`authStore`). Vérifier que le champ du nom s'appelle bien `name` avec `grep -n "export function getCurrentUser" -A 12 app/src/data/authStore.ts` et adapter si besoin.

- [ ] **Step 3: Clés i18n**

`fr.json`, namespace `activity` :

```json
    "taskCompleted": "Tâche terminée",
    "verbTaskCompleted": "a terminé",
```

`en.json` :

```json
    "taskCompleted": "Task completed",
    "verbTaskCompleted": "completed",
```

- [ ] **Step 4: Les quatre tables de `Activite.tsx`**

TypeScript exigera une entrée dans chacune. Ajouter à la suite des entrées `storageLimit` existantes :

Ligne ~37 (libellés) :

```ts
  taskCompleted: 'activity.taskCompleted',
```

Ligne ~50 (couleur de statut) :

```ts
  taskCompleted: 'ok',
```

Ligne ~131 (verbe traduit) :

```ts
    taskCompleted: t('activity.verbTaskCompleted'),
```

Ligne ~151 (icône) :

```ts
  taskCompleted: { icon: 'check-circle', color: 'var(--ok)', bg: 'rgba(0,200,100,0.12)' },
```

La notification porte un `taskId`, donc `Activite.tsx:158` (`clickable = !!(taskId || …)`) la rend cliquable sans changement.

- [ ] **Step 5: Typecheck**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```

Attendu : aucune sortie. Une erreur ici signale une des quatre tables oubliée.

- [ ] **Step 6: Vérification manuelle**

1. Assigner deux personnes à une tâche, puis la cocher → une notification « a terminé « … » » apparaît dans la cloche **et** dans Activité, avec une icône verte.
2. Cliquer la notification → elle ouvre la tâche.
3. **Décocher** la tâche → aucune nouvelle notification.
4. Cocher une tâche à **un seul** assigné → aucune notification.
5. Cocher une tâche à **zéro** assigné → aucune notification.
6. Cocher une tâche partagée depuis le Kanban, puis une autre depuis le panneau de détail → une notification à chaque fois (confirme que le point de déclenchement unique couvre tous les écrans).

- [ ] **Step 7: Commit**

```bash
git add app/src && git commit -m "feat(tasks): notification quand une tâche partagée est terminée

Déclenchée depuis taskStore.updateTask — seul point par lequel passent les
quatre écrans qui cochent une tâche, Mes Tâches en session réelle inclus.
Uniquement au passage non-cochée → cochée, et seulement si la tâche a plus
d'un assigné.

Visible par le studio comme toutes les notifications de l'app : la table n'a
pas de champ destinataire (voir le spec pour l'alternative)."
```

---

### Task 9: Vérification d'ensemble

**Files:** aucun changement de code attendu.

- [ ] **Step 1: Typecheck et build complet**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit && npm run build
```

Attendu : zéro erreur TypeScript. `npm run build` réussit — des avertissements de taille de chunk et d'import dynamique préexistent, ils ne sont pas causés par ce chantier.

- [ ] **Step 2: Vérifier qu'il ne reste aucun `assignee` au singulier**

```bash
grep -rn "\.assignee\b\|assignee:" app/src --include=*.ts --include=*.tsx | grep -v normalizeTask.ts
```

Attendu : aucun résultat. `normalizeTask.ts` est la seule exception légitime — c'est lui qui lit l'ancien format.

- [ ] **Step 3: Parcours complet dans le navigateur**

```bash
cd app && npm run dev
```

1. Assigner trois personnes à une tâche depuis la liste → `(SA)(TH) +1`, survol affiche les trois noms.
2. Panneau de détail → mêmes trois personnes ; en retirer une → la ligne suit.
3. Kanban → même affichage. Aperçu projet (livrables) → même affichage.
4. Éditeur de modèles → multi-assignation possible et persistée.
5. Mes Tâches → « avec (X) » sur une tâche partagée, rien sur une tâche solo.
6. Cocher une tâche partagée → notification ; cocher une tâche solo → aucune.
7. Recharger la page → tous les assignés persistent.
8. Console navigateur : aucune erreur.

- [ ] **Step 4: Vérifier la compatibilité avec l'ancien format**

Simuler une tâche enregistrée avant ce chantier, dans la console du navigateur (session démo) :

```js
const s = JSON.parse(localStorage.getItem('sf_project_tasks'));
s.pj1[0].tasks[0] = { ...s.pj1[0].tasks[0], assignee: { id:'u-lea', name:'Léa', initials:'LE', avatarColor:'#8b5cf6', role:'PM' } };
delete s.pj1[0].tasks[0].assignees;
localStorage.setItem('sf_project_tasks', JSON.stringify(s));
location.reload();
```

Attendu : la tâche affiche **un** avatar (Léa), sans erreur console. Le convertisseur a fait son travail.

Nettoyer ensuite :

```js
localStorage.removeItem('sf_project_tasks'); location.reload();
```

- [ ] **Step 5: Commit éventuel**

S'il a fallu corriger quelque chose :

```bash
git add app/src && git commit -m "fix(tasks): corrections issues de la vérification d'ensemble"
```

Sinon, rien à committer — la vérification suffit.
