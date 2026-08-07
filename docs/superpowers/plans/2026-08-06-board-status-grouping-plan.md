# Tableau — organiser par catégorie ou par statut — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un toggle « Organiser par : Catégorie / Statut » dans la vue Tableau de `Travail.tsx`/`TravailBoard.tsx`, rendre la colonne Statut de la vue Liste masquable, renommer "section" en "catégorie" dans le texte utilisateur, et sauvegarder les deux préférences (vue + regroupement) par personne et par projet.

**Architecture:** Voir le design approuvé : `docs/superpowers/specs/2026-08-06-board-status-grouping-design.md`. En résumé : `TravailBoard.tsx` reçoit un prop `groupBy: 'category' | 'status'` ; en mode statut, `Travail.tsx` lui passe des pseudo-sections dérivées de `STATUS_OPTIONS` (au lieu des vraies sections), et un `onMoveTask` différent qui appelle `updateTask(..., { status, statusLabel, checked })` plutôt que de déplacer la tâche entre sections réelles.

**Tech Stack:** React 19 + TypeScript, i18next, `useSyncedViewState` (préférence par utilisateur, Supabase).

## Global Constraints

- Statuts fixes app-wide (`STATUS_OPTIONS` dans `Travail.tsx`, dupliqué dans `TravailBoard.tsx`) — ne pas les rendre personnalisables.
- Le code interne garde les noms `section`/`SectionData`/`sectionLabel`/`getSections` — seul le texte visible par l'utilisateur est renommé en "catégorie".
- Préférence de vue et de regroupement : `useSyncedViewState` avec une clé incluant `projectId` (ex. `` `sf_view_travail_${projectId}` ``, `` `sf_board_groupby_${projectId}` ``) — individuelle par construction (le hook synchronise déjà par utilisateur).
- Préférence des colonnes masquées de la vue Liste : `useSyncedViewState('sf_travail_columns', {...})`, SANS suffixe projet (préférence d'affichage personnelle, pas par projet).
- En mode Statut : colonnes non éditables — pas de renommer/supprimer/réordonner une colonne, pas de "+ nouvelle catégorie", pas de bouton "Ajouter une tâche" par colonne (la création de tâches reste possible depuis la vue Liste ou Catégorie).
- Déposer une carte dans la colonne "Complété" (`status: 'ok'`) doit aussi cocher la tâche (`checked: true`) ; la sortir de "Complété" la décoche.

---

### Task 1: Préférence de regroupement + toggle UI dans Travail.tsx

**Files:**
- Modify: `app/src/screens/Travail.tsx:1610` (déclarations `useSyncedViewState`), `~1880-1893` (bloc "View switcher" dans `ProjectHeaderBar`)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (namespace `board`)

**Interfaces:**
- Produces: état `boardGroupBy: 'category' | 'status'` et setter `setBoardGroupBy`, disponibles pour Task 2/3 dans le même composant `Travail()`.

- [ ] **Step 1: Rendre la préférence de vue par-projet**

  Remplacer :
  ```tsx
  const [view, setView] = useSyncedViewState<'list' | 'board'>('sf_view_travail', 'list');
  ```
  par :
  ```tsx
  const [view, setView] = useSyncedViewState<'list' | 'board'>(`sf_view_travail_${projectId}`, 'list');
  ```
  (`projectId` est déjà disponible via `useParams` plus haut dans le composant — voir ligne 1448.)

- [ ] **Step 2: Ajouter l'état de regroupement**

  Juste après la ligne du `view`, ajouter :
  ```tsx
  const [boardGroupBy, setBoardGroupBy] = useSyncedViewState<'category' | 'status'>(`sf_board_groupby_${projectId}`, 'category');
  ```

- [ ] **Step 3: Ajouter les clés de traduction**

  Dans `app/src/locales/fr.json`, namespace `board` (après `"viewBoard": "Tableau",`) :
  ```json
  "groupByLabel": "Organiser par",
  "groupByCategory": "Catégorie",
  "groupByStatus": "Statut",
  ```
  Dans `app/src/locales/en.json`, namespace `board` (même emplacement) :
  ```json
  "groupByLabel": "Group by",
  "groupByCategory": "Category",
  "groupByStatus": "Status",
  ```

- [ ] **Step 4: Ajouter le toggle dans le header, visible seulement en vue Tableau**

  Dans le JSX de `ProjectHeaderBar`, juste après le bloc "View switcher" (`{/* View switcher */}` … `</div>`, se terminant par la fermeture du `.map` des boutons list/board), insérer avant le bloc `{/* View settings */}` :
  ```tsx
  {view === 'board' && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)' }}>
      <span style={{ fontFamily: 'var(--ff-mono)' }}>{t('board.groupByLabel')}</span>
      <div style={{ display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
        {([
          { key: 'category', label: t('board.groupByCategory') },
          { key: 'status',   label: t('board.groupByStatus')   },
        ] as const).map(g => (
          <button key={g.key} onClick={() => setBoardGroupBy(g.key)}
            style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: boardGroupBy === g.key ? 'var(--surface)' : 'transparent', color: boardGroupBy === g.key ? 'var(--text)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: boardGroupBy === g.key ? 600 : 400 }}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  )}
  ```

- [ ] **Step 5: Vérifier**

  `npx tsc --noEmit -p tsconfig.app.json` depuis `app/` — doit rester clean. Vérifier en direct (voir Task 3 pour un test complet — ce toggle n'a d'effet visible qu'une fois Task 2/3 faits ; ok de le laisser sans effet jusque-là si on exécute les tasks dans l'ordre).

- [ ] **Step 6: Commit**
  ```bash
  git add app/src/screens/Travail.tsx app/src/locales/fr.json app/src/locales/en.json
  git commit -m "feat(tableau): préférence de vue par projet + toggle organiser par catégorie/statut"
  ```

---

### Task 2: Pseudo-sections par statut + handlers dans Travail.tsx

**Files:**
- Modify: `app/src/screens/Travail.tsx` (autour de `~1975-2001`, l'invocation de `<TravailBoard>`)

**Interfaces:**
- Consumes: `boardGroupBy` (Task 1), `STATUS_OPTIONS` (déjà défini ligne 131 dans ce fichier), `visibleSections: SectionData[]` (déjà calculé plus haut dans le composant), `updateTask(projectId, taskId, patch)` (déjà importé).
- Produces: `boardSections: SectionData[]` et `handleBoardMoveTask` passés à `TravailBoard` — Task 3 les consomme comme remplacement de `sections`/`onMoveTask`.

- [ ] **Step 1: Construire les pseudo-sections par statut**

  Juste avant le `return (` du composant `Travail()` (ou à tout endroit après que `visibleSections` et `t` soient définis), ajouter :
  ```tsx
  const boardSections: SectionData[] = boardGroupBy === 'category'
    ? visibleSections
    : STATUS_OPTIONS.map(opt => ({
        label: t(opt.labelKey),
        tasks: visibleSections.flatMap(s => s.tasks).filter(task =>
          opt.value === '' ? !task.status : task.status === opt.value
        ),
        completed: false,
      }));
  ```
  Note : `STATUS_OPTIONS[0]` (`value: ''`, "Sans statut") capture les tâches sans statut assigné — aucune tâche n'est donc invisible en mode Statut.

- [ ] **Step 2: Handler de déplacement spécifique au mode Statut**

  Ajouter, au même endroit :
  ```tsx
  const handleBoardMoveTask = (task: Task, fromIdx: number, toIdx: number) => {
    if (boardGroupBy === 'category') { handleMoveTask(task, fromIdx, toIdx); return; }
    const targetStatus = STATUS_OPTIONS[toIdx];
    if (!targetStatus) return;
    const patch: Partial<Task> = {
      status: targetStatus.value as Task['status'],
      statusLabel: targetStatus.value ? t(targetStatus.labelKey) : '',
      checked: targetStatus.value === 'ok',
    };
    updateTask(projectId!, task.id, patch);
    setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, ...patch } : t) })));
    if (selectedTask?.id === task.id) setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
  };
  ```
  (`handleMoveTask` existe déjà dans ce fichier — c'est le handler catégorie actuel, inchangé.)

- [ ] **Step 3: Vérifier**

  `npx tsc --noEmit -p tsconfig.app.json` — clean (ces fonctions ne sont pas encore branchées au JSX, Task 3 le fait).

- [ ] **Step 4: Commit**
  ```bash
  git add app/src/screens/Travail.tsx
  git commit -m "feat(tableau): pseudo-colonnes et déplacement par statut"
  ```

---

### Task 3: Brancher TravailBoard sur le regroupement + adapter son UI

**Files:**
- Modify: `app/src/screens/TravailBoard.tsx` (props, header de colonne, carte, bouton "ajouter une tâche"/"nouvelle section")
- Modify: `app/src/screens/Travail.tsx` (props passés à `<TravailBoard>`, ~1975-2001)

**Interfaces:**
- Consumes: `boardSections`, `handleBoardMoveTask`, `boardGroupBy` (Task 1/2).
- Produces: `TravailBoard`'s `Props` gagne `groupBy: 'category' | 'status'` et `categoryByTaskId?: Record<string, string>` (pour l'étiquette catégorie sur la carte en mode statut).

- [ ] **Step 1: Étendre les Props de TravailBoard**

  Dans `app/src/screens/TravailBoard.tsx`, dans `interface Props` (ligne ~179), ajouter :
  ```tsx
  groupBy: 'category' | 'status';
  ```
  Dans la signature de `TravailBoard(...)` (ligne ~203), ajouter `groupBy` à la déstructuration.

- [ ] **Step 2: Désactiver les affordances d'édition de colonne en mode Statut**

  Toujours dans `TravailBoard.tsx` :
  - Le `onContextMenu` du header de colonne (ligne ~319, ouvre `SectionContextMenu`) : n'attacher le handler que si `groupBy === 'category'` — remplacer
    ```tsx
    onContextMenu={e => { e.preventDefault(); setSectionCtxMenu({ label: section.label, x: e.clientX, y: e.clientY }); }}
    ```
    par
    ```tsx
    onContextMenu={e => { if (groupBy !== 'category') return; e.preventDefault(); setSectionCtxMenu({ label: section.label, x: e.clientX, y: e.clientY }); }}
    ```
  - Le label de colonne cliquable pour renommer (ligne ~352-358) : en mode statut, retirer `cursor: 'text'` et le handler `onClick` (juste rendre `<span>{section.label}</span>` sans `onClick`) — envelopper le `<span onClick=...>` existant dans une condition `groupBy === 'category' ? (...) : (<span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{section.label}</span>)`.
  - Le bouton supprimer colonne (hoveredHeader actions, ligne ~371-392) et le rond "marquer section complétée" (ligne ~322-331) : envelopper tout le bloc dans `{groupBy === 'category' && (...)}`.
  - Le bouton "Ajouter une tâche" par colonne (ligne ~584-605) : envelopper dans `{groupBy === 'category' && (...)}`.
  - Le bloc "New section" en fin de liste de colonnes (ligne ~612-645, le `addingSection`/bouton "+ Nouvelle catégorie") : envelopper dans `{groupBy === 'category' && (...)}`.

- [ ] **Step 3: Étiquette catégorie sur la carte en mode Statut**

  Dans le rendu de la carte (ligne ~513-516, le `<p>{task.title}</p>`), ajouter juste après, conditionnel :
  ```tsx
  {groupBy === 'status' && (
    <span style={{ display: 'inline-block', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-3)', borderRadius: 999, padding: '2px 7px', marginBottom: 8 }}>
      {task.sectionLabel ?? ''}
    </span>
  )}
  ```
  Vérifier d'abord que `Task['sectionLabel']` est bien peuplé pour les tâches en cours d'affichage (c'est un champ existant sur `Task`, voir `app/src/types/index.ts:126` — si vide/`undefined` pour certaines tâches legacy, l'étiquette est simplement absente, comportement acceptable, ne pas ajouter de fallback complexe).

- [ ] **Step 4: Empêcher le drop dans une colonne statut de rouvrir le menu section**

  Le `onDrop` du header de colonne (ligne ~275-278) appelle déjà `onMoveTask(dragTask.task, dragTask.sectionIdx, sIdx)` sans référence à une vraie section — aucun changement nécessaire, `onMoveTask` est maintenant `handleBoardMoveTask` (Task 2) côté appelant, qui bifurque déjà sur `groupBy`.

- [ ] **Step 5: Passer les nouveaux props depuis Travail.tsx**

  Dans `app/src/screens/Travail.tsx`, à l'invocation `<TravailBoard>` (~1976) :
  ```tsx
  <TravailBoard
    sections={boardSections}
    ...
    onMoveTask={handleBoardMoveTask}
    groupBy={boardGroupBy}
    ...
  />
  ```
  (Remplacer `sections={visibleSections}` par `sections={boardSections}` et `onMoveTask={handleMoveTask}` par `onMoveTask={handleBoardMoveTask}` ; ajouter `groupBy={boardGroupBy}`. Les autres props de section — `onAddSection`, `onDeleteSection`, `onRenameSection`, `onMoveSection`, `onCopySection` — restent branchées telles quelles : elles ne sont simplement jamais invoquées en mode statut grâce à Task 3 Step 2.)

- [ ] **Step 6: Vérifier — typecheck + test live**

  `npx tsc --noEmit -p tsconfig.app.json` — clean.

  Test live (session démo, `preview_start` + Browser tools) :
  1. Ouvrir un projet → onglet Tâches → vue Tableau.
  2. Basculer le toggle sur "Statut" — les colonnes doivent devenir Sans statut/À faire/En cours/Complété/En retard/En révision, chaque carte doit montrer sa catégorie d'origine en étiquette.
  3. Glisser une carte de "À faire" vers "Complété" — vérifier (via `read_page`/`get_page_text` ou en rouvrant la tâche) que son statut ET sa case à cocher ont changé.
  4. Rebasculer sur "Catégorie" — les colonnes redeviennent les sections d'origine, la tâche déplacée à l'étape 3 est toujours dans sa section d'origine (pas déplacée).
  5. Rafraîchir la page — le toggle doit rester sur le dernier choix (préférence par projet).

- [ ] **Step 7: Commit**
  ```bash
  git add app/src/screens/TravailBoard.tsx app/src/screens/Travail.tsx
  git commit -m "feat(tableau): vue Tableau organisable par statut, glisser change le statut"
  ```

---

### Task 4: Colonnes masquables dans la vue Liste

**Files:**
- Modify: `app/src/screens/Travail.tsx` (menu "Vue" existant ~1894-1928, en-tête et lignes du tableau — chercher le composant `Section`/table interne autour de ligne 926+ et les cellules `<th>`/`<td>` Statut/Priorité/Assigné/Activité/Date)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (namespace `board`)

**Interfaces:**
- Produces: `visibleColumns: Record<'status'|'priority'|'assignee'|'activity'|'date', boolean>` via `useSyncedViewState`, consommé par le rendu de l'en-tête et des lignes de la vue Liste.

- [ ] **Step 1: État de préférence**

  Dans `Travail()`, à côté des autres `useSyncedViewState` (~1612-1613) :
  ```tsx
  const [visibleColumns, setVisibleColumns] = useSyncedViewState('sf_travail_columns', {
    status: true, priority: true, assignee: true, activity: true, date: true,
  });
  ```

- [ ] **Step 2: Clés de traduction**

  `fr.json` namespace `board` :
  ```json
  "columnsLabel": "Colonnes affichées",
  "columnStatus": "Statut",
  "columnPriority": "Priorité",
  "columnAssignee": "Assigné à",
  "columnActivity": "Activité",
  "columnDate": "Date"
  ```
  `en.json` namespace `board` :
  ```json
  "columnsLabel": "Visible columns",
  "columnStatus": "Status",
  "columnPriority": "Priority",
  "columnAssignee": "Assignee",
  "columnActivity": "Activity",
  "columnDate": "Date"
  ```

- [ ] **Step 3: Ajouter la section "Colonnes affichées" au menu Vue existant**

  Dans le bloc `{viewOpen && (...)}` (~1903-1927), après la boucle `.map(opt => ...)` des filtres existants et avant le séparateur `<div style={{ height: 1, ...}} />` final, insérer un second groupe (seulement pertinent en vue Liste, donc conditionner tout le bloc sur `view === 'list'`) :
  ```tsx
  {view === 'list' && (
    <>
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>{t('board.columnsLabel')}</p>
      {([
        { key: 'status',   label: t('board.columnStatus')   },
        { key: 'priority', label: t('board.columnPriority') },
        { key: 'assignee', label: t('board.columnAssignee') },
        { key: 'activity', label: t('board.columnActivity') },
        { key: 'date',     label: t('board.columnDate')     },
      ] as const).map(col => (
        <button key={col.key} onClick={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span>{col.label}</span>
          <div style={{ width: 36, height: 20, borderRadius: 999, flexShrink: 0, background: visibleColumns[col.key] ? 'var(--accent)' : 'var(--surface-3)', position: 'relative', transition: 'background 0.15s' }}>
            <div style={{ position: 'absolute', top: 3, left: visibleColumns[col.key] ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: visibleColumns[col.key] ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 0.15s' }} />
          </div>
        </button>
      ))}
    </>
  )}
  ```

- [ ] **Step 4: Filtrer les colonnes du tableau de la vue Liste**

  Localiser le composant `Section`/la table interne de la vue Liste (recherche `<th>` dans `Travail.tsx` — en-têtes "Titre", "Activité", "Assigné à", "Priorité", "Statut", "Date", et les `<td>` correspondantes dans le rendu de chaque ligne de tâche). Pour chaque colonne masquable, envelopper le `<th>` ET le `<td>` correspondant dans `{visibleColumns.xxx && (...)}`. `visibleColumns` doit être transmis en prop jusqu'au composant `Section`/à la ligne de tâche s'il est défini dans un composant enfant séparé (probable, vu la taille du fichier — vérifier si `Section`/`TaskRow` sont des fonctions distinctes dans ce fichier et leur passer `visibleColumns` comme nouvelle prop si oui).

  ⚠️ Ne jamais masquer la colonne "Titre" — c'est la seule colonne structurelle, pas dans `visibleColumns`.

- [ ] **Step 5: Vérifier**

  `npx tsc --noEmit -p tsconfig.app.json` — clean. Test live : décocher "Statut" dans le menu Vue en vue Liste → la colonne disparaît de l'en-tête et de chaque ligne ; rafraîchir → reste décochée (préférence par personne, pas par projet — donc doit rester décochée même en changeant de projet).

- [ ] **Step 6: Commit**
  ```bash
  git add app/src/screens/Travail.tsx app/src/locales/fr.json app/src/locales/en.json
  git commit -m "feat(tableau): colonnes de la vue Liste masquables"
  ```

---

### Task 5: Renommage "section" → "catégorie" dans le texte utilisateur

**Files:**
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (namespace `board`, clés listées ci-dessous ; NE PAS toucher au namespace `templateModal` — `sectionsCount`/`sectionsCount_one`/`_other` y réfèrent aux sections d'un **modèle de projet**, un concept différent, hors scope de ce chantier)

**Interfaces:** Aucune — changement de texte uniquement, aucune signature ne change.

- [ ] **Step 1: Renommer les clés du namespace `board` — fr.json**

  Dans `app/src/locales/fr.json`, namespace `board` :
  - `"deleteSection": "Supprimer la section"` → `"Supprimer la catégorie"`
  - `"markSectionComplete": "Marquer la section comme terminée"` → `"Marquer la catégorie comme terminée"`
  - `"markSectionIncomplete": "Marquer la section comme active"` → `"Marquer la catégorie comme active"`
  - `"deleteSectionTitle": "Supprimer la section"` → `"Supprimer la catégorie"`
  - `"deleteSectionConfirm_one": "La section « {{section}} » contient {{count}} tâche, ..."` → `"La catégorie « {{section}} » contient {{count}} tâche, ..."`
  - `"deleteSectionConfirm_other"` : même remplacement `"La section"` → `"La catégorie"`
  - `"sectionNamePlaceholder": "Nom de la section..."` → `"Nom de la catégorie..."`
  - `"newSection": "Nouvelle section"` → `"Nouvelle catégorie"`
  - `"completedSections": "Sections terminées"` → `"Catégories terminées"`

  Il existe une SECONDE occurrence de plusieurs de ces mêmes clés plus bas dans `fr.json` (lignes ~698, ~1132-1137 d'après le grep précédent — un autre namespace réutilise les mêmes noms de clé, probablement `taskPanel` ou un namespace de modale). Avant d'éditer, relire le contexte de chaque occurrence (`Read` avec la ligne exacte) pour confirmer qu'elle appartient bien à un menu de tâche/section (à renommer) et non à `templateModal` (à laisser intacte) — seules les clés dans un namespace parlant de tâches/board doivent changer.

- [ ] **Step 2: Même renommage — en.json**

  Mêmes clés, `"section"` → `"category"` dans les libellés anglais correspondants (`"Delete section"` → `"Delete category"`, etc.).

- [ ] **Step 3: Vérifier qu'aucun texte "section" en dur ne reste dans le JSX**

  `grep -rn "section" app/src/screens/TravailBoard.tsx app/src/screens/Travail.tsx app/src/screens/Taches.tsx` limité aux chaînes littérales affichées (pas aux noms de variables/props) — confirmer qu'il n'y a pas de `"Renommer la section"` ou équivalent écrit directement dans le JSX plutôt que via `t(...)`. Si trouvé, corriger.

- [ ] **Step 4: Vérifier**

  `npx tsc --noEmit -p tsconfig.app.json` — clean. Test live : ouvrir le menu contextuel d'une colonne en vue Tableau (mode Catégorie) → "Renommer la catégorie"/"Supprimer la catégorie" ; bouton "+ Nouvelle catégorie" en bas des colonnes ; menu Vue → "Catégories terminées".

- [ ] **Step 5: Commit**
  ```bash
  git add app/src/locales/fr.json app/src/locales/en.json
  git commit -m "chore(i18n): renommer « section » en « catégorie » dans le texte utilisateur"
  ```

---

## Exécution

Chantier exécuté en **inline** dans cette même session (implémentation directe, sans dispatch de sous-agents) — cohérent avec le reste des chantiers de cette session. Les tasks restent dans l'ordre ci-dessus car chacune dépend de l'état posé par la précédente (Task 3 consomme `boardGroupBy`/`boardSections` de Tasks 1-2 ; Task 4 est indépendante et peut être faite en parallèle si besoin ; Task 5 doit être faite en dernier pour repérer tout texte en dur introduit par les tasks précédentes).
