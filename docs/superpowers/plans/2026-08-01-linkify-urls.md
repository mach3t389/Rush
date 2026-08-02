# Liens cliquables (auto-détection d'URLs) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Détecter automatiquement les URLs dans le texte libre et les rendre cliquables, dans 3 surfaces : commentaires, description de tâche, et module Notes internes du projet.

**Architecture:** Un utilitaire partagé `linkify(text): ReactNode[]` (généralisation de `renderMentions` existant dans `RevisionComments.tsx`) découpe le texte sur les URLs (et les `@mentions` déjà gérées) et retourne un mélange de texte brut et de `<a>`/`<span>`. Pour les commentaires (jamais réédités en ligne), c'est un remplacement direct au rendu. Pour la description de tâche et les Notes (actuellement des `<textarea>` toujours en mode édition), on ajoute un **mode lecture** — même pattern « cliquer pour éditer » déjà utilisé pour le titre de tâche dans `TaskPanel.tsx` (`editingTitle`/`titleValue`, bascule via `onClick`/`onBlur`/`Enter`/`Escape`) — pas de détection « en tapant » façon Google Docs, qui exigerait un éditeur enrichi complet et n'est pas demandée.

**Tech Stack:** React 19 + TypeScript, pas de tests automatisés — vérification par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) et preview navigateur.

## Global Constraints

- Pas de détection « en temps réel pendant la frappe » (façon Google Docs) — décidé explicitement en discussion : plus complexe que nécessaire pour le besoin exprimé. Détection au rendu (mode lecture) seulement.
- Les liens doivent s'ouvrir dans un nouvel onglet (`target="_blank" rel="noopener noreferrer"`), style couleur `var(--accent)` cohérent avec le style déjà utilisé pour les `@mentions`.
- La description de tâche (`TaskPanel.tsx`) et les Notes (`TravailOverview.tsx`) passent d'un `<textarea>` toujours visible à un bascule lecture/édition — reproduire exactement le pattern déjà en place pour le titre de tâche dans `TaskPanel.tsx` (lignes ~617-999 : `editingX`/`xValue` state, `onBlur`+`Enter`(sans Shift)+`Escape` pour valider/annuler, `onClick` sur l'élément affiché pour entrer en édition, feedback hover, tooltip `title={t('...clickToEdit...')}`).
- Le document (éditeur riche `DocumentView` dans `ResourceDetail.tsx`) est **hors scope** — c'est déjà du HTML éditable, différent mécanisme, pas touché ici.
- Sauvegarde : ne pas changer le mécanisme de sauvegarde existant (immédiat par keystroke pour la description via `onUpdate`, debounce 500ms pour les Notes via `setProjectContent`) — seul le rendu/l'interaction change.

---

## File Structure

- **Créer `app/src/utils/linkify.tsx`** — utilitaire partagé, exporté `linkify(text: string): React.ReactNode[]`.
- **Modifier `app/src/components/RevisionComments.tsx`** — remplace `renderMentions` par `linkify` (généralisé pour couvrir mentions + URLs).
- **Modifier `app/src/components/TaskPanel.tsx`** — ajoute le mode lecture/édition pour la description.
- **Modifier `app/src/screens/TravailOverview.tsx`** — ajoute le mode lecture/édition pour le module Notes.

---

### Task 1 : Utilitaire partagé `linkify`

**Files:**
- Create: `app/src/utils/linkify.tsx`
- Modify: `app/src/components/RevisionComments.tsx:7-13` (remplace `renderMentions`), `:235`, `:245` (call sites)

**Interfaces:**
- Produces: `export function linkify(text: string): React.ReactNode[]` — détecte `@mentions` (span accent, gras) ET urls `http(s)://…`/`www.…` (`<a>` accent, souligné, `target="_blank" rel="noopener noreferrer"`), retourne le reste en texte brut. Signature compatible avec l'usage direct en enfant JSX (`{linkify(text)}`), comme `renderMentions` actuellement.

- [ ] **Step 1 : Créer l'utilitaire**

```tsx
import React from 'react';

const URL_OR_MENTION = /(@\S+|https?:\/\/[^\s<]+|www\.[^\s<]+)/g;

function isUrl(part: string): boolean {
  return /^(https?:\/\/|www\.)/.test(part);
}

export function linkify(text: string): React.ReactNode[] {
  return text.split(URL_OR_MENTION).map((part, i) => {
    if (part.startsWith('@')) {
      return <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>;
    }
    if (isUrl(part)) {
      const href = part.startsWith('www.') ? `https://${part}` : part;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
```

`onClick={e => e.stopPropagation()}` évite qu'un clic sur le lien déclenche un handler parent (ex. le `onClick` d'entrée en édition sur la description/notes une fois Task 3/4 en place — cliquer sur un lien doit ouvrir le lien, pas basculer en mode édition).

- [ ] **Step 2 : Remplacer `renderMentions` dans `RevisionComments.tsx`**

Supprimer la fonction `renderMentions` (lignes 7-13). Ajouter `import { linkify } from '../utils/linkify';` en haut du fichier. Remplacer les deux appels :
- Ligne 235 : `<p style={{ ... }}>{renderMentions(comment.text)}</p>` → `<p style={{ ... }}>{linkify(comment.text)}</p>`
- Ligne 245 : `<span style={{ ... }}>{renderMentions(r.text)}</span>` → `<span style={{ ... }}>{linkify(r.text)}</span>`

- [ ] **Step 3 : Vérifier**

```bash
npx tsc --noEmit -p tsconfig.app.json
```
Attendu : zéro erreur.

- [ ] **Step 4 : Commit**

```bash
git add app/src/utils/linkify.tsx app/src/components/RevisionComments.tsx
git commit -m "feat(linkify): utilitaire partagé de détection d'URLs, appliqué aux commentaires"
```

---

### Task 2 : Mode lecture/édition — description de tâche

**Files:**
- Modify: `app/src/components/TaskPanel.tsx:1285-1302` (bloc description), ajoute un state `editingDescription` près de `description` (ligne 539)

**Interfaces:**
- Consumes: `linkify` (Task 1).

- [ ] **Step 1 : Ajouter l'état d'édition**

Près de la ligne 539 (`const [description, setDescription] = useState(task.description ?? '');`), ajouter :
```ts
const [editingDescription, setEditingDescription] = useState(false);
const descViewRef = useRef<HTMLDivElement>(null);
```
(Réutilise `useState`/`useRef` déjà importés dans ce fichier — vérifier, sinon ajouter à l'import React existant.)

- [ ] **Step 2 : Remplacer le bloc description par une bascule lecture/édition**

Remplacer les lignes 1285-1302 par (reproduit exactement le pattern du titre, lignes 966-1000, appliqué à la description — textarea en édition, div lecture avec `linkify` sinon) :

```tsx
<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
  {secLabel(t('taskPanel.description'))}
  {editingDescription ? (
    <textarea
      ref={descRef}
      value={description}
      onChange={e => { setDescription(e.target.value); onUpdate?.({ description: e.target.value }); }}
      onBlur={() => setEditingDescription(false)}
      onKeyDown={e => { if (e.key === 'Escape') { setEditingDescription(false); } }}
      placeholder={t('tasks.addDescription')}
      rows={2}
      autoFocus
      style={{
        width: '100%', padding: '8px 12px', borderRadius: 10,
        border: '1px solid var(--accent)', background: 'var(--surface-3)',
        color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
        resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
        overflow: 'hidden', minHeight: 56,
      }}
    />
  ) : (
    <div
      ref={descViewRef}
      onClick={() => setEditingDescription(true)}
      title={t('taskPanel.clickToEdit')}
      style={{
        width: '100%', padding: '8px 12px', borderRadius: 10,
        border: '1px solid transparent', background: 'transparent',
        color: description ? 'var(--text)' : 'var(--text-3)', fontSize: 13, fontFamily: 'var(--ff-text)',
        lineHeight: 1.6, boxSizing: 'border-box', cursor: 'text', minHeight: 56,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {description ? linkify(description) : t('tasks.addDescription')}
    </div>
  )}
</div>
```

Retirer l'effet auto-grow (lignes 563-568) UNIQUEMENT s'il ne s'applique qu'à `descRef` et que `descRef` n'est monté qu'en mode édition — vérifier que l'effet ne casse rien quand `descRef.current` est `null` (mode lecture) : l'effet actuel fait déjà `if (descRef.current)`, donc il est sans danger tel quel, ne pas le retirer.

Ajouter `import { linkify } from '../utils/linkify';` en haut du fichier si absent.

- [ ] **Step 3 : Vérifier la clé i18n `taskPanel.clickToEdit`**

Elle existe déjà (réutilisée du pattern titre, `grep -n "clickToEdit" app/src/locales/fr.json app/src/locales/en.json` doit la trouver) — sinon l'ajouter dans les deux fichiers de locale (`"clickToEdit": "Cliquer pour modifier"` / `"Click to edit"`).

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 5 : Vérification manuelle en preview**

Ouvrir une tâche, écrire une description contenant une URL (ex. `https://exemple.com`) et cliquer en dehors → le texte s'affiche en mode lecture avec le lien souligné et cliquable (ouvre un nouvel onglet, ne bascule pas en mode édition). Cliquer sur le texte (hors du lien) → repasse en mode édition, `Escape` annule la bascule (mais garde le texte déjà tapé, puisque la sauvegarde est immédiate par keystroke — Escape ferme juste le mode édition, ne défait pas le texte).

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/TaskPanel.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(taskPanel): mode lecture avec liens cliquables pour la description"
```

---

### Task 3 : Mode lecture/édition — module Notes internes

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx:1267-1274` (bloc Notes), ajoute un state `editingNotes` près de `notes` (ligne 463)

**Interfaces:**
- Consumes: `linkify` (Task 1).

- [ ] **Step 1 : Ajouter l'état d'édition**

Près de la ligne 463 (`const [notes, setNotes] = useState('');`), ajouter :
```ts
const [editingNotes, setEditingNotes] = useState(false);
```

- [ ] **Step 2 : Remplacer le bloc Notes par une bascule lecture/édition**

Remplacer les lignes 1267-1274 par :

```tsx
) : section.kind === 'notes' ? (
  editingNotes ? (
    <textarea
      value={notes}
      onChange={e => setNotes(e.target.value)}
      onBlur={() => setEditingNotes(false)}
      onKeyDown={e => { if (e.key === 'Escape') setEditingNotes(false); }}
      placeholder={t('overview.internalNotesPlaceholder')}
      rows={5}
      autoFocus
      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', colorScheme: 'dark' }}
    />
  ) : (
    <div
      onClick={() => setEditingNotes(true)}
      title={t('taskPanel.clickToEdit')}
      style={{ width: '100%', minHeight: 90, padding: '10px 12px', borderRadius: 10, border: '1px solid transparent', color: notes ? 'var(--text)' : 'var(--text-3)', fontSize: 13, fontFamily: 'var(--ff-text)', lineHeight: 1.6, boxSizing: 'border-box', cursor: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {notes ? linkify(notes) : t('overview.internalNotesPlaceholder')}
    </div>
  )
) : null}
```

Ajouter `import { linkify } from '../utils/linkify';` en haut du fichier si absent (vérifier d'abord — `TravailOverview.tsx` importe déjà beaucoup de modules, insérer près des autres imports `../utils`/`../data`).

Ne PAS toucher au module `kind === 'note'` (singulier, lignes 1182-1188, sections personnalisées) dans cette tâche — hors scope de ce plan, seul le module fixe « Notes internes » est concerné. (Si souhaité plus tard, le même traitement pourrait s'y appliquer, mais ce n'est pas demandé ici.)

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 4 : Vérification manuelle en preview**

Aller dans l'onglet Aperçu d'un projet, module Notes internes, écrire une URL, cliquer en dehors → lien cliquable en mode lecture, sauvegarde debounce toujours fonctionnelle (attendre 500ms, recharger la page, confirmer la persistance).

- [ ] **Step 5 : Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "feat(overview): mode lecture avec liens cliquables pour les Notes internes"
```

---

### Task 4 : Revue finale et vérification bout-en-bout

- [ ] **Step 1 : Typecheck complet**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 2 : Grep de contrôle**

```bash
grep -rn "renderMentions" app/src
```
Attendu : vide (entièrement remplacé par `linkify`).

- [ ] **Step 3 : Parcours de vérification en preview**

1. Commentaire avec une URL et une `@mention` dans la même phrase → les deux sont stylées correctement, le lien s'ouvre dans un nouvel onglet.
2. Description de tâche : mode lecture affiche le lien cliquable, cliquer sur le texte (pas le lien) entre en édition, cliquer ailleurs ou Tab sort et re-render en lecture avec le lien à jour.
3. Notes internes du projet : même comportement, persistance confirmée après rechargement.
4. Un texte sans URL ne montre aucune régression (rendu identique à avant, juste dans un mode lecture qui se comporte comme avant).

- [ ] **Step 4 : Dispatcher la revue finale de branche**

Utiliser `superpowers:requesting-code-review`, puis `superpowers:finishing-a-development-branch`.

## Self-Review

**Couverture :** Commentaires (Task 1), description de tâche (Task 2), Notes internes (Task 3) — les 3 surfaces demandées. Documents explicitement exclus (contrainte globale). Pas de détection en temps réel (contrainte globale, confirmée par l'utilisateur).

**Cohérence :** `linkify` a la même signature/forme de sortie que l'ancien `renderMentions` (généralisation stricte), donc son usage en commentaires est un remplacement 1:1 sans risque de régression visuelle sur les mentions existantes. Le pattern lecture/édition de Task 2/3 reproduit exactement celui déjà validé pour le titre de tâche dans le même fichier — pas de nouvelle interaction inventée.
