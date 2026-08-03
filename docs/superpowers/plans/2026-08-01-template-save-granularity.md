# Granularité de sauvegarde des modèles de projet — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les 3 cases fixes (Tâches/Fichiers/Aperçu) de l'écran « Créer un modèle depuis ce projet » par un contrôle fin — 5 sous-options sous Tâches (Sous-tâches/Description/Priorité/Assignés/Échéance) — avec « Tout cocher »/« Tout décocher ».

**Architecture:** Un seul fichier (`app/src/components/CreateTemplateFromProjectModal.tsx`). Aucun changement de type de données — `TemplateTask` a déjà tous les champs nécessaires. La capture d'une tâche devient une fonction récursive `mapTask` paramétrée par les options cochées, appliquée identiquement aux tâches de premier niveau et à leurs sous-tâches.

**Tech Stack:** React 19 + TypeScript, pas de tests automatisés — vérification par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) et preview navigateur.

## Global Constraints

- Le champ `status`/`statusLabel` n'est **jamais** capturé, avec ou sans case — aucune option pour ça.
- Décocher « Tâches » désactive visuellement (grisé, `disabled`) les 5 sous-cases sans changer leur état interne — les recocher ensuite retrouve l'état précédent, pas une remise à `true` par défaut.
- « Tout cocher »/« Tout décocher » agit sur les 8 cases (Fichiers, Tâches, les 5 sous-options, Aperçu), pas seulement sur les sous-options de Tâches.
- Une sous-tâche suit exactement les mêmes réglages que sa tâche parente — pas de configuration séparée par niveau de profondeur.
- Aucun changement à `TemplateTask`/`TemplateSection` (`app/src/data/templates.ts`) — seule la logique de capture dans `CreateTemplateFromProjectModal.tsx` change.
- Le comportement actuel avec toutes les cases cochées (état par défaut) doit être strictement identique à avant ce chantier — aucune régression pour l'usage le plus courant.

---

## File Structure

- **Modifier `app/src/components/CreateTemplateFromProjectModal.tsx`** — seul fichier de code touché : état des cases, fonction `mapTask` récursive, logique `handleSave`, JSX de l'écran.
- **Modifier `app/src/locales/fr.json` et `en.json`** — nouvelles clés pour les 5 sous-options + Tout cocher/Tout décocher.

---

### Task 1 : État des cases + capture récursive conditionnelle

**Files:**
- Modify: `app/src/components/CreateTemplateFromProjectModal.tsx:1-78` (imports, state, `handleSave`)

**Interfaces:**
- Consumes: `Task` type (`app/src/types`, a `priority: Priority`, `description?: string`, `dueDate?: string`, `assignees?: User[]`, `subtasks?: Task[]` — vérifier les noms exacts en lisant `app/src/types/index.ts` avant d'écrire le code, ne pas assumer).
- Produces: `TemplateTask` correctement peuplé selon les options cochées, consommé par le JSX de la Task 2 (mêmes noms d'état : `includeSubtasks`, `includeDescription`, `includePriority`, `includeAssignees`, `includeDueDate`).

- [ ] **Step 1 : Ajouter les 5 nouveaux états, tous initialisés à `true`**

Après la ligne `const [includeOverview, setIncludeOverview] = useState(true);` (ligne 29), ajouter :
```ts
const [includeSubtasks, setIncludeSubtasks] = useState(true);
const [includeDescription, setIncludeDescription] = useState(true);
const [includePriority, setIncludePriority] = useState(true);
const [includeAssignees, setIncludeAssignees] = useState(true);
const [includeDueDate, setIncludeDueDate] = useState(true);
```

- [ ] **Step 2 : Ajouter `checkAll`/`uncheckAll`**

Juste avant `handleSave` :
```ts
const checkAll = () => {
  setIncludeFiles(true); setIncludeTasks(true); setIncludeOverview(true);
  setIncludeSubtasks(true); setIncludeDescription(true); setIncludePriority(true);
  setIncludeAssignees(true); setIncludeDueDate(true);
};
const uncheckAll = () => {
  setIncludeFiles(false); setIncludeTasks(false); setIncludeOverview(false);
  setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
  setIncludeAssignees(false); setIncludeDueDate(false);
};
```

- [ ] **Step 3 : Ajouter la fonction de capture récursive `mapTask`, en dehors du composant (juste après les imports)**

Importer le type `Task` (vérifier son chemin d'import exact — probablement `'../types'`, déjà importé pour `Project` à la ligne 8, ajouter `Task` à cet import) :
```ts
import type { Project, Task } from '../types';
```

Puis, après la déclaration de `TEMPLATE_COLORS` (ligne 10) :
```ts
interface TaskCaptureOptions {
  subtasks: boolean;
  description: boolean;
  priority: boolean;
  assignees: boolean;
  dueDate: boolean;
}

function mapTask(t: Task, opts: TaskCaptureOptions): TemplateTask {
  return {
    title: t.title,
    priority: opts.priority ? t.priority : 'normal',
    description: opts.description ? t.description : undefined,
    dueDate: opts.dueDate ? t.dueDate : undefined,
    assignees: opts.assignees ? t.assignees : undefined,
    subtasks: opts.subtasks ? (t.subtasks ?? []).map(st => mapTask(st, opts)) : [],
  };
}
```
(`'normal'` comme valeur par défaut de `priority` quand la case est décochée — `TemplateTask.priority` est un champ obligatoire, pas optionnel, donc il faut toujours fournir une valeur ; `'normal'` est déjà utilisé comme valeur de repli ailleurs dans le code de cette feature, ex. `tt.priority ?? 'normal'` dans `ProjectsListView.tsx`.)

Importer `TemplateTask` dans le même import que `TemplateSection` (ligne 7) — vérifier qu'il est bien exporté par `app/src/data/templates.ts` (il l'est, `export interface TemplateTask`).

- [ ] **Step 4 : Remplacer la construction de `sections` dans `handleSave`**

Remplacer (ligne 52-54) :
```ts
    const sections: TemplateSection[] | undefined = includeTasks
      ? getSections(project.id).map(s => ({ label: s.label, tasks: s.tasks.map(t => ({ title: t.title, priority: t.priority, description: t.description, status: t.status, statusLabel: t.statusLabel, dueDate: t.dueDate, assignees: t.assignees, subtasks: [] })) }))
      : undefined;
```
par :
```ts
    const captureOpts: TaskCaptureOptions = {
      subtasks: includeSubtasks,
      description: includeDescription,
      priority: includePriority,
      assignees: includeAssignees,
      dueDate: includeDueDate,
    };
    const sections: TemplateSection[] | undefined = includeTasks
      ? getSections(project.id).map(s => ({ label: s.label, tasks: s.tasks.map(t => mapTask(t, captureOpts)) }))
      : undefined;
```

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : des erreurs JSX si Task 2 n'est pas encore faite (les nouveaux états ne sont pas encore utilisés dans le JSX — ce n'est PAS une erreur de compilation, juste un avertissement TS `noUnusedLocals` potentiel si activé). Si le typecheck échoue à cause de variables non utilisées, c'est attendu tant que la Task 2 n'est pas complétée — ne pas s'en inquiéter à ce stade, mais le confirmer explicitement dans le rapport de cette tâche plutôt que de le passer sous silence.

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/CreateTemplateFromProjectModal.tsx
git commit -m "feat(templates): capture récursive et conditionnelle des tâches (sous-tâches/description/priorité/assignés/échéance)"
```

---

### Task 2 : Écran — sous-cases indentées + Tout cocher/Tout décocher

**Files:**
- Modify: `app/src/components/CreateTemplateFromProjectModal.tsx:117-130` (bloc des 3 cases actuelles)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `includeSubtasks`/`includeDescription`/`includePriority`/`includeAssignees`/`includeDueDate` + leurs setters, `checkAll`/`uncheckAll` (Task 1).

- [ ] **Step 1 : Remplacer le bloc de cases (lignes 117-130)**

```tsx
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '3px 0' }}>
            <input type="checkbox" checked={includeFiles} onChange={e => setIncludeFiles(e.target.checked)} />
            {t('projectTemplates.includeFiles')}
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '3px 0', marginTop: 4 }}>
            <input type="checkbox" checked={includeTasks} onChange={e => setIncludeTasks(e.target.checked)} />
            {t('projectTemplates.includeTasks')}
          </label>
          <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: includeTasks ? 'var(--text-2)' : 'var(--text-3)', cursor: includeTasks ? 'pointer' : 'default', padding: '2px 0', opacity: includeTasks ? 1 : 0.5 }}>
              <input type="checkbox" checked={includeSubtasks} disabled={!includeTasks} onChange={e => setIncludeSubtasks(e.target.checked)} />
              {t('projectTemplates.includeSubtasks')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: includeTasks ? 'var(--text-2)' : 'var(--text-3)', cursor: includeTasks ? 'pointer' : 'default', padding: '2px 0', opacity: includeTasks ? 1 : 0.5 }}>
              <input type="checkbox" checked={includeDescription} disabled={!includeTasks} onChange={e => setIncludeDescription(e.target.checked)} />
              {t('projectTemplates.includeTaskDescription')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: includeTasks ? 'var(--text-2)' : 'var(--text-3)', cursor: includeTasks ? 'pointer' : 'default', padding: '2px 0', opacity: includeTasks ? 1 : 0.5 }}>
              <input type="checkbox" checked={includePriority} disabled={!includeTasks} onChange={e => setIncludePriority(e.target.checked)} />
              {t('projectTemplates.includePriority')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: includeTasks ? 'var(--text-2)' : 'var(--text-3)', cursor: includeTasks ? 'pointer' : 'default', padding: '2px 0', opacity: includeTasks ? 1 : 0.5 }}>
              <input type="checkbox" checked={includeAssignees} disabled={!includeTasks} onChange={e => setIncludeAssignees(e.target.checked)} />
              {t('projectTemplates.includeAssignees')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: includeTasks ? 'var(--text-2)' : 'var(--text-3)', cursor: includeTasks ? 'pointer' : 'default', padding: '2px 0', opacity: includeTasks ? 1 : 0.5 }}>
              <input type="checkbox" checked={includeDueDate} disabled={!includeTasks} onChange={e => setIncludeDueDate(e.target.checked)} />
              {t('projectTemplates.includeDueDate')}
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '3px 0', marginTop: 4 }}>
            <input type="checkbox" checked={includeOverview} onChange={e => setIncludeOverview(e.target.checked)} />
            {t('projectTemplates.includeOverview')}
          </label>

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={checkAll} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }}>{t('projectTemplates.checkAll')}</button>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>·</span>
            <button onClick={uncheckAll} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }}>{t('projectTemplates.uncheckAll')}</button>
          </div>
        </div>
```

- [ ] **Step 2 : Ajouter les nouvelles clés i18n**

Dans `app/src/locales/fr.json`, sous le namespace `projectTemplates` (à côté des clés `includeTasks`/`includeFiles`/`includeOverview` déjà présentes) :
```json
"includeSubtasks": "Sous-tâches",
"includeTaskDescription": "Description",
"includePriority": "Priorité",
"includeAssignees": "Assignés",
"includeDueDate": "Échéance",
"checkAll": "Tout cocher",
"uncheckAll": "Tout décocher"
```
Dans `app/src/locales/en.json` :
```json
"includeSubtasks": "Subtasks",
"includeTaskDescription": "Description",
"includePriority": "Priority",
"includeAssignees": "Assignees",
"includeDueDate": "Due date",
"checkAll": "Check all",
"uncheckAll": "Uncheck all"
```
**Attention** : `includeTaskDescription` est une clé délibérément distincte de `descriptionPlaceholder`/toute autre clé « description » déjà présente dans le namespace `projectTemplates` (qui concerne la description du MODÈLE lui-même, pas celle des tâches capturées) — vérifier qu'aucune collision de clé n'existe avant d'ajouter.

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : 0 erreur.

- [ ] **Step 4 : Vérification manuelle en preview**

1. Ouvrir un projet réel avec des tâches (dont certaines avec sous-tâches, description, priorité, assigné, échéance) → « Créer un modèle depuis ce projet » → toutes les cases cochées par défaut → enregistrer → aller dans Modèles, ouvrir ce nouveau modèle en édition (brouillon) → confirmer que le contenu est identique à avant ce chantier (aucune régression).
2. Recommencer en décochant seulement « Description » → confirmer qu'aucune tâche du modèle résultant n'a de description, mais que sous-tâches/priorité/assignés/échéance sont toujours là.
3. Décocher « Tâches » entièrement → confirmer que les 5 sous-cases deviennent grisées et non cliquables. Recocher « Tâches » → confirmer que les sous-cases retrouvent leur état d'avant (pas remises à `true` si elles avaient été décochées individuellement avant de décocher Tâches).
4. Cliquer « Tout décocher » → toutes les 8 cases se décochent (Fichiers/Tâches/5 sous-options/Aperçu). Cliquer « Tout cocher » → toutes se recochent.
5. Décocher « Sous-tâches » seulement → confirmer qu'aucune tâche du modèle n'a de sous-tâches, même si le projet source en avait.

- [ ] **Step 5 : Commit**

```bash
git add app/src/components/CreateTemplateFromProjectModal.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(templates): écran de sauvegarde avec sous-options Tâches (façon Lightroom) + Tout cocher/décocher"
```

---

### Task 3 : Revue finale

- [ ] **Step 1 : Typecheck complet**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 2 : Dispatcher la revue finale de branche**

Utiliser `superpowers:requesting-code-review`, puis `superpowers:finishing-a-development-branch`.

## Self-Review

**Couverture :** statut jamais capturé (Task 1, `mapTask` n'inclut jamais `status`/`statusLabel`) ; 5 sous-options par défaut cochées (Task 1 Step 1) ; sous-tâche suit les réglages du parent (Task 1 Step 3, appel récursif avec les mêmes `opts`) ; présentation liste indentée sans tableau (Task 2 Step 1, validée par maquette) ; Tout cocher/décocher sur l'écran complet (Task 1 Step 2, Task 2 Step 1) ; aucun changement de type de données (confirmé, `TemplateTask`/`TemplateSection` non touchés).

**Cohérence des noms :** `TaskCaptureOptions`/`mapTask` définis en Task 1, consommés uniquement par `handleSave` dans le même fichier — pas de dérive de nom possible entre tâches puisque tout est dans un seul fichier modifié par les deux tasks.
