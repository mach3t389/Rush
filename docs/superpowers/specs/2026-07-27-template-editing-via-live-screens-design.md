# Édition de modèles via les vrais écrans (projet brouillon) — design

## Constat

L'éditeur de modèle "Projet" (`TemplateProjectView` dans `Modeles.tsx`) et
l'éditeur générique de `ResourceTemplate` (même fichier) sont des interfaces
maison, séparées des vrais écrans Fichiers/Tâches/Aperçu :

- Le modèle "Fichiers" (`ResourceTemplate.folderStructure`) s'édite via un
  **textarea JSON brut** (`Modeles.tsx:1645`) — aucune UI.
- L'onglet "Ressources" du modèle Projet est du code mort : les ressources
  qu'on y ajoute (`ProjectTemplate.resources`) ne sont jamais utilisées à la
  création d'un projet (confirmé — aucune référence dans
  `ProjectsListView.tsx`). Cet onglet date d'avant la fusion
  Ressources = Fichiers (voir CLAUDE.md) et n'a jamais été nettoyé.
- Il n'existe aujourd'hui **aucun moyen** de placer une ressource-modèle
  (Script, Moodboard, Document…) dans un modèle de Fichiers, alors que
  c'est exactement ce à quoi sert une ressource dans un vrai projet.
- Le résultat : deux interfaces à maintenir pour la même chose (l'écran réel
  Fichiers vs l'éditeur de modèle Fichiers), qui ne se comportent pas pareil
  et ne partagent aucun code.

## Design retenu — "projet brouillon"

Au lieu de construire/réparer des éditeurs de modèle maison, on **réutilise
les vrais écrans** (`Fichiers.tsx`, `Travail.tsx`, `TravailOverview.tsx`)
comme éditeurs, en leur donnant un **projet brouillon invisible** à éditer
plutôt qu'un vrai projet.

### Fonctionnement

1. Depuis Modèles, cliquer "Modifier" (ou "Nouveau modèle") sur un modèle
   de type Fichiers/Tâches/Aperçu crée un **projet brouillon** :
   un `Project` normal (mêmes tables/stores que les vrais projets), marqué
   `isTemplateDraft: true`, sans client réel, pré-rempli avec le contenu du
   modèle édité (dossiers existants via `addFolderTree`, sections via
   `setSections`, sections d'aperçu via le mécanisme déjà utilisé par
   `applyTemplateById`).
2. L'app navigue vers l'écran réel correspondant
   (`/projets/:draftId/fichiers`, `/projets/:draftId`,
   `/projets/:draftId/overview`) — **aucun changement de comportement** sur
   ces écrans : ajouter un dossier, une ressource, une tâche, une section
   fonctionne exactement comme sur un vrai projet.
3. Le bouton "Enregistrer comme modèle" déjà présent dans l'en-tête
   (`TemplateMenuButton`, livré dans le chantier précédent) sauvegarde l'état
   courant — en pré-remplissant le nom/description avec ceux du modèle
   d'origine, et en **écrasant ce même modèle** (pas une copie) puisqu'on est
   en train de le modifier.
4. Quitter l'écran (navigation ailleurs, bouton "Terminer" dans l'en-tête)
   supprime le projet brouillon (`removeProject`, qui nettoie déjà
   dossiers/fichiers/tâches/événements en cascade).

### Ce que ça règle

- Une seule interface à maintenir par domaine (Fichiers/Tâches/Aperçu),
  au lieu de deux.
- Les ressources-modèles deviennent utilisables dans un modèle de Fichiers
  "gratuitement" : l'écran Fichiers sait déjà créer une ressource dans un
  dossier (`FichiersGlobal.tsx:2057-2075`) — pas de nouveau code pour ça.
- L'onglet "Ressources" du modèle Projet (code mort) est supprimé.
- L'éditeur JSON brut du modèle Fichiers disparaît.

### Visibilité du projet brouillon

Un projet brouillon ne doit apparaître **nulle part** dans les listes
normales : Dashboard, `/projets`, sidebar, fiche client, recherche globale.
`isTemplateDraft: true` est filtré à la source, dans `getProjects()` — les
écrans qui affichent un projet précis par id (Fichiers/Travail/Aperçu/
ProjectHeaderBar) continuent de fonctionner car ils résolvent par id, pas
via la liste filtrée.

### En-tête pendant l'édition d'un modèle

`ProjectHeaderBar` détecte `project.isTemplateDraft` et adapte son affichage :
- Fil d'Ariane remplacé par un bandeau "Édition du modèle « Nom »".
- Onglets limités à celui pertinent (pas de Calendrier/Finances/Membres/
  Activité sur un brouillon).
- Menu projet (déplacer vers client, supprimer, couleur) masqué — ces
  actions n'ont pas de sens sur un brouillon.
- Un bouton "Terminer" explicite en plus de la simple navigation, pour un
  point de sortie clair.

### Modèle "Projet" composite

Le modèle "Projet" (qui assemble Fichiers + Tâches + Aperçu) garde son
éditeur actuel dans Modèles (`TemplateProjectView`) pour la partie
assemblage (quel sous-modèle de chaque type est lié) — ce n'est pas un
contenu éditable via un écran réel, c'est une liste de références. Seul
l'onglet "Ressources" (mort) en est retiré. Éditer le *contenu* d'un
sous-modèle (ses dossiers, ses tâches, ses sections) se fait en ouvrant ce
sous-modèle directement depuis sa propre catégorie (Fichiers/Tâches/Aperçu
dans Modèles), via le mécanisme brouillon ci-dessus.

## Hors scope

- Pas de changement au modèle de données `FolderNode`/ressources
  au-delà de ce qui existe déjà (`FileItem.resourceId`) — on réutilise tel
  quel.
- Pas de mode "brouillon partagé" multi-utilisateur — un brouillon est
  éphémère, local à l'édition en cours.
- La création d'un nouveau modèle vide (pas encore de modèle à modifier)
  suit le même mécanisme : brouillon vide, "Enregistrer comme modèle" crée
  au lieu d'écraser.
