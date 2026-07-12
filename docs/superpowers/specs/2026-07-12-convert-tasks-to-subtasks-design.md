# Conversion de tâches en sous-tâches (clic droit) + nettoyage menu contextuel

## Contexte

`Task.subtasks?: Task[]` existe déjà dans le type, mais le seul moyen actuel de
créer une sous-tâche est de la saisir à la main dans le panneau de détail
(`TaskPanel.tsx`, section « Sous-tâches ») — il n'existe aucun moyen de
transformer une tâche déjà existante (avec son assigné, sa priorité, ses
dates...) en sous-tâche d'une autre tâche.

Cette spec ajoute :
1. Une action « Convertir en sous-tâche de... » accessible par clic droit sur
   une tâche (ou sur une sélection multiple de tâches), dans les deux vues
   d'un projet : `Travail.tsx` (liste) et `TravailBoard.tsx` (Kanban).
2. Un nettoyage : le bouton « ... » de `Travail.tsx` (liste), qui duplique déjà
   une partie des actions du clic droit, est supprimé — ses options
   manquantes (« Déplacer vers... ») sont fusionnées dans le menu clic droit,
   qui devient le seul menu contextuel sur une tâche.

## Périmètre — restrictions volontaires

- **Même projet seulement.** La tâche cible doit appartenir au même projet que
  les tâches converties. Pas de sélecteur de projet.
- **Pas dans « Mes tâches » (`Taches.tsx`).** Cette vue mélange plusieurs
  projets ; comme la conversion est limitée à un seul projet, l'ajouter là
  demanderait de gérer le cas d'une sélection multi-projets pour un gain
  marginal. C'est une exception délibérée à la règle habituelle de parité des
  3 vues de tâches (documentée dans CLAUDE.md) — à noter explicitement pour ne
  pas être perçue plus tard comme un oubli.
- Aucune limite de profondeur n'est imposée : si une tâche convertie avait
  déjà ses propres sous-tâches, elles voyagent avec elle (le champ `subtasks`
  de l'objet `Task` déplacé n'est pas touché). L'UI actuelle n'affiche qu'un
  niveau de sous-tâches ; ce cas restera simplement non affiché en profondeur,
  sans perte de données ni crash.

## Store — `taskStore.ts`

Nouvelle fonction, suivant le même pattern que `moveTasks` :

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

- Si `targetTaskId` fait partie de `taskIds`, l'appelant doit l'avoir déjà
  exclu (voir logique UI ci-dessous) — la fonction ne fait pas cette
  vérification elle-même, comme les autres fonctions de ce fichier qui font
  confiance à l'appelant (`moveTasks`, `copyTasks`).
- Aucune migration Supabase nécessaire : `subtasks` est déjà stocké tel quel
  dans la colonne `data` (jsonb) de chaque ligne `tasks`.

## UI — composant partagé `SubtaskTargetPicker`

Nouveau fichier `app/src/components/SubtaskTargetPicker.tsx`, utilisé par
`Travail.tsx` et `TravailBoard.tsx` :

```tsx
interface SubtaskTargetPickerProps {
  pos: { x: number; y: number };
  candidates: Task[];       // tâches du projet, sélection déjà exclue
  onPick: (targetTaskId: string) => void;
  onClose: () => void;
}
```

- Portail fixe ancré à `pos` (même style que `TaskContextMenu`/`DropMenu` —
  fond `var(--surface-2)`, bordure, ombre).
- Champ de recherche en haut (`autoFocus`), liste filtrée par titre
  (insensible à la casse) en dessous, `max-height` + scroll.
- Ligne cliquable par tâche candidate (titre tronqué, icône `git-branch` si
  la tâche a elle-même déjà des sous-tâches, pour transparence).
- Liste vide → message « Aucune tâche disponible ».
- Se ferme sur clic extérieur ou `Escape`, comme les autres menus du fichier.

## `Travail.tsx` (liste)

**État ajouté au composant parent (celui qui possède déjà `multiSelIds`,
`sections`, `project`) :**

```ts
const [convertRequest, setConvertRequest] = useState<{ taskIds: string[]; pos: { x: number; y: number } } | null>(null);
```

**Déclenchement depuis `TaskRow` :** `TaskRow` reçoit une nouvelle prop
`onConvertRequest?: (task: Task, pos: { x: number; y: number }) => void`,
appelée depuis le clic droit existant (même `ctxPos` déjà capturé). Le parent
résout la liste de tâches concernées :

```ts
const handleConvertRequest = (task: Task, pos: { x: number; y: number }) => {
  const ids = multiSelIds.has(task.id) && multiSelIds.size > 1 ? [...multiSelIds] : [task.id];
  setConvertRequest({ taskIds: ids, pos });
};
```

**Rendu du picker (dans le parent, à côté du `BulkMoveModal`/toolbar
existants) :**

```tsx
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

**Nettoyage du menu contextuel de `TaskRow` :**

- Le bouton « ... » (icône `ellipsis`, lignes ~703-721 actuelles) et son
  `InlineDropdown` associé sont supprimés en bloc, ainsi que l'état `open ===
  'context'` qui ne sert qu'à lui (les autres valeurs de `open` — priority/
  assignee/status/dueDate — restent inchangées).
- `TaskContextMenu` (le menu clic droit, actuellement seulement « Ouvrir le
  détail » + « Supprimer ») gagne les items manquants pour devenir le seul
  menu contextuel :
  - Ouvrir le détail *(existant)*
  - Déplacer vers... *(repris du bouton « ... », ouvre `showMoveModal`)*
  - **Convertir en sous-tâche de...** *(nouveau — appelle `onConvertRequest`)*
  - séparateur
  - Supprimer *(existant)*
- `TaskContextMenu` reçoit deux nouvelles props optionnelles : `onMove?: () =>
  void` et `onConvert?: () => void`, câblées depuis `TaskRow` vers
  `setShowMoveModal(true)` et `onConvertRequest?.(task, ctxPos)`
  respectivement. L'item « Déplacer vers... » ne s'affiche que si
  `allSections && allSections.length > 1` (même condition que l'ancien bouton
  « ... »).

## `TravailBoard.tsx` (Kanban)

Même mécanique, adaptée au menu existant `CardContextMenu` (clic droit sur
une carte) :

- `TravailBoard` reçoit une nouvelle prop `onConvertRequest?: (task: Task, pos: { x: number; y: number }) => void`, câblée par le parent commun (`Travail.tsx`) vers la **même** fonction `handleConvertRequest` que la vue liste (un seul état `convertRequest`/`SubtaskTargetPicker` partagé entre les deux vues, puisque le composant parent les héberge déjà toutes les deux derrière un toggle de vue).
- `CardContextMenu` gagne un nouvel item « Convertir en sous-tâche de... »,
  affiché quel que soit le nombre de sections (pas de condition liée à
  `allSections`, contrairement à « Déplacer vers... » qui reste inchangé —
  cet item n'est pas dans le périmètre de cette spec).
- Pas de suppression de bouton « ... » côté Kanban : `TravailBoard.tsx` n'a
  jamais eu ce doublon (confirmé par lecture du fichier — seul le clic droit
  existe déjà pour les cartes et les sections).

## Résumé des fichiers touchés

| Fichier | Changement |
|---|---|
| `app/src/data/taskStore.ts` | + `convertTasksToSubtasks(projectId, taskIds, targetTaskId)` |
| `app/src/components/SubtaskTargetPicker.tsx` | Nouveau composant partagé |
| `app/src/screens/Travail.tsx` | État `convertRequest` + rendu du picker ; `TaskRow`/`TaskContextMenu` : ajout « Déplacer vers... » + « Convertir en sous-tâche de... », suppression du bouton « ... » et de son dropdown |
| `app/src/screens/TravailBoard.tsx` | `CardContextMenu` : ajout « Convertir en sous-tâche de... » ; nouvelle prop `onConvertRequest` reçue du parent |

## Vérification manuelle prévue

1. Session démo : sélectionner 2 tâches (Ctrl-clic) dans la liste d'un
   projet, clic droit → « Convertir en sous-tâche de... » → choisir une 3e
   tâche → les 2 tâches disparaissent de la section, apparaissent comme
   sous-tâches dans le panneau de détail de la 3e tâche (badge
   « 2 sous-tâches » sur la ligne).
2. Même test en vue Kanban, avec une seule tâche sélectionnée (pas de
   multi-sélection en Kanban actif — juste la carte clic-droitée).
3. Sur la liste : clic droit sur une tâche → vérifier que « Déplacer vers... »
   fonctionne comme avant (comportement repris du bouton « ... » supprimé) et
   que le bouton « ... » n'existe plus visuellement sur la ligne.
4. Vérifier que la tâche cible n'apparaît jamais dans la liste de recherche du
   picker (ni les autres tâches sélectionnées).
5. `npx tsc --noEmit -p tsconfig.app.json` et `npm run lint` : pas de
   régression par rapport à la référence actuelle.
