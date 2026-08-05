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
Contenu :
- Grille de modèles (inchangée) — **avec verrou discret** sur les modèles personnalisés (`isCustom`/équivalent) si `!canUseFeature(plan, 'customTemplates')` : petite icône `lock` sur la carte du modèle, carte non sélectionnable ; clic → `requestUpgrade({ feature: 'customTemplates' })`. Les modèles intégrés restent toujours sélectionnables.
- Fonctionnalités du projet, réagencées en **rangée horizontale** (au lieu de la liste verticale actuelle), même style visuel que les chips (pastille circulaire + libellé + coche) :
  - Calendrier — toujours actif/togglable
  - Fichiers — toujours actif/togglable
  - Finance — togglable seulement si un client est sélectionné (logique `disabled` existante inchangée) **et** si `canUseFeature(plan, 'finances')`. Si verrouillé par le plan : icône `lock` + texte court (remplace le texte "nécessite un client" existant par un texte plan-dépendant équivalent quand c'est la cause du verrou), même traitement visuel discret que l'état desactivé actuel — pas de changement de comportement au clic autre que `requestUpgrade({ feature: 'finances' })` si la cause est le plan (si la cause est l'absence de client, le clic ne fait rien, comme actuellement).

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
- Nouvelles clés i18n dans `fr.json`/`en.json` : libellés des 2 nouvelles puces d'étape, texte du verrou Finance-par-plan (distinct du texte "nécessite un client" existant), éventuel texte du verrou modèle perso.

## Hors scope

- Aucun changement à l'étape Membres.
- Aucun changement aux stores (`projectStore`, `templates.ts`, `planFeatures.ts`).
- Aucun changement à la logique de création réelle du projet en fin de wizard.
