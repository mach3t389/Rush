# Formatage riche pour la description des tâches — Design

## Contexte

Aujourd'hui, la description d'une tâche (`TaskPanel.tsx`) est un simple
`<textarea>` auto-agrandissant en édition, et un `<div>` en lecture qui
applique `linkify()` (URLs/@mentions cliquables) sur du texte brut. Aucune
mise en forme n'est possible : pas de gras/italique, pas de titres, pas de
listes, pas de cases à cocher.

L'utilisateur veut pouvoir structurer ses descriptions comme dans Trello :
listes à puces, cases à cocher cliquables, et mise en forme de texte de
base.

## Objectif

Remplacer l'édition/l'affichage texte brut de la description par un
éditeur de texte riche (Tiptap), avec une barre d'outils de formatage et
des listes de tâches interactives (checkboxes cliquables).

## Portée

- `TaskPanel.tsx` : édition et lecture de `task.description`.
- Les 3 aperçus infobulle qui lisent `task.description` ailleurs
  (`Travail.tsx`, `TravailBoard.tsx`, `Taches.tsx`).
- Hors scope : tout autre champ texte de l'app (commentaires, notes de
  facture, etc.) — pas touché par ce chantier.

## Architecture

**Librairie** : Tiptap (`@tiptap/react`, `@tiptap/pm`,
`@tiptap/starter-kit`, `@tiptap/extension-task-list`,
`@tiptap/extension-task-item`, `@tiptap/extension-link`). Première
dépendance de ce type dans le projet — écart assumé à la convention
"pas de librairies" parce que des checkboxes interactives fiables ne
sont pas raisonnablement faisables à la main avec `document.execCommand`.

**Stockage** : `task.description` reste une `string` (aucune migration de
schéma). Elle contient désormais du HTML généré par Tiptap au lieu de
texte brut.

**Mode lecture/édition** : même pattern que le champ actuel — en lecture,
on affiche le HTML rendu (readonly, cases à cocher toujours cliquables) ;
un clic dessus bascule en mode édition avec la barre d'outils visible
au-dessus. `Échap` ou clic en dehors repasse en lecture (comme
aujourd'hui pour le texte).

## Composants

### `app/src/components/TaskDescriptionEditor.tsx` (nouveau)

Composant isolé encapsulant tout Tiptap — `TaskPanel.tsx` ne manipule
jamais l'instance de l'éditeur directement.

- Props : `{ value: string; onChange: (html: string) => void; editing: boolean; onStartEdit: () => void; onStopEdit: () => void }`
- En interne : `useEditor()` de Tiptap avec les extensions listées
  ci-dessus, `editable: editing`.
- Rend la barre d'outils uniquement quand `editing === true`.
- Gère la conversion texte-brut → HTML à la première édition (voir
  "Compatibilité" ci-dessous).

### Barre d'outils

Rangée de boutons au-dessus de la zone d'édition, chaque bouton reflète
son état actif (fond/texte en `var(--accent)` quand actif à la position
du curseur, sinon `var(--text-3)` sur fond transparent — même langage
visuel que les boutons de `DocumentView`) :

| Bouton | Action Tiptap |
|--------|---------------|
| Gras | `toggleBold()` |
| Italique | `toggleItalic()` |
| Souligné | `toggleUnderline()` |
| Titre (menu H1/H2/H3/Normal) | `toggleHeading({ level })` / `setParagraph()` |
| Liste à puces | `toggleBulletList()` |
| Liste numérotée | `toggleOrderedList()` |
| Liste de tâches | `toggleTaskList()` |
| Lien | ouvre un petit prompt inline pour l'URL, `setLink({ href })` (ou `unsetLink()` si déjà actif) |

### Cases à cocher interactives

`TaskList`/`TaskItem` de Tiptap rendent des `<li>` avec une vraie
`<input type="checkbox">` cliquable — cliquable aussi bien en lecture
(éditeur non-`editable` mais Tiptap laisse les checkboxes réactives) qu'en
édition. L'état coché est stocké directement dans le HTML
(`data-checked="true"`), donc persisté avec `onUpdate?.({ description })`
comme le reste.

## Compatibilité avec les descriptions existantes

À la première ouverture de l'éditeur sur une description qui ne
contient aucune balise HTML (détection simple : absence de `<` suivi
d'une lettre), le texte brut est converti en paragraphes HTML en
préservant les sauts de ligne :

```ts
function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)              // paragraphes séparés par ligne(s) vide(s)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
```

Cette conversion n'écrit rien en base tant que l'utilisateur n'édite pas
réellement — elle sert uniquement à initialiser le contenu de l'éditeur
Tiptap. Dès la première sauvegarde (édition + blur), la description
devient du HTML en base, normalement.

## Aperçus infobulle (impact hors `TaskPanel.tsx`)

`Travail.tsx:568`, `TravailBoard.tsx:536`, `Taches.tsx:572` utilisent
tous `title={task.description.slice(0, 120)}` pour l'infobulle au
survol de l'icône "a une description". Avec une description en HTML,
ceci afficherait des balises brutes.

Nouvelle fonction utilitaire `app/src/utils/stripHtml.ts` :

```ts
export function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? '').trim();
}
```

Les 3 sites remplacent `task.description.slice(0, 120)` par
`stripHtml(task.description).slice(0, 120)`.

## Erreurs et cas limites

- Description vide → placeholder existant (`t('tasks.addDescription')`),
  inchangé.
- Coller du texte brut dans l'éditeur Tiptap → Tiptap le convertit
  automatiquement en paragraphes (comportement natif, pas de code
  supplémentaire nécessaire).
- Lien sans `http(s)://` saisi dans le prompt → préfixer `https://`
  automatiquement (même règle que `linkify.tsx` pour les `www.`).

## Tests

Pas de suite de tests automatisée dans ce projet (voir CLAUDE.md) — la
vérification se fait en live via le serveur de preview : édition d'une
description existante (texte brut) pour confirmer la conversion, ajout
de chaque type de formatage, clic sur une checkbox en lecture ET en
édition, vérification des 3 infobulles avec une description formatée.
