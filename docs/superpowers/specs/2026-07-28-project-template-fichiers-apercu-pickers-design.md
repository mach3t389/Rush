# Sélecteurs Fichiers/Aperçu + ouverture directe dans le modèle Projet — design

## Constat

L'éditeur du modèle Projet composite (`TemplateProjectView`, Modèles → Projets
→ Modifier) a un onglet "Tâches" avec un sélecteur ("Changer de structure de
tâches") qui écrit `ProjectTemplate.tasksTemplateId`. Il n'a **aucun**
équivalent pour Fichiers/Aperçu : `defaultFolderStructureId`/
`defaultOverviewTemplateId` existent sur le type mais ne sont écrits **nulle
part** dans toute l'app (seulement codés en dur sur 2 modèles intégrés au
départ, et lus une fois comme valeur par défaut par l'assistant de création
de projet). Un modèle Projet personnalisé ne peut donc pas vraiment choisir
sa structure de Fichiers ni son Aperçu.

De plus, même pour Tâches (le seul qui fonctionne), il n'y a aucun moyen
d'ouvrir directement le modèle lié pour en modifier le contenu — seulement un
texte "Éditable depuis la catégorie « Tâches » des modèles", obligeant à
fermer cette page et à naviguer ailleurs.

## Design retenu

### Deux nouveaux onglets, même pattern que Tâches

`TemplateProjectView` gagne les onglets **Aperçu** et **Fichiers**,
positionnés dans l'ordre `Vue d'ensemble / Aperçu / Tâches / Fichiers`
(aligné sur l'ordre des vrais onglets d'un projet, déjà la convention établie
ailleurs dans l'app). Chacun reproduit exactement le pattern de l'onglet
Tâches actuel :
- Un aperçu en lecture seule du contenu du modèle lié (sections d'Aperçu /
  arborescence de dossiers).
- Un bouton "Changer de structure de X" ouvrant le même style de popup de
  sélection (liste des modèles du bon type + option "Aucune").
- Écrit respectivement `defaultOverviewTemplateId`/`defaultFolderStructureId`
  sur le `ProjectTemplate` — ces champs deviennent enfin réellement
  utilisables, pas juste lus une fois par l'assistant de création.

### Ouverture directe du modèle lié

Sur les 3 onglets (Aperçu/Tâches/Fichiers), un bouton **"Ouvrir"** apparaît à
côté du nom du modèle lié — il ouvre directement ce modèle en édition via le
mécanisme déjà construit (brouillon + vrai écran, chantiers précédents).
Comme le modèle Projet ne stocke qu'une **référence** (un id) et jamais une
copie, toute modification faite là est immédiatement la même donnée que si on
l'avait ouverte directement depuis sa propre catégorie dans Modèles —
synchronisation automatique, rien à dupliquer ni à réconcilier.

### Hors scope

- Pas de nouvel onglet "Ressources" — les ressources se gèrent en éditant le
  contenu du modèle de Fichiers lié (déjà possible depuis le chantier
  précédent), pas comme concept séparé au niveau du modèle Projet.
- Pas de changement au comportement de l'assistant de création de projet
  (`ProjectsListView.tsx`) — il lit déjà ces deux champs correctement, seule
  leur écriture était manquante.
