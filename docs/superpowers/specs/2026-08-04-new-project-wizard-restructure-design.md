# Refonte de l'assistant "Nouveau projet" — Design

## Contexte

L'assistant "Nouveau projet" (`NewProjectModal` dans `app/src/components/ProjectsListView.tsx`) a grandi organiquement au fil de plusieurs chantiers séparés (client, membres, fonctionnalités, plan gating). Résultat : 3 étapes dont le contenu ne suit plus une logique claire — l'étape "Infos" mélange nom, client, date, budget, description et fonctionnalités ; l'étape "Membres" arrive après que le client soit déjà choisi.

Objectif de ce chantier : réorganiser le contenu en 4 étapes cohérentes, sans changer la logique métier sous-jacente (aucun nouveau champ, aucun changement au `createProject` final).

## Structure finale (4 étapes)

### Étape 1 — Identité
Contenu (inchangé, déplacé depuis l'ancienne étape "Infos") :
- Nom du projet* (obligatoire, autofocus)
- Couleur du projet
- Date de livraison (optionnel)
- Budget (optionnel)
- Description (optionnel)

Validation pour avancer : nom non vide.

### Étape 2 — Client
Contenu (inchangé, déplacé depuis l'ancienne étape "Infos") :
- Grille de chips clients avec "Aucun" toujours en premier chip (mécanique unique, déjà en place)
- Recherche si > 8 clients
- Saisie d'un nouveau nom de client si `clients.length === 0`

Validation pour avancer : "Aucun" sélectionné, OU un client existant sélectionné, OU un nouveau nom de client saisi.

### Étape 3 — Modèle

**Grille de modèles — refonte en chips compacts**, pour matcher exactement le style Client/Membres (au lieu des cartes actuelles, plus volumineuses : padding 14-16px, description 2 lignes, tags, compteur) :
- `repeat(3, 1fr)`, `gap: 8`, padding chip `8px 10px`, radius 9 — mêmes valeurs que la grille Client.
- Chaque chip : pastille 22×22 (icône du modèle sur fond `tpl.color`, comme aujourd'hui mais réduite) + nom du modèle (1 ligne, ellipsis) + coche si sélectionné à droite. Description, tags et compteur sections/tâches **retirés de la carte**.
- **Aperçu du modèle sélectionné** : sous la grille, une bande compacte (bordure, padding ~10px, radius 9 — même traitement que les hints existants type `personalProjectHint`) apparaît uniquement quand un modèle est sélectionné, affichant sa description, ses tags et le compteur sections/tâches. Rien ne s'affiche si aucun modèle n'est choisi (le modèle reste optionnel).
- Recherche existante conservée au-dessus de la grille (déjà présente).
- **Verrou discret** sur les modèles personnalisés (`isCustom`/équivalent) si `!canUseFeature(plan, 'customTemplates')` : icône `lock` 11px à la place de la coche, chip non sélectionnable (état visuel identique aux chips non sélectionnés, juste l'icône lock en indice) ; clic → `requestUpgrade({ feature: 'customTemplates' })`. Les modèles intégrés restent toujours sélectionnables.

**Fonctionnalités du projet** — réagencées en **rangée horizontale** sous la grille de modèles (au lieu de la liste verticale actuelle), même style chip compact que ci-dessus (`display: flex`, `gap: 8`, chips `8px 10px`, pastille circulaire 22px + libellé + coche) :
  - Calendrier — toujours actif/togglable
  - Fichiers — toujours actif/togglable
  - Finance — togglable seulement si un client est sélectionné (logique `disabled` existante inchangée) **et** si `canUseFeature(plan, 'finances')`. Si verrouillé par le plan : icône `lock` 11px à la place de la coche + texte court sous la rangée (remplace le texte "nécessite un client" existant par un texte plan-dépendant équivalent quand c'est la cause du verrou), même traitement visuel discret que l'état désactivé actuel — pas de changement de comportement au clic autre que `requestUpgrade({ feature: 'finances' })` si la cause est le plan (si la cause est l'absence de client, le clic ne fait rien, comme actuellement).

Validation pour avancer : toujours valide (modèle et fonctionnalités sont optionnels, un modèle par défaut peut rester non sélectionné comme actuellement).

### Étape 4 — Membres
Contenu : inchangé (équipe interne + contacts client dans la même liste combinée, recherche si > 8).

## Ce qui NE change PAS

- Aucun nouveau champ, aucune donnée supplémentaire envoyée à `createProject`.
- La mécanique de sélection client ("Aucun" en 1er chip du grid) reste identique.
- La logique de dépendance Finance↔client (`disabled: isPersonalProject || (!clientId && !newClientName.trim())`) reste identique — le plan gating s'ajoute en second critère, il ne la remplace pas.
- Aucun changement pour les modèles intégrés (toujours sélectionnables par tous les plans).
- Pas de modale forcée / interruption automatique — le verrou est une icône discrète, cliquée volontairement.

## Détails techniques

- `step` passe de `'start' | 'info' | 'team'` à 4 valeurs : `'identity' | 'client' | 'template' | 'team'` (noms internes à choisir par l'implémenteur, cohérents avec le code existant).
- `StepDot` : 3 → 4 puces numérotées, nouveaux libellés i18n (`projects.stepIdentity`, `projects.stepClient`, `projects.stepTemplate` — `projects.stepTeam` existe déjà).
- `canNext` / `stepDone` / `isStepReachable` : logique redistribuée par étape (actuellement tout est validé en bloc à l'étape `'info'`).
- `back()` : la chaîne de retour doit suivre le nouvel ordre (`team` → `template` → `client` → `identity`).
- Import de `canUseFeature` depuis `../data/planFeatures` et `requestUpgrade` depuis `../data/upgradePromptStore` dans `ProjectsListView.tsx` (pattern déjà utilisé dans `Modeles.tsx`/`AIChat.tsx`).
- Nouvelles clés i18n dans `fr.json`/`en.json` : libellés des 2 nouvelles puces d'étape, texte du verrou Finance-par-plan (distinct du texte "nécessite un client" existant), texte du verrou modèle perso.

## Cohérence visuelle / densité (toutes étapes)

Valeurs de référence à réutiliser telles quelles (déjà en place dans la grille Client, ne pas réinventer) :
- Grilles de sélection (client, modèle, fonctionnalités) : `repeat(3, 1fr)` ou `flex` selon le nombre d'éléments, `gap: 8`, chip `padding: 8px 10px`, `borderRadius: 9`, bordure `1.5px solid`, pastille 22×22.
- Pas de card au padding 14-16px ni de contenu multi-ligne dans une grille de sélection — si un modèle a besoin d'afficher plus d'info, ça va dans la bande de détail sous la grille (voir Étape 3), pas dans la carte elle-même.
- Étape 1 (Identité) : la ligne Couleur/Date/Budget déjà fusionnée (`minmax(150px, auto) 1fr 1fr`, `gap: 14`) reste le seul endroit avec des champs non-chip côte à côte — ne pas ajouter d'espacement vertical supplémentaire entre les sections (`gap: 14` au conteneur, valeur déjà en place).
- Objectif général : que les 4 étapes tiennent visuellement à une hauteur comparable, sans scroll sauf listes longues (client >8, template avec recherche, membres >8) qui gardent leur `maxHeight`/`overflowY` existant.

## Hors scope

- Aucun changement à l'étape Membres.
- Aucun changement aux stores (`projectStore`, `templates.ts`, `planFeatures.ts`).
- Aucun changement à la logique de création réelle du projet en fin de wizard.
