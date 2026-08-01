# Modèles de projet — refonte de l'architecture — design

## Contexte

Le chantier précédent (« Modèles de projet — quatre corrections », `docs/superpowers/specs/2026-08-01-modeles-projet-corrections-design.md`) a corrigé quatre défauts ponctuels, mais a construit une interface d'édition dédiée (`ProjectTaskRow` câblé dans `TemplateResourceView`/`ResourceTemplateEditor`, à l'intérieur de `Modeles.tsx`) pour éditer le contenu Tâches d'un modèle. En le testant, l'utilisateur a identifié un problème de fond : cette interface duplique ce qui existe déjà dans les vraies pages de projet (`Travail.tsx`, `Fichiers.tsx`, `TravailOverview.tsx`), et la page Modèles présente les modèles de Tâches/Fichiers/Aperçu comme des objets indépendants alors qu'ils n'ont de sens que composés ensemble dans un modèle de projet.

Ce document remplace cette approche par une architecture plus simple, validée en discussion avec l'utilisateur.

## Principe directeur

**Un modèle de projet s'édite comme un vrai projet — jamais via une interface séparée.** C'est déjà le principe qui fonctionne pour les modèles de type Document/Scénario/Moodboard/Revue vidéo (édités via un projet-brouillon réel, sur la vraie page de la ressource) — on l'étend à Tâches/Fichiers/Aperçu, qui ne l'avaient jamais eu.

Conséquence directe : aucune nouvelle interface d'édition à construire ni à maintenir. Toute amélioration future de `Travail.tsx`/`Fichiers.tsx`/`TravailOverview.tsx` profite automatiquement à l'édition de modèle, sans risque de divergence entre les deux.

## Décisions actées

1. **Navigation simplifiée** : la page Modèles ne liste plus que des modèles de **Projet** dans sa navigation principale. Les catégories « Aperçu », « Tâches », « Fichiers » (types de `ResourceTemplate` composés dans un projet) disparaissent de la barre de gauche et de la liste parcourable.
2. **Un seul objet, pas de liens** : un modèle de projet possède directement son contenu (tâches, structure de fichiers, sections d'Aperçu) — on abandonne le modèle de composition par référence (`tasksTemplateId`/`defaultFolderStructureId`/`defaultOverviewTemplateId` pointant vers des `ResourceTemplate` séparés). Pas de partage d'un même bloc de tâches entre plusieurs modèles de projet — ce n'est pas un besoin exprimé, et ça va dans le sens de la simplicité demandée.
3. **Édition = brouillon réel** : modifier un modèle de projet ouvre un vrai projet temporaire pré-rempli avec son contenu, dans les vraies pages de l'app. Aucune interface bespoke.
4. **Sauvegarde sélective** : « Enregistrer comme modèle » présente des cases à cocher (Tâches / Fichiers / Aperçu) — seules les sections cochées sont capturées.
5. **Assistant « Nouveau projet » simplifié** : l'étape « Fichiers » (sélection indépendante d'une structure de dossiers) est retirée — elle devient redondante puisque le modèle de projet choisi à l'étape 1 porte déjà sa propre structure de fichiers. L'assistant passe de 4 étapes (Départ/Infos/Fichiers/Équipe) à 3 (Départ/Infos/Équipe).

**Hors scope, non affecté** : les modèles de type Document/Scénario/Moodboard/Revue vidéo/Checklist restent des objets `ResourceTemplate` indépendants, avec l'éditeur réparé au chantier précédent (`TemplateResourceView`/`ResourceTemplateEditor`). Ils s'attachent à des ressources précises *à l'intérieur* d'un projet (composition différente), pas à sa structure globale — le principe « pas d'interface dédiée » ne s'y applique pas de la même façon et n'est pas remis en cause ici.

## Modèle de données

### `ProjectTemplate` (`app/src/data/templates.ts`)

Ajoute directement les trois champs de contenu, retire les trois champs de liaison :

```ts
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  tags: string[];
  builtIn?: boolean;
  createdAt: string;
  sections?: TemplateSection[];              // remplace tasksTemplateId
  folderStructure?: FolderNode[];              // remplace defaultFolderStructureId
  overviewSections?: CustomOverviewSection[];  // remplace defaultOverviewTemplateId
}
```

(`FolderNode` est le type déjà utilisé par `ResourceTemplate.folderStructure` — à réutiliser tel quel, pas de nouveau type.)

`resolveTasksSections(tpl)` (actuellement : résout `tasksTemplateId` en cherchant le `ResourceTemplate` correspondant) devient triviale : `return tpl.sections ?? [];` — plus de résolution, plus de dépendance à `loadAllResourceTemplates()`. Les appelants ne changent pas de signature.

### Modèles intégrés

Les 4 modèles `type: 'tasks'` existants dans `BUILT_IN_RESOURCE_TEMPLATES` (Campagne vidéo sociale, Film institutionnel, Séance photo, Motion design) sont retirés de ce tableau — leur contenu (`sections`) migre directement dans les `BUILT_IN_PROJECT_TEMPLATES` correspondants, sous le nouveau champ `sections`. Le modèle d'Aperçu de base ajouté au chantier précédent (`res-overview-base`) est traité de la même façon : son `overviewSections: []` migre (trivialement, un tableau vide) vers chaque modèle de projet intégré qui n'a pas déjà de section d'Aperçu propre — en pratique, aucune action requise puisque `overviewSections: []` ne change rien à l'affichage (les modules système s'appliquent déjà automatiquement, comme établi au chantier précédent).

### Migration des modèles personnalisés existants

Un modèle de projet personnalisé (`!builtIn`) déjà créé par l'utilisateur, qui référence encore `tasksTemplateId`/`defaultFolderStructureId`/`defaultOverviewTemplateId`, doit continuer à fonctionner après le déploiement. À la lecture (`loadAllTemplates()`), migrer silencieusement : si `tasksTemplateId` est présent et `sections` absent, résoudre l'ancien lien une dernière fois et le copier dans `sections` (même logique pour les deux autres champs), sans jamais réécrire l'ancien format. Si l'utilisateur resauvegarde ce modèle, il repart au nouveau format — même pattern que la migration `assignee` → `assignees` déjà en place ailleurs dans le code (`normalizeTask`).

## Mécanisme d'édition

### Ouvrir un modèle de projet pour le modifier

Remplace l'actuel `onEdit`/`setPreviewTpl` → overlay `TemplateProjectView`. **`TemplateProjectView` (composant complet, ses 3 onglets, ses pickers « Changer de structure ») devient du code mort à retirer** — sa seule raison d'être était d'afficher/relier les 3 modèles composés, qui n'existent plus comme objets séparés. Nouveau flux :

1. Créer un projet-brouillon (réutilise `createTemplateDraft`, déjà existant — `isTemplateDraft: true`, `draftOriginTemplateId: tpl.id`).
2. Pré-remplir ce brouillon avec le contenu du modèle : `setSections(draftId, tpl.sections ?? [])`, `addFolderTree(tpl.folderStructure ?? [], { projectId: draftId })`, `setProjectContent(draftId, { customSections: tpl.overviewSections ?? [] })`.
3. Naviguer vers `/projets/${draftId}` (la vraie page Travail).

C'est essentiellement la logique qui existait déjà dans `openTemplateDraft` (chantier précédent, code supprimé comme mort car il ne menait jamais nulle part) — elle est réintroduite, mais avec une différence essentielle : le brouillon n'est plus jetable (voir plus bas).

### « Créer un modèle depuis ce projet » — action unique, sur n'importe quel projet

Pas un bouton par page. **Une seule action**, accessible depuis le menu d'options d'un projet (`ProjectHeaderBar`, à côté de « Modifier le projet »/« Archiver ») — utilisable sur **n'importe quel projet, brouillon ou réel**. Un projet déjà construit depuis des mois peut devenir un modèle aussi facilement qu'un brouillon fraîchement créé pour l'occasion.

Ouvre un écran dédié (pas une petite fenêtre) : nom/description/couleur/icône/tags du modèle, puis trois cases à cocher, cochées par défaut :
- ☑ Tâches
- ☑ Fichiers
- ☑ Aperçu

**Cible du champ nom, selon le contexte :**
- Projet sans `draftOriginTemplateId` → crée toujours un nouveau modèle.
- Projet avec `draftOriginTemplateId` (un brouillon ouvert pour modifier un modèle existant) → l'écran propose par défaut « Mettre à jour "{nom du modèle}" », avec une option pour créer un nouveau modèle séparé à la place (cas : on veut dupliquer plutôt qu'écraser).

À la confirmation : lit l'état actuel du projet (`getSections(projectId)`, sa structure de dossiers, `getProjectContent(projectId)`), ne conserve que ce qui est coché, et écrit dans `ProjectTemplate` (nouveau ou mise à jour selon le choix ci-dessus).

**Explicitement différé, pas dans ce chantier** (à revoir une fois le mécanisme de base en usage réel) :
- Granularité plus fine que les 3 cases (ex. inclure ou non les sous-tâches, inclure ou non les commentaires) — les 3 cases suffisent au besoin exprimé pour l'instant.
- Revoir la fiche de détail d'un modèle de projet dans la page Modèles (actuellement : compte de sections/tâches seulement) — à refaire une fois qu'un modèle contient vraiment tâches/fichiers/aperçu, pas avant.

### Le brouillon n'est plus jetable par défaut

Actuellement, `ProjectHeaderBar` supprime automatiquement tout projet `isTemplateDraft` dès qu'on quitte l'écran (voir le commentaire existant dans ce fichier expliquant le mécanisme de suppression différée). Ce comportement est retiré : un brouillon reste un vrai projet dans la base tant qu'il n'est pas explicitement fermé. « Créer un modèle depuis ce projet » ne le supprime pas non plus — l'utilisateur peut continuer à l'éditer et ré-enregistrer plusieurs fois. Un bouton distinct « Fermer sans enregistrer » (ou « Supprimer ce brouillon ») couvre le cas où l'utilisateur abandonne — avec confirmation, puisque c'est maintenant une suppression volontaire de données, plus un nettoyage automatique silencieux.

## Assistant « Nouveau projet » (`ProjectsListView.tsx`)

- `type Step = 'start' | 'info' | 'fichiers' | 'team'` devient `type Step = 'start' | 'info' | 'team'`.
- L'étape « Fichiers » (sélection indépendante d'une structure de dossiers, actuellement peuplée depuis `loadAllResourceTemplates().filter(t => t.type === 'file')`) est supprimée : la structure de fichiers vient désormais uniquement du modèle de projet choisi à l'étape « Départ » (`selectedTemplate.folderStructure`), ou reste vide pour un projet parti de zéro.
- La création du projet (actuellement en 3 morceaux : tâches via `resolveTasksSections`, dossiers via `fileTpl.folderStructure`, aperçu via `overviewTpl.overviewSections`, chacun résolu séparément) se simplifie en une lecture directe des 3 champs sur `selectedTemplate`.

## Vérification

Pas de tests automatisés — vérification via preview, dans un worktree dédié :
- Page Modèles : seuls des modèles de Projet apparaissent dans la navigation principale (plus de catégories Aperçu/Tâches/Fichiers en haut).
- Créer un nouveau modèle de projet → un brouillon s'ouvre sur la vraie page Travail, vide. Ajouter une section et une tâche (fonctionne nativement, aucun bouton à construire). Aller dans Fichiers, ajouter un dossier. Aller dans Aperçu, modifier Vision. « Créer un modèle depuis ce projet » avec les 3 cases cochées → confirmer que le modèle créé contient bien les 3.
- Sur un projet RÉEL existant (pas un brouillon) : « Créer un modèle depuis ce projet » fonctionne aussi, propose bien « créer un nouveau modèle » (pas de mise à jour proposée, puisque ce projet n'a pas de `draftOriginTemplateId`).
- Rouvrir un modèle existant pour le modifier → le brouillon s'ouvre avec le contenu déjà là. Réenregistrer en décochant « Fichiers » → l'écran propose par défaut de mettre à jour ce même modèle ; confirmer qu'il perd sa structure de fichiers mais garde tâches et aperçu.
- Assistant Nouveau projet : confirmer que l'étape Fichiers a disparu, et qu'un projet créé depuis un modèle a bien ses tâches, ses fichiers et son aperçu préremplis.
- Un modèle personnalisé créé avant ce chantier (ancien format `tasksTemplateId`) s'ouvre et se matérialise toujours correctement (migration à la lecture).
