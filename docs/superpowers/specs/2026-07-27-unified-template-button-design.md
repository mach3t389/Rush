# Bouton "Modèles" unifié (Tâches / Fichiers / Aperçu) — design

## Constat

- Tâches (`Travail.tsx`) et Fichiers (`Fichiers.tsx`) : bouton "Enregistrer comme
  modèle" dans l'en-tête (`ProjectHeaderBar`), qui ne fait que **sauvegarder**
  l'état actuel comme nouveau modèle. Aucun moyen de **charger** un modèle
  existant sur un projet déjà créé.
- Aperçu (`TravailOverview.tsx`) : bouton "Changer de modèle d'Aperçu" en bas
  de page (hors en-tête), qui ne fait que **charger** un modèle existant.
  Aucun moyen d'enregistrer l'état actuel comme nouveau modèle.
- Aucune des trois pages n'offre les deux actions ensemble, ni au même endroit.

## Design retenu

Un seul bouton **"Modèles"** (icône `layout-template`), toujours dans l'en-tête
(`ProjectHeaderBar`, action slot `children`), identique sur les 3 pages. Au clic,
il ouvre un petit menu (`InlineDropdown`, même mécanisme que les dropdowns déjà
utilisés dans `TravailOverview.tsx`) à deux choix :

- **Charger un modèle** — remplace la structure actuelle du projet par celle
  d'un modèle existant du type correspondant (`'tasks'`/`'file'`/`'overview'`).
- **Enregistrer comme modèle** — sauvegarde l'état actuel comme nouveau modèle
  réutilisable (comportement déjà existant sur Tâches/Fichiers, à ajouter sur
  Aperçu).

### Sémantique de "Charger" par type (différente selon les risques de perte de données)

- **Tâches** : remplacement complet (`setSections(projectId, tpl.sections)`),
  confirmation requise (`confirm(...)`) — les tâches actuelles sont perdues,
  comportement déjà accepté ailleurs dans l'app pour ce type d'action destructive.
- **Aperçu** : comportement inchangé (déjà construit) — remplacement des
  sections personnalisées, Vision toujours préservée, confirmation déjà en place.
- **Fichiers** : **additif, pas destructif** — un modèle de structure de
  fichiers ajoute ses dossiers au projet (`addFolderTree`) sans toucher aux
  dossiers/fichiers déjà présents, puisqu'un projet réel a presque toujours
  déjà des fichiers importés au moment où on voudrait charger un modèle,
  contrairement à Tâches où recommencer la structure est un cas d'usage normal.
  Pas de confirmation requise (non destructif).

### Composant partagé

Un composant `TemplateMenuButton` (`app/src/components/TemplateMenuButton.tsx`)
générique : props `onLoad: (tpl) => void`, `onSave: () => void`,
`templates: {id,name,icon}[]` (pour peupler le sous-menu "Charger"), `loadLabel`/
`saveLabel` (i18n). Encapsule le bouton + `InlineDropdown` + le sous-menu de
sélection de modèle à charger. Utilisé identiquement dans les 3 écrans, chacun
lui passant sa propre logique de chargement/sauvegarde.

## Hors scope

- Pas de navigation vers `/modeles` depuis ce bouton — il reste local au projet.
- Pas de changement au comportement de Modèles.tsx lui-même (chantiers précédents).
