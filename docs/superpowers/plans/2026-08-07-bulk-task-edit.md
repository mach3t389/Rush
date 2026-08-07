# Actions bulk (Assigner / Statut / Date) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton « Modifier » à la barre d'actions bulk existante (Liste projet, Tableau, Mes tâches) permettant d'assigner, changer le statut, ou changer la date d'échéance de plusieurs tâches sélectionnées en une seule action, avec confirmation par toast et annulation.

**Architecture:** Deux fichiers d'écran (`Travail.tsx` pour Liste+Tableau, `Taches.tsx` pour Mes tâches) reçoivent chacun : un nouveau bouton « Modifier » dans leur barre bulk existante, un état de menu à 3 niveaux (menu principal → sous-menu Assigné/Statut/Date, un seul niveau ouvert à la fois), et une fonction `applyBulkPatch` qui capture un instantané des valeurs précédentes, écrit le patch sur chaque tâche sélectionnée via la fonction d'écriture déjà utilisée par cet écran (`updateTask` ou `updateMyTask`), vide la sélection, et affiche un toast avec un `onUndo` qui restaure l'instantané.

**Tech Stack:** React 19 + TypeScript, composants `InlineDropdown`/`ddItem`/`TaskDatePopover` déjà en place dans chaque fichier, `showToast` (type `'task'`, supporte déjà l'empilement d'annulations), i18next.

## Global Constraints

- Aucun test automatisé dans ce projet — vérification via `npx tsc --noEmit -p tsconfig.app.json` puis serveur de preview (`npm run dev` / Browser tool), pas de `pytest`/`jest`.
- Ne jamais utiliser `<input type="date">` — utiliser les composants date existants (`TaskDatePopover`, déjà utilisé pour la date d'une tâche individuelle dans ces deux fichiers).
- Tout texte utilisateur doit passer par `t('namespace.key')` — ajouter les clés dans `fr.json` ET `en.json` avant de les utiliser.
- Style : `style={{}}` inline avec les tokens CSS existants (`var(--surface-3)`, `var(--border)`, `var(--text)`, `var(--accent)`, `var(--ff-text)`, `var(--ff-mono)`) — suivre exactement le style des boutons voisins déjà dans la barre bulk (`padding: '6px 12px'`, `borderRadius: 9`, `fontSize: 13`).
- Sélectionner un assigné dans le menu bulk **remplace** la liste d'assignés de chaque tâche (`{ assignees: [user] }`), jamais un ajout.
- La date bulk est une **date unique** appliquée à toutes les tâches sélectionnées (`{ dueDate: date }`), pas de décalage relatif.
- L'instantané pour l'annulation doit être capturé **avant** l'écriture du patch (jamais après), pour éviter le bug de cache déjà rencontré ailleurs dans ce projet où l'état "avant" est perdu s'il est capturé après le patch optimiste.
- Le bouton « Déplacer » existant n'est pas touché — il reste séparé du nouveau menu « Modifier ».

---

### Task 1: Clés i18n pour le menu bulk et les toasts

**Files:**
- Modify: `app/src/locales/fr.json:196` (juste après `"copy": "Copier",` dans le bloc `board`)
- Modify: `app/src/locales/en.json` (bloc `board` équivalent — chercher la même clé `"copy": "Copier"`/`"copy": "Copy"` que dans fr.json pour repérer l'emplacement correspondant)

**Interfaces:**
- Produces: clés `board.bulkEdit`, `board.bulkEditAssignee`, `board.bulkEditStatus`, `board.bulkEditDate`, `board.bulkAssignedToast_one`/`_other`, `board.bulkStatusToast_one`/`_other`, `board.bulkDateToast_one`/`_other` — utilisées par les Tasks 2 et 3.

- [ ] **Step 1: Ajouter les clés dans `fr.json`**

Dans `app/src/locales/fr.json`, insérer juste après la ligne `"copy": "Copier",` (ligne 196, dans le bloc `"board"` qui contient déjà `move`/`copy`/`selectedTasksCount_one`/etc.) :

```json
    "bulkEdit": "Modifier",
    "bulkEditAssignee": "Assigné",
    "bulkEditStatus": "Statut",
    "bulkEditDate": "Date d'échéance",
    "bulkAssignedToast_one": "{{count}} tâche assignée à {{name}}",
    "bulkAssignedToast_other": "{{count}} tâches assignées à {{name}}",
    "bulkStatusToast_one": "{{count}} tâche passée à {{status}}",
    "bulkStatusToast_other": "{{count}} tâches passées à {{status}}",
    "bulkDateToast_one": "{{count}} tâche déplacée au {{date}}",
    "bulkDateToast_other": "{{count}} tâches déplacées au {{date}}",
```

- [ ] **Step 2: Ajouter les clés équivalentes dans `en.json`**

Dans `app/src/locales/en.json`, trouver le bloc `"board"` (repérable par sa clé `"copy": "Copy"` ou équivalente au même bloc que fr.json ligne 196) et insérer au même endroit relatif :

```json
    "bulkEdit": "Edit",
    "bulkEditAssignee": "Assignee",
    "bulkEditStatus": "Status",
    "bulkEditDate": "Due date",
    "bulkAssignedToast_one": "{{count}} task assigned to {{name}}",
    "bulkAssignedToast_other": "{{count}} tasks assigned to {{name}}",
    "bulkStatusToast_one": "{{count}} task set to {{status}}",
    "bulkStatusToast_other": "{{count}} tasks set to {{status}}",
    "bulkDateToast_one": "{{count}} task moved to {{date}}",
    "bulkDateToast_other": "{{count}} tasks moved to {{date}}",
```

- [ ] **Step 3: Vérifier le JSON est valide**

Run: `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) — n'échoue pas sur le JSON directement, mais confirme qu'aucun import ne casse. Pour valider le JSON lui-même :

Run (PowerShell, depuis `app/`): `Get-Content src/locales/fr.json | ConvertFrom-Json | Out-Null; Get-Content src/locales/en.json | ConvertFrom-Json | Out-Null`
Expected: aucune erreur affichée (une virgule surnuméraire ou manquante lèverait une exception ici).

- [ ] **Step 4: Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "i18n: clés pour le menu bulk Modifier (assigné/statut/date)"
```

---

### Task 2: Menu bulk « Modifier » dans Travail.tsx (Liste + Tableau)

**Files:**
- Modify: `app/src/screens/Travail.tsx:5` (import — ajouter `SFAvatar`)
- Modify: `app/src/screens/Travail.tsx:1634-1646` (bloc d'état, juste après `const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());`)
- Modify: `app/src/screens/Travail.tsx:2400-2429` (barre bulk existante — insérer le nouveau bouton et les menus)

**Interfaces:**
- Consumes: `teamMembers` (déjà en scope, ligne 1687, `const teamMembers = getTeam();`), `STATUS_OPTIONS` (module-scope, ligne 145), `sections`/`setSections`... en fait **pas** `setSections` directement — l'écriture passe par `updateTask(project.id, id, patch)` (déjà importé, voir usages existants dans ce fichier) qui met à jour le store et déclenche la resynchronisation de `sections` via l'effet `subscribeStore` déjà en place ; `ddItem`, `InlineDropdown` (module-scope, lignes 55 et 115) ; `TaskDatePopover` (déjà importé ligne 5) ; `showToast` (déjà importé) ; `multiSelIds`/`setMultiSelIds` (ligne 1634) ; `project.id` (prop du composant parent, déjà utilisé par les boutons Déplacer/Copier voisins).
- Produces: rien consommé par d'autres tâches — Task 2 et Task 3 sont indépendantes (fichiers différents).

- [ ] **Step 1: Ajouter l'import `SFAvatar`**

Dans `app/src/screens/Travail.tsx`, ligne 5, remplacer :

```tsx
import { SFPill, SFBar, SFButton, SFIcon, SFModal, TaskDatePopover, parseYMD, fmtTaskDate, isOverdue, AssigneeGroup, CommentBadge } from '../components/ui';
```

par :

```tsx
import { SFPill, SFBar, SFButton, SFIcon, SFModal, TaskDatePopover, parseYMD, fmtTaskDate, isOverdue, AssigneeGroup, CommentBadge, SFAvatar } from '../components/ui';
```

- [ ] **Step 2: Ajouter l'état du menu bulk et les fonctions d'application**

Dans `app/src/screens/Travail.tsx`, juste après la ligne `const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());` (ligne 1634), insérer :

```tsx
  // Menu bulk « Modifier » (Assigné / Statut / Date) — un seul niveau ouvert
  // à la fois : 'menu' = liste des 3 champs, puis 'assignee'/'status'/'date'
  // = le sous-menu correspondant, ancré au même bouton.
  const [bulkEditField, setBulkEditField] = useState<null | 'menu' | 'assignee' | 'status' | 'date'>(null);
  const [bulkEditRect, setBulkEditRect] = useState<DOMRect | null>(null);

  type BulkSnapshotEntry = { id: string; assignees: User[]; status: string; statusLabel: string; dueDate: string };
  const captureBulkSnapshot = (ids: string[]): BulkSnapshotEntry[] => {
    const all = sections.flatMap(s => s.tasks);
    return ids.map(id => {
      const found = all.find(x => x.id === id);
      return {
        id,
        assignees: found?.assignees ?? [],
        status: found?.status ?? '',
        statusLabel: found?.statusLabel ?? '',
        dueDate: found?.dueDate ?? '',
      };
    });
  };

  const applyBulkPatch = (
    ids: string[],
    patch: Partial<Task>,
    snapshot: BulkSnapshotEntry[],
    undoPatchFor: (s: BulkSnapshotEntry) => Partial<Task>,
    message: string,
  ) => {
    ids.forEach(id => updateTask(project.id, id, patch));
    setBulkEditField(null);
    setBulkEditRect(null);
    setMultiSelIds(new Set());
    showToast({
      type: 'task',
      message,
      onUndo: () => snapshot.forEach(s => updateTask(project.id, s.id, undoPatchFor(s))),
    });
  };

  const handleBulkAssign = (user: User) => {
    const ids = [...multiSelIds];
    const snapshot = captureBulkSnapshot(ids);
    applyBulkPatch(
      ids,
      { assignees: [user] },
      snapshot,
      s => ({ assignees: s.assignees }),
      t('board.bulkAssignedToast', { count: ids.length, name: user.name }),
    );
  };

  const handleBulkStatus = (opt: typeof STATUS_OPTIONS[number]) => {
    const ids = [...multiSelIds];
    const snapshot = captureBulkSnapshot(ids);
    const label = t(opt.labelKey);
    applyBulkPatch(
      ids,
      { status: opt.value as Task['status'], statusLabel: label },
      snapshot,
      s => ({ status: s.status as Task['status'], statusLabel: s.statusLabel }),
      t('board.bulkStatusToast', { count: ids.length, status: label }),
    );
  };

  const handleBulkDate = (date: string) => {
    const ids = [...multiSelIds];
    const snapshot = captureBulkSnapshot(ids);
    applyBulkPatch(
      ids,
      { dueDate: date },
      snapshot,
      s => ({ dueDate: s.dueDate }),
      t('board.bulkDateToast', { count: ids.length, date: fmtTaskDate(date) }),
    );
  };
```

Note : `User` et `Task` sont déjà importés dans ce fichier (utilisés par le reste du composant) — pas de nouvel import de type nécessaire.

- [ ] **Step 3: Insérer le bouton « Modifier » et ses menus dans la barre bulk**

Dans `app/src/screens/Travail.tsx`, la barre bulk actuelle (lignes 2400-2429) a cet ordre : compteur → séparateur → Déplacer → Copier → Convertir → Supprimer → X. Remplacer le bloc du bouton Copier (lignes 2408-2411) :

```tsx
          <button onClick={() => setBulkCopyOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="copy" size={13} />
            {t('board.copy')}
          </button>
```

par (bouton Copier inchangé + nouveau bouton Modifier juste après, avec ses menus) :

```tsx
          <button onClick={() => setBulkCopyOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="copy" size={13} />
            {t('board.copy')}
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={e => { setBulkEditRect(e.currentTarget.getBoundingClientRect()); setBulkEditField('menu'); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="pencil" size={13} />
              {t('board.bulkEdit')}
            </button>
            {bulkEditField === 'menu' && (
              <InlineDropdown onClose={() => setBulkEditField(null)} anchorRect={bulkEditRect}>
                {ddItem(() => setBulkEditField('assignee'), <>{t('board.bulkEditAssignee')}</>)}
                {ddItem(() => setBulkEditField('status'), <>{t('board.bulkEditStatus')}</>)}
                {ddItem(() => setBulkEditField('date'), <>{t('board.bulkEditDate')}</>)}
              </InlineDropdown>
            )}
            {bulkEditField === 'assignee' && (
              <InlineDropdown onClose={() => setBulkEditField(null)} anchorRect={bulkEditRect}>
                {teamMembers.map(u => ddItem(() => handleBulkAssign(u),
                  <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} photoUrl={u.photoUrl} />{u.name}</>
                ))}
              </InlineDropdown>
            )}
            {bulkEditField === 'status' && (
              <InlineDropdown onClose={() => setBulkEditField(null)} anchorRect={bulkEditRect}>
                {STATUS_OPTIONS.map(o => ddItem(() => handleBulkStatus(o),
                  <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>
                ))}
              </InlineDropdown>
            )}
            {bulkEditField === 'date' && (
              <TaskDatePopover
                date=""
                onChange={d => handleBulkDate(d)}
                onClose={() => setBulkEditField(null)}
                anchorRect={bulkEditRect}
              />
            )}
          </div>
```

- [ ] **Step 4: Vérifier le typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune erreur. Si `SFAvatar`, `STATUS_COLOR`, `User` ou `Task['status']` remontent une erreur de type, comparer avec leur usage existant dans le même fichier (lignes 174-195 pour `SFAvatar` dans un autre composant du même fichier si présent, ou `AssigneeMenu` dans `AssigneeGroup.tsx` pour la forme exacte des props).

- [ ] **Step 5: Vérification live (Liste + Tableau)**

1. Démarrer le serveur de dev (`npm run dev` depuis `app/`, ou via l'outil Browser du harnais).
2. Se connecter en session démo (`lea.marchand@rushflow.com`, n'importe quel mot de passe).
3. Ouvrir un projet → onglet Travail (vue Liste).
4. Ctrl+clic sur 3 tâches pour les sélectionner → la barre bulk apparaît en bas avec le compteur.
5. Cliquer « Modifier » → le menu à 3 entrées (Assigné/Statut/Date) apparaît au-dessus du bouton.
6. Cliquer « Assigné » → la liste de l'équipe apparaît ; cliquer un membre → les 3 tâches sont assignées à cette personne, un toast apparaît avec le bon texte et un bouton Annuler.
7. Cliquer Annuler sur le toast → les 3 tâches retrouvent leurs assignés d'origine.
8. Répéter la vérification pour Statut (un des 6 statuts s'applique aux 3 tâches, pill mise à jour) et Date (le `TaskDatePopover` s'ouvre, choisir un jour applique la même date aux 3 tâches).
9. Basculer en vue Tableau (bouton Liste/Tableau) → refaire une sélection multiple (Ctrl+clic sur des cartes) → confirmer que le même bouton Modifier fonctionne identiquement (la barre bulk est partagée entre les deux vues via le même état `multiSelIds` du composant parent).

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Travail.tsx
git commit -m "feat(taches): menu bulk Modifier (assigné/statut/date) dans Liste et Tableau"
```

---

### Task 3: Menu bulk « Modifier » dans Taches.tsx (Mes tâches)

**Files:**
- Modify: `app/src/screens/Taches.tsx:4` (import — ajouter `SFAvatar`)
- Modify: `app/src/screens/Taches.tsx:1` (import React — pas de changement nécessaire, `User`/`Task` déjà importés ligne 13)
- Modify: `app/src/screens/Taches.tsx` (ajouter `import { getTeam } from '../data/teamStore';`)
- Modify: `app/src/screens/Taches.tsx:1313` (bloc d'état, juste après `const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());`)
- Modify: `app/src/screens/Taches.tsx:1703-1736` (barre bulk existante)

**Interfaces:**
- Consumes: `tasks` (état local du composant principal, alimenté par `getMyTasks()`/`subscribeMyTasks`, contient déjà tous les champs `Task` dont `assignees`/`status`/`statusLabel`/`dueDate`) ; `updateMyTask(taskId, patch)` (déjà importé ligne 7) ; `STATUS_OPTIONS` (local à ce fichier, ligne 166 — **différent** de celui de `Travail.tsx`, ne pas importer depuis l'autre fichier) ; `STATUS_COLOR` (déjà importé ligne 6) ; `TaskDatePopover` (déjà importé ligne 4) ; `showToast` (déjà importé ligne 15) ; `getTeam` (nouvel import, même fonction que celle utilisée par Task 2).
- Ce fichier a son propre `InlineDropdown` local (signature `{ anchorRef, onClose, children, minWidth }` — **anchorRef, pas anchorRect**, différent de celui de `Travail.tsx`) et son propre `ddItem` local défini à l'intérieur d'autres composants (non réutilisable au niveau du composant principal) — Task 3 ne réutilise ni l'un ni l'autre ; elle définit ses propres boutons de menu inline pour rester dans le même style visuel sans dépendre d'un helper hors-scope.

- [ ] **Step 1: Ajouter les imports `SFAvatar` et `getTeam`**

Dans `app/src/screens/Taches.tsx`, ligne 4, remplacer :

```tsx
import { SFPill, SFIcon, SFModal, TaskDatePopover, DatePickerDropdown, parseYMD, fmtTaskDate, formatDisplay, isOverdue, PageHeader, SFFilterPill, SFLoadingState, AssigneeGroup, CommentBadge } from '../components/ui';
```

par :

```tsx
import { SFPill, SFIcon, SFModal, TaskDatePopover, DatePickerDropdown, parseYMD, fmtTaskDate, formatDisplay, isOverdue, PageHeader, SFFilterPill, SFLoadingState, AssigneeGroup, CommentBadge, SFAvatar } from '../components/ui';
```

Puis, juste après la ligne 9 (`import { isDemoSession, getCurrentUser } from '../data/authStore';`), ajouter une nouvelle ligne :

```tsx
import { getTeam } from '../data/teamStore';
```

- [ ] **Step 2: Ajouter l'état du menu bulk et les fonctions d'application**

Dans `app/src/screens/Taches.tsx`, juste après la ligne `const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());` (ligne 1313), insérer :

```tsx
  // Menu bulk « Modifier » — même mécanique qu'en vue projet (Travail.tsx) :
  // un seul niveau ouvert à la fois, ancré au bouton via getBoundingClientRect.
  const [bulkEditField, setBulkEditField] = useState<null | 'menu' | 'assignee' | 'status' | 'date'>(null);
  const [bulkEditRect, setBulkEditRect] = useState<DOMRect | null>(null);
  const teamMembers = getTeam();

  type BulkSnapshotEntry = { id: string; assignees: User[]; status: string; statusLabel: string; dueDate: string };
  const captureBulkSnapshot = (ids: string[]): BulkSnapshotEntry[] => ids.map(id => {
    const found = tasks.find(x => x.id === id);
    return {
      id,
      assignees: found?.assignees ?? [],
      status: found?.status ?? '',
      statusLabel: found?.statusLabel ?? '',
      dueDate: found?.dueDate ?? '',
    };
  });

  const applyBulkPatch = (
    ids: string[],
    patch: Partial<Task>,
    snapshot: BulkSnapshotEntry[],
    undoPatchFor: (s: BulkSnapshotEntry) => Partial<Task>,
    message: string,
  ) => {
    ids.forEach(id => updateMyTask(id, patch));
    setBulkEditField(null);
    setBulkEditRect(null);
    setMultiSelIds(new Set());
    showToast({
      type: 'task',
      message,
      onUndo: () => snapshot.forEach(s => updateMyTask(s.id, undoPatchFor(s))),
    });
  };

  const handleBulkAssign = (user: User) => {
    const ids = [...multiSelIds];
    const snapshot = captureBulkSnapshot(ids);
    applyBulkPatch(
      ids,
      { assignees: [user] },
      snapshot,
      s => ({ assignees: s.assignees }),
      t('board.bulkAssignedToast', { count: ids.length, name: user.name }),
    );
  };

  const handleBulkStatus = (opt: typeof STATUS_OPTIONS[number]) => {
    const ids = [...multiSelIds];
    const snapshot = captureBulkSnapshot(ids);
    const label = t(opt.labelKey);
    applyBulkPatch(
      ids,
      { status: opt.value as Task['status'], statusLabel: label },
      snapshot,
      s => ({ status: s.status as Task['status'], statusLabel: s.statusLabel }),
      t('board.bulkStatusToast', { count: ids.length, status: label }),
    );
  };

  const handleBulkDate = (date: string) => {
    const ids = [...multiSelIds];
    const snapshot = captureBulkSnapshot(ids);
    applyBulkPatch(
      ids,
      { dueDate: date },
      snapshot,
      s => ({ dueDate: s.dueDate }),
      t('board.bulkDateToast', { count: ids.length, date: fmtTaskDate(date) }),
    );
  };

  const bulkDdItem = (onClick: () => void, children: React.ReactNode) => (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
    >
      {children}
    </button>
  );
```

Note : ce fichier n'a pas de `InlineDropdown` réutilisable au niveau du composant principal (celui existant prend un `anchorRef`, pas un `anchorRect`, et vit dans un composant enfant différent) — le menu bulk utilisera donc un `<div>` positionné simplement, comme détaillé au Step 3. `bulkDdItem` reproduit le style visuel de `ddItem` de `Travail.tsx` sans dépendre de son `InlineDropdown`.

- [ ] **Step 3: Insérer le bouton « Modifier » et son menu positionné manuellement dans la barre bulk**

Dans `app/src/screens/Taches.tsx`, la barre bulk actuelle (lignes 1703-1736) a l'ordre : compteur → séparateur → Déplacer → Copier → Convertir → Supprimer → X. Remplacer le bloc du bouton Copier (lignes 1711-1714) :

```tsx
          <button onClick={() => setBulkCopyOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="copy" size={13} />
            {t('taskPanel.copy')}
          </button>
```

par (bouton Copier inchangé + nouveau bouton Modifier avec son menu ancré en `position: fixed`, cohérent avec le fait que toute la barre bulk est déjà rendue via `createPortal(..., document.body)`) :

```tsx
          <button onClick={() => setBulkCopyOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="copy" size={13} />
            {t('taskPanel.copy')}
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={e => { setBulkEditRect(e.currentTarget.getBoundingClientRect()); setBulkEditField('menu'); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="pencil" size={13} />
              {t('board.bulkEdit')}
            </button>
            {bulkEditField && bulkEditField !== 'date' && bulkEditRect && (
              <>
                <div onClick={() => setBulkEditField(null)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                <div style={{ position: 'fixed', bottom: window.innerHeight - bulkEditRect.top + 4, left: bulkEditRect.left, zIndex: 400, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 180, maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  {bulkEditField === 'menu' && <>
                    {bulkDdItem(() => setBulkEditField('assignee'), <>{t('board.bulkEditAssignee')}</>)}
                    {bulkDdItem(() => setBulkEditField('status'), <>{t('board.bulkEditStatus')}</>)}
                    {bulkDdItem(() => setBulkEditField('date'), <>{t('board.bulkEditDate')}</>)}
                  </>}
                  {bulkEditField === 'assignee' && teamMembers.map(u => bulkDdItem(() => handleBulkAssign(u),
                    <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} photoUrl={u.photoUrl} />{u.name}</>
                  ))}
                  {bulkEditField === 'status' && STATUS_OPTIONS.map(o => bulkDdItem(() => handleBulkStatus(o),
                    <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>
                  ))}
                </div>
              </>
            )}
            {bulkEditField === 'date' && (
              <TaskDatePopover
                date=""
                onChange={d => handleBulkDate(d)}
                onClose={() => setBulkEditField(null)}
                anchorRect={bulkEditRect}
              />
            )}
          </div>
```

- [ ] **Step 4: Vérifier le typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune erreur.

- [ ] **Step 5: Vérification live (Mes tâches)**

1. Serveur de dev déjà lancé (ou le relancer), session démo active.
2. Aller sur Mes tâches.
3. Ctrl+clic sur 2-3 tâches → la barre bulk apparaît.
4. Cliquer « Modifier » → menu à 3 entrées → tester Assigné, Statut, Date comme au Step 5 de la Task 2, en confirmant à chaque fois le toast + Annuler.
5. Vérifier spécifiquement qu'une tâche assignée par quelqu'un d'autre (`isAssignedTask`, si présente dans les données démo) reste modifiable via ce menu (statut/assigné/date), cohérent avec le fait qu'elle est déjà éditable individuellement dans cet écran.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Taches.tsx
git commit -m "feat(taches): menu bulk Modifier (assigné/statut/date) dans Mes tâches"
```

---

### Task 4: Revue finale de branche

**Files:** aucun fichier propre à cette tâche — revue du diff complet des Tasks 1-3.

**Interfaces:** aucune (tâche de vérification, pas de nouveau code).

- [ ] **Step 1: Revue du diff complet**

Run: `git diff origin/master...HEAD --stat`
Expected: 4 fichiers modifiés (`fr.json`, `en.json`, `Travail.tsx`, `Taches.tsx`), aucun fichier inattendu.

- [ ] **Step 2: Typecheck final**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 0 erreur.

- [ ] **Step 3: Vérification croisée des 3 vues en une seule session**

Dans le navigateur (session démo déjà ouverte) :
1. Sélectionner des tâches dans la vue Liste d'un projet → assigner en masse → confirmer.
2. Basculer en vue Tableau du même projet → sélectionner d'autres tâches → changer le statut en masse → confirmer.
3. Aller sur Mes tâches → sélectionner des tâches → changer la date en masse → confirmer.
4. Recharger la page (F5) après chaque action pour confirmer que les changements ont bien persisté (pas seulement en mémoire) — la session démo persiste via `localStorage`.

- [ ] **Step 4: Utiliser `superpowers:finishing-a-development-branch` pour conclure**

Ne pas merger/pousser manuellement — suivre ce skill pour présenter les options de fin de branche à l'utilisateur.
