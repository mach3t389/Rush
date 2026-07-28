# Édition des modèles de Ressources via les vrais écrans — design

## Contexte

Le chantier précédent (`2026-07-27-template-editing-via-live-screens`) a unifié
l'édition des modèles de Fichiers/Tâches/Aperçu : éditer un de ces modèles
ouvre le vrai écran de projet sur un **projet brouillon** invisible, pré-rempli,
plutôt qu'un éditeur maison séparé.

Les modèles de type **Ressource** (Document, Scénario, Révision vidéo,
Moodboard — le type Formulaire a son propre système séparé, hors scope)
utilisent encore l'ancien éditeur (`TemplateResourceView` dans `Modeles.tsx`).
Constat : les composants d'affichage/édition (`DocumentView`, `ScreenplayView`,
`MoodboardView`, `VideoReviewBody`) sont **déjà réutilisés tels quels** par cet
éditeur — la brique de contenu est donc déjà partagée. Ce qui manque : la vraie
page de ressource (`/projets/:id/ressources/:resourceId`, avec son en-tête, sa
route réelle) et un bouton "Modèles" (Charger/Enregistrer) cohérent avec les 3
autres catégories.

## Design retenu

### Ressource brouillon

Le mécanisme du projet brouillon (déjà existant) est étendu : en plus du
projet brouillon lui-même, on crée aussi une **ressource brouillon** du bon
type à l'intérieur — via `addResource(...)` + `addFile({type:'resource', ...})`
(même pattern que la création manuelle d'une ressource dans `FichiersGlobal.tsx`),
placée à la racine du projet brouillon (pas besoin de dossier). L'app navigue
ensuite vers `/projets/:draftId/ressources/:draftResourceId` — la vraie route,
qui affiche le vrai composant (`ResourceRouter` → `ResourceDetail`/`VideoReview`
selon le type).

### Bouton "Modèles" dans l'en-tête

Aujourd'hui, l'en-tête d'une page de ressource (`ProjectHeaderBar` rendu par
`ResourceRouter`) n'a aucun bouton d'action. En mode brouillon, on y ajoute le
même `TemplateMenuButton` (Charger un modèle / Enregistrer comme modèle) que
sur Fichiers/Tâches/Aperçu — visible uniquement quand `project.isTemplateDraft`
est vrai, pour ne rien changer à l'affichage d'une vraie ressource.

### "Enregistrer comme modèle"

Le contenu de ces 4 composants est déjà persisté de façon continue (autosave
débouncé) dans `resourceContentStore`, sous la clé `persistKey` (= l'id de la
ressource). Enregistrer comme modèle = lire `getResourceContent(draftResourceId)`
et écrire son contenu dans le `ResourceTemplate` (écrase l'original si on
éditait un modèle existant — `draftOriginTemplateId` déjà posé par le mécanisme
existant —, sinon en crée un nouveau). Pas besoin de capture impérative comme
le fait l'éditeur actuel (`docContentRef.current?.()`) — le store a déjà la
donnée à jour.

### "Charger un modèle"

Les composants (`DocumentView`, etc.) gèrent leur contenu en `useState` interne,
initialisé une fois depuis `resourceContentStore` au montage — ils ne
réagissent pas si le store change sous eux. "Charger" doit donc : (1) écrire le
nouveau contenu dans `resourceContentStore` pour cette ressource brouillon,
puis (2) forcer un remontage du composant (`key` incrémentée) pour qu'il se
réinitialise sur ce nouveau contenu — même technique que `key={projectId}` déjà
utilisée sur `FileBrowser`.

### Correspondance des champs par type

Le mapping exact entre le contenu stocké sur un `ResourceTemplate` (ex.
`rawHTML`, `sceneBlocks`, `moodboardRefs`, `reviewRounds`) et le contenu
persisté par chaque composant (ex. `{html, comments, theme, ...}` pour
`DocumentView`) sera précisé au moment d'écrire le plan détaillé, un type à la
fois — chaque composant a sa propre forme de contenu, et certains champs de
`ResourceTemplate` (ex. `documentSections`) sont déjà vestigiaux dans le flux
actuel (à vérifier par type). Pas de risque de casser un composant existant :
seule sa source d'alimentation en mode brouillon change, jamais son propre
fonctionnement en session réelle.

### Révision vidéo — pas de fichier réel

Un modèle n'a pas de vidéo à uploader. `VideoReviewBody` gère déjà proprement
l'absence de média (zone "glisser pour ajouter" quand `mediaUrl` est `null`) —
un brouillon de Révision vidéo s'ouvre donc simplement sans média, et seuls les
noms/statuts de versions sont significatifs pour le modèle (confirmé pertinent
par l'utilisateur).

## Hors scope

- Le type "Formulaire" (système `FormTemplate` séparé, sa propre UI dédiée) —
  pas touché par ce chantier.
- Tout changement au format de stockage réel d'un `ResourceTemplate` autre que
  la façon dont son contenu est désormais rempli/lu (pas de migration Supabase
  nécessaire — ces champs existent déjà).
- Amélioration de l'ancien éditeur (`TemplateResourceView`/`ResourceTemplateEditor`)
  pour les types hors scope de ce chantier (aucun ici, les 4 types visés sont
  Document/Scénario/Révision vidéo/Moodboard — tous couverts).
