# Refonte de l'assistant « Nouveau projet » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger le bug de largeur de l'étape Infos, retirer le doublon « Projet vide »/« Projet vierge », ajouter Budget + Description à l'étape Infos, et rendre les 3 listes (modèles, clients, équipe) utilisables à grande échelle via une recherche + un conteneur scrollable — tout dans `NewProjectModal` (`app/src/components/ProjectsListView.tsx`).

**Architecture:** Un seul composant modifié (`NewProjectModal`), pas de nouveau fichier nécessaire. Un pattern de recherche réutilisé 3 fois (modèles/clients/équipe), calqué sur le pill de recherche déjà utilisé ailleurs dans l'app (`FichiersGlobal.tsx`). Les modèles personnalisés (déjà retournés par `loadAllTemplates()`, filtrés sur `!builtIn`) rejoignent les modèles officiels dans une liste unique triable/filtrable.

**Tech Stack:** React 19 + TypeScript, pas de tests automatisés — vérification par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) et preview navigateur.

## Global Constraints

- Aucune nouvelle interface externe — tout reste dans `NewProjectModal`, même fichier.
- Le pattern recherche + scroll doit être **identique visuellement** sur les 3 listes (modèles, clients, équipe) — un seul style de pill de recherche, une seule logique de hauteur max + scroll, pas trois patterns différents inventés séparément.
- Budget et Description sont **optionnels**, pré-remplissables ici, toujours éditables plus tard via `ProjectEditPanel` (Aperçu du projet) — réutiliser exactement les mêmes champs/styles que `ProjectEditPanel` (`ProjectCard.tsx` lignes 221-243), pas une réinvention.
- `loadAllTemplates()` retourne déjà built-in + custom ensemble (`ProjectTemplate.builtIn?: boolean` distingue les deux) — pas besoin d'appel séparé pour les modèles personnalisés.
- Ne pas casser `create()` — les champs `budget`/`description` s'ajoutent à l'objet `Project` construit, sans changer le flux `setSections`/`addFolderTree`/`await onCreate`/`setProjectContent` existant.

---

## File Structure

- **Modifier `app/src/components/ProjectsListView.tsx`** — seul fichier de code touché : `NewProjectModal` (états, étape 'start', étape 'info', étape 'team', `create()`).
- **Modifier `app/src/locales/fr.json` et `en.json`** — nouvelles clés de recherche/placeholder.

---

### Task 1 : Corriger le bug de largeur + retirer le doublon « Projet vide »/« Projet vierge »

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:216-290` (étape 'start'), `:293-401` (étape 'info', `maxWidth: 520` à la ligne 294), `:94-98` (`QUICK_START_TEMPLATE_ORDER`)

**Interfaces:**
- Consumes: `loadAllTemplates()` (déjà importé).

- [ ] **Step 1 : Retirer le `maxWidth: 520` de l'étape Infos**

Ligne 294, remplacer :
```tsx
<div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 18 }}>
```
par :
```tsx
<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
```
(Le conteneur modal fait déjà `width: 820` — l'étape Infos doit utiliser cette largeur comme l'étape Départ, pas une largeur réduite arbitraire.)

- [ ] **Step 2 : Retirer la carte « Projet vide » codée en dur (lignes 218-239)**

Supprimer entièrement le bloc :
```tsx
<div>
  <p style={{ ... }}>{t('projects.blankCanvas')}</p>
  <div onClick={() => setTemplateId(null)} style={{ ... }}>
    ...
  </div>
</div>
```
(lignes 218-239 de l'étape 'start', avant le bloc `startFromTemplate`).

- [ ] **Step 3 : Retirer `tpl-vierge` de `QUICK_START_TEMPLATE_ORDER`**

Ligne 94, `tpl-vierge` reste le SEUL représentant du choix « projet vide » — il apparaît maintenant comme une carte normale dans la grille de modèles (avec son icône/description existante), plus besoin du bloc séparé retiré à l'étape précédente. Pas de changement de contenu nécessaire ici au-delà de ce qui se passe naturellement (l'array garde ses 4 ids, `tpl-vierge` inclus — c'est la SEULE apparition maintenant, plus de doublon).

- [ ] **Step 4 : Vérifier que `templateId === null` n'est plus un état atteignable/nécessaire**

Puisque le bloc qui appelait `setTemplateId(null)` est retiré, `templateId` commence à `null` (ligne 78, valeur initiale inchangée) mais aucune carte ne le remet à `null` après un premier choix — c'est correct : l'utilisateur doit maintenant explicitement cliquer sur une carte (dont « Projet vierge ») pour avancer. Vérifier que `canNext` (ligne 107-109, `step === 'start' ? true : ...`) permet toujours de continuer même sans sélection explicite (comportement actuel conservé : `start` accepte toujours `true`) — donc si personne ne clique, `templateId` reste `null` et `selectedTemplate` sera `null`, ce qui correspond à un projet sans modèle (équivalent de l'ancien « Projet vide »). Aucun changement de `canNext` nécessaire.

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/ProjectsListView.tsx
git commit -m "fix(nouveauProjet): largeur de l'étape Infos + retrait du doublon Projet vide/vierge"
```

---

### Task 2 : Ajouter Budget + Description à l'étape Infos

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:80-89` (states), `:293-401` (JSX étape 'info'), `:125-182` (`create()`)

**Interfaces:**
- Consumes: `Project.budget?: number`, `Project.description?: string` (déjà sur le type, `app/src/types/index.ts:60-61`).

- [ ] **Step 1 : Ajouter les states**

Près de la ligne 83 (`const [deliveryDate, setDeliveryDate] = useState('');`), ajouter :
```ts
const [budget, setBudget] = useState('');
const [description, setDescription] = useState('');
```

- [ ] **Step 2 : Ajouter les champs JSX, calqués sur `ProjectEditPanel` (`ProjectCard.tsx:221-243`)**

Insérer après le bloc « Date de livraison » (après la ligne ~382, avant le bloc `selectedTemplate &&` résumé de modèle) :
```tsx
<div>
  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.budgetLabel')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('projects.optional')}</span></label>
  <input
    value={budget}
    onChange={e => setBudget(e.target.value)}
    placeholder={t('projects.budget')}
    inputMode="numeric"
    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-mono)' }}
  />
</div>

<div>
  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.description')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('projects.optional')}</span></label>
  <textarea
    value={description}
    onChange={e => setDescription(e.target.value)}
    placeholder={t('projects.projectName')}
    rows={3}
    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)', resize: 'vertical', lineHeight: 1.5 }}
  />
</div>
```
(Le placeholder `t('projects.projectName')` pour la description reproduit exactement l'usage existant dans `ProjectEditPanel` — clé déjà existante, pas une nouvelle.)

- [ ] **Step 3 : Écrire les valeurs dans `create()`**

Dans la construction de `newProject` (vers la ligne 140-155), ajouter deux champs, avec le même parsing que `ProjectEditPanel` (`ProjectCard.tsx:81`, `Number(String(lBudget).replace(/[^\d.]/g, ''))`) :
```ts
const budgetNum = Number(String(budget).replace(/[^\d.]/g, ''));
```
puis dans l'objet `newProject` :
```ts
budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
description: description.trim() || undefined,
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 5 : Vérification manuelle en preview**

Créer un projet en remplissant Budget et Description à l'étape Infos → aller dans Aperçu du projet créé, confirmer que les deux valeurs sont bien là et éditables via `ProjectEditPanel` comme avant.

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/ProjectsListView.tsx
git commit -m "feat(nouveauProjet): ajoute Budget et Description à l'étape Infos"
```

---

### Task 3 : Pattern de recherche + scroll réutilisable — modèles

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:94-98` (retire le filtre quick-start), `:241-288` (grille de modèles, ajoute recherche + scroll)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Produces: un état local `templateSearch: string`, un style `searchPillStyle` réutilisé tel quel dans Task 4/5.

- [ ] **Step 1 : Remplacer la liste restreinte par la liste complète (built-in + personnalisés)**

Lignes 91-98, remplacer :
```ts
// Sélection restreinte de modèles pour ce wizard de démarrage rapide — le reste
// reste disponible dans la bibliothèque complète (Modèles). Ordre volontaire :
// "Projet vierge" en premier, puis 3 modèles pré-remplis représentatifs.
const QUICK_START_TEMPLATE_ORDER = ['tpl-vierge', 'tpl-shoot-photo', 'tpl-motion-design', 'tpl-film-institutionnel'];
const allTemplates = loadAllTemplates();
const templates = QUICK_START_TEMPLATE_ORDER
  .map(id => allTemplates.find(t => t.id === id))
  .filter((t): t is ProjectTemplate => !!t);
```
par :
```ts
const [templateSearch, setTemplateSearch] = useState('');
const allTemplates = loadAllTemplates();
// "Projet vierge" (builtIn, id 'tpl-vierge') en premier, puis les modèles
// personnalisés (les plus récents d'abord), puis le reste des modèles officiels —
// tout est maintenant visible ici, plus de sous-ensemble restreint séparé de la
// bibliothèque complète (Modèles).
const sortedTemplates = [
  ...allTemplates.filter(t => t.id === 'tpl-vierge'),
  ...allTemplates.filter(t => !t.builtIn).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  ...allTemplates.filter(t => t.builtIn && t.id !== 'tpl-vierge'),
];
const templates = templateSearch.trim()
  ? sortedTemplates.filter(t => t.name.toLowerCase().includes(templateSearch.trim().toLowerCase()) || t.tags.some(tag => tag.toLowerCase().includes(templateSearch.trim().toLowerCase())))
  : sortedTemplates;
```

- [ ] **Step 2 : Ajouter la barre de recherche + conteneur scrollable autour de la grille**

Dans le bloc `startFromTemplate` (lignes ~241-288), juste après le `<p>` de titre de section et avant la `<div style={{ display: 'grid', ... }}>`, insérer la barre de recherche (pattern calqué sur `FichiersGlobal.tsx:1707-1716`) :
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '6px 12px', border: '1px solid var(--border)', marginBottom: 10 }}>
  <SFIcon name="search" size={13} color="var(--text-3)" />
  <input
    value={templateSearch}
    onChange={e => setTemplateSearch(e.target.value)}
    placeholder={t('projects.searchTemplatesPlaceholder')}
    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}
  />
</div>
```
Puis envelopper la grille existante (`<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>...</div>`) dans un conteneur scrollable :
```tsx
<div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
    {templates.map(tpl => { /* contenu existant inchangé */ })}
  </div>
  {templates.length === 0 && (
    <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>{t('projects.noTemplatesFound')}</p>
  )}
</div>
```

- [ ] **Step 3 : Ajouter les clés i18n**

Dans `app/src/locales/fr.json`, sous le namespace `projects` (près des autres clés `startFromTemplate`/`blankCanvas`) :
```json
"searchTemplatesPlaceholder": "Rechercher un modèle…",
"noTemplatesFound": "Aucun modèle ne correspond à cette recherche."
```
Dans `app/src/locales/en.json` :
```json
"searchTemplatesPlaceholder": "Search a template…",
"noTemplatesFound": "No template matches this search."
```

- [ ] **Step 4 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 5 : Commit**

```bash
git add app/src/components/ProjectsListView.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(nouveauProjet): recherche + défilement pour les modèles, inclut les modèles personnalisés"
```

---

### Task 4 : Pattern de recherche + scroll — clients (avec épinglés en premier)

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:306-327` (bloc client de l'étape 'info')
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `isPinnedClient(id)` (`app/src/data/pinnedStore.ts`).

- [ ] **Step 1 : Ajouter l'état de recherche et importer `isPinnedClient`**

Ajouter en haut du fichier : `import { isPinnedClient } from '../data/pinnedStore';` (vérifier le nom exact exporté — le rapport de recherche le donne comme `isPinnedClient`, confirmer par lecture du fichier avant d'importer). Ajouter près des autres états du modal :
```ts
const [clientSearch, setClientSearch] = useState('');
```

- [ ] **Step 2 : Trier clients épinglés en premier, filtrer par recherche**

Juste avant le rendu du bloc client (ligne ~306), ajouter :
```ts
const sortedClients = [...clients].sort((a, b) => Number(isPinnedClient(b.id)) - Number(isPinnedClient(a.id)));
const filteredClients = clientSearch.trim()
  ? sortedClients.filter(c => c.name.toLowerCase().includes(clientSearch.trim().toLowerCase()))
  : sortedClients;
```

- [ ] **Step 3 : Ajouter la barre de recherche + scroll, seulement si la liste est longue**

Remplacer la grille de clients (lignes 308-326) — n'afficher la barre de recherche que si `clients.length > 8` (au-delà, une grille de 3 colonnes sans recherche devient difficile à parcourir ; en dessous, la recherche est un ajout inutile) :
```tsx
<div>
  <label style={{ ... }}>{t('projects.client')}</label>
  {clients.length > 8 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '6px 12px', border: '1px solid var(--border)', marginBottom: 8 }}>
      <SFIcon name="search" size={13} color="var(--text-3)" />
      <input
        value={clientSearch}
        onChange={e => setClientSearch(e.target.value)}
        placeholder={t('projects.searchClientPlaceholder')}
        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}
      />
    </div>
  )}
  <div style={{ maxHeight: clients.length > 8 ? 220 : undefined, overflowY: clients.length > 8 ? 'auto' : 'visible', paddingRight: 4 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {filteredClients.map(c => ( /* bouton client existant inchangé */ ))}
    </div>
  </div>
</div>
```

- [ ] **Step 4 : Ajouter les clés i18n**

`fr.json` : `"searchClientPlaceholder": "Rechercher un client…"`. `en.json` : `"searchClientPlaceholder": "Search a client…"`.

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/ProjectsListView.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(nouveauProjet): recherche + défilement pour les clients (épinglés en premier), au-delà de 8"
```

---

### Task 5 : Pattern de recherche + scroll — équipe

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx:404-447` (étape 'team')
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

- [ ] **Step 1 : Ajouter l'état de recherche**

```ts
const [teamSearch, setTeamSearch] = useState('');
```

- [ ] **Step 2 : Filtrer, avec le créateur toujours visible en premier**

Avant le rendu (ligne ~406) :
```ts
const sortedTeam = [...team].sort((a, b) => Number(b.id === defaultMemberId) - Number(a.id === defaultMemberId));
const filteredTeam = teamSearch.trim()
  ? sortedTeam.filter(u => u.name.toLowerCase().includes(teamSearch.trim().toLowerCase()) || u.role.toLowerCase().includes(teamSearch.trim().toLowerCase()))
  : sortedTeam;
```

- [ ] **Step 3 : Ajouter la barre de recherche + scroll, même seuil que les clients (`team.length > 8`)**

Même structure que Task 4 Step 3, appliquée au bloc équipe (remplacer `team.map(...)` par `filteredTeam.map(...)`, envelopper la grille dans un conteneur `maxHeight: 260` scrollable quand `team.length > 8`).

- [ ] **Step 4 : Ajouter les clés i18n**

`fr.json` : `"searchTeamPlaceholder": "Rechercher un membre…"`. `en.json` : `"searchTeamPlaceholder": "Search a member…"`.

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/ProjectsListView.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(nouveauProjet): recherche + défilement pour l'équipe, au-delà de 8 membres"
```

---

### Task 6 : Revue finale et vérification bout-en-bout

- [ ] **Step 1 : Typecheck complet**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 2 : Parcours de vérification en preview**

1. Étape Départ : plus qu'une seule option « Projet vierge » (pas de doublon « Projet vide »), barre de recherche fonctionnelle, un modèle personnalisé créé au préalable apparaît bien dans la liste.
2. Étape Infos : les champs Nom/Client/Budget/Description utilisent toute la largeur du modal comme l'étape Départ. Remplir Budget + Description → créer le projet → confirmer dans Aperçu que les deux valeurs sont bien présentes.
3. Étape Infos, sélection client : avec peu de clients (<9), pas de barre de recherche, comportement identique à avant. Avec beaucoup de clients (créer temporairement plusieurs clients de test si besoin, ou vérifier avec les données de démo si elles en comptent assez), la recherche + le défilement apparaissent, les clients épinglés sont en premier.
4. Étape Équipe : même vérification avec le nombre de membres.
5. Un projet créé sans sélectionner de modèle (état par défaut, plus personne ne clique « Projet vide ») se crée bien vide, comme avant.

- [ ] **Step 3 : Dispatcher la revue finale de branche**

Utiliser `superpowers:requesting-code-review`, puis `superpowers:finishing-a-development-branch`.

## Self-Review

**Couverture :** bug de largeur (Task 1), doublon Projet vide/vierge (Task 1), Budget+Description (Task 2), modèles personnalisés visibles + recherche/scroll modèles (Task 3), recherche/scroll clients avec épinglés en premier (Task 4), recherche/scroll équipe (Task 5) — tous les points discutés avec l'utilisateur sont couverts.

**Cohérence :** le pattern recherche (pill icône+input, `background: var(--surface-2)`, `border: 1px solid var(--border)`) et le pattern scroll (`maxHeight` + `overflowY: auto`) sont répétés à l'identique dans les 3 tâches 3/4/5, avec le même seuil de déclenchement (`> 8` pour clients/équipe ; les modèles ont toujours recherche+scroll car la liste combine built-in+personnalisés dès le départ et peut facilement dépasser 8).
