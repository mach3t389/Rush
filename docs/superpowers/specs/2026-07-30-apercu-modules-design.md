# Page Aperçu en modules — Design

**Date :** 2026-07-30
**Statut :** validé, prêt pour le plan d'implémentation

## Objectif

Transformer la zone centrale de la page Aperçu d'un projet (`app/src/screens/TravailOverview.tsx`) en une liste de modules réordonnables par glisser-déposer, ajoutables et supprimables — plutôt que la structure actuelle, à moitié modulaire (sections personnalisées réordonnables par flèches) et à moitié figée (le bloc Livrables client, toujours en position fixe).

C'est le chantier A d'une décomposition en trois : ce chantier (A) est un préalable à la création de modèles d'Aperçu intégrés (chantier B) et au nettoyage du wizard « Nouveau projet » (chantier C) — les deux repoussés après celui-ci.

## Décisions produit

| Question | Décision |
|----------|----------|
| Position de Vision | Reste fixe en tout premier, non déplaçable, non supprimable — inchangé par rapport à aujourd'hui. |
| Livrables client | Devient un module comme les autres : déplaçable, supprimable d'un projet qui n'en a pas besoin. |
| Réordonnancement | Glisser-déposer natif, pas les flèches actuelles. |
| Types de modules | 6 au total : Vision (verrouillé), Livrables client, Texte, Champs, **Checklist** (nouveau), **Galerie** (nouveau), **Liens** (nouveau). |
| Source des images de la Galerie | Upload direct dans le module (glisser-déposer / sélecteur de fichier), pas un renvoi vers l'onglet Fichiers. |
| Projets existants | Migration silencieuse au premier chargement — voir section dédiée. |

## Hors périmètre

- Modèles d'Aperçu intégrés (chantier B).
- Refonte du wizard « Nouveau projet » (chantier C).
- Tout type de module au-delà des 6 listés.
- Nouveaux types de champs pour le module Champs (structure actuelle inchangée).

---

## 1. Modèle de données

### `OverviewSectionKind` étendu

`app/src/data/projectContentStore.ts:18` :

```ts
// avant
export type OverviewSectionKind = 'fields' | 'note';

// après
export type OverviewSectionKind = 'fields' | 'note' | 'deliverables' | 'checklist' | 'gallery' | 'links';
```

### Le module Livrables client ne stocke pas ses propres données

`{kind: 'deliverables'}` dans `customSections` ne fait que fixer sa **position** dans la liste ordonnée. Le contenu affiché reste `getDeliverables(project.id)` (lecture des `Task` du projet marquées `deliverable: true`), exactement comme aujourd'hui — aucun changement à `taskStore.ts` ni à la logique des livrables elle-même.

Une section de kind `'deliverables'` n'a donc pas d'entrée correspondante dans `customSectionData` — contrairement aux 5 autres kinds.

### `customSectionData` : de chaîne à valeurs typées par kind

`app/src/data/projectContentStore.ts:59`, `customSectionData?: Record<string, string | Record<string, string>>` doit accepter 3 nouvelles formes de valeur, une par nouveau kind :

```ts
export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface GalleryImage {
  id: string;
  /** Blob URL en mémoire ; peut être régénéré depuis fileContentStore si vide après un rechargement. */
  dataUrl: string;
  caption: string;
}

// customSectionData élargi :
export type CustomSectionValue =
  | string                        // kind: 'note'
  | Record<string, string>        // kind: 'fields'
  | ChecklistItem[]                // kind: 'checklist'
  | GalleryImage[]                 // kind: 'gallery'
  | string[];                      // kind: 'links' — ids de ressources/fichiers liés

export interface ProjectContent {
  notes?: string;
  customSections?: CustomOverviewSection[];
  customSectionData?: Record<string, CustomSectionValue>;
}
```

Le stockage des images de la Galerie réutilise le mécanisme déjà en place pour l'import de fichiers réels (`fileContentStore.ts`) : blob URL en mémoire pour la session courante, base64 persisté en `localStorage` jusqu'à 3 Mo par image en session démo ; en session réelle, upload vers le bucket Supabase Storage existant.

---

## 2. Les 6 types de modules

| Module | État actuel | Comportement |
|--------|-------------|--------------|
| **Vision** | Existe, verrouillé (`locked: true`) | Inchangé : toujours en première position, jamais proposé à l'ajout, jamais supprimable. |
| **Livrables client** | Existe, position fixe hors du système de sections | Rejoint `customSections` comme n'importe quel autre module — déplaçable, supprimable. Le contenu (liste de livrables) est inchangé. |
| **Texte** (`kind: 'note'`) | Existe | Inchangé. |
| **Champs** (`kind: 'fields'`) | Existe | Inchangé. |
| **Checklist** (`kind: 'checklist'`) | Nouveau | Liste de `ChecklistItem`. Ajouter/retirer une ligne, cocher/décocher, éditer le texte en ligne. Pas lié aux Tâches du projet — une liste libre, séparée. |
| **Galerie** (`kind: 'gallery'`) | Nouveau | Grille de `GalleryImage`. Upload par glisser-déposer ou sélecteur de fichier, une légende texte par image, suppression par image. |
| **Liens** (`kind: 'links'`) | Nouveau | Liste d'ids de ressources/fichiers du projet. Réutilise le mécanisme de sélection déjà utilisé pour `linkedResources` sur les livrables (`TravailOverview.tsx:610-615`) — un menu inline avec case à cocher par ressource, pas de nouveau composant à créer. |

Le bouton actuel « + Ajouter une section » devient « + Ajouter un module » et propose les 5 types ajoutables (tout sauf Vision, qui n'existe qu'une fois).

---

## 3. Réordonnancement par glisser-déposer

Réutilise le mécanisme déjà en place pour réordonner les sections de tâches dans `app/src/screens/Travail.tsx` :

- Poignée de glissement dédiée sur chaque module (pas le corps entier de la carte — évite les faux déclenchements pendant l'édition d'un champ).
- Zones d'insertion invisibles mais larges entre les modules, qui s'activent visuellement pendant un glisser.
- Défilement automatique de la page quand le curseur approche du haut ou du bas de l'écran pendant un glisser (`onDragOver`, comme corrigé dans `Travail.tsx` — pas `onPointerMove`, qui ne se déclenche pas pendant un glisser HTML5 natif).

Le module Vision reste en dehors de ce mécanisme : premier de la liste par construction (`[vision, ...customSections.filter(s => s.id !== VISION_SECTION_ID)]`, motif déjà présent en ligne 375/402), sans poignée de glissement affichée.

---

## 4. Migration des projets existants

Un projet créé avant ce chantier n'a pas d'entrée `{kind: 'deliverables'}` dans ses `customSections` — le bloc Livrables client était jusqu'ici rendu séparément, en dehors de cette liste.

Au premier chargement de la page Aperçu d'un tel projet, une entrée `{kind: 'deliverables', id: 'deliverables', title: t('overview.clientDeliverables'), icon: 'package'}` est insérée automatiquement en position 2 (juste après Vision) si elle n'existe pas déjà — la position actuelle du bloc aujourd'hui. Rien ne change visuellement pour un projet existant tant que l'utilisateur ne déplace pas lui-même le module.

Cette insertion se fait en mémoire à la lecture (même famille de motif que `normalizeTask()` pour l'ancien format `assignee`, chantier précédent) — sauvegardée dès la prochaine écriture réelle de `customSections` (par exemple si l'utilisateur réordonne ou ajoute un autre module).

---

## 5. Cas limites

| Cas | Comportement |
|-----|--------------|
| Un projet sans aucun livrable (`deliverables.length === 0`) | Le module Livrables client s'affiche quand même s'il est présent dans `customSections`, avec l'état vide actuel (« Créer un livrable »). Le supprimer de la liste des modules le masque, sans supprimer d'éventuels livrables existants. |
| Supprimer le module Livrables client puis en rajouter un | Les livrables (Task avec `deliverable: true`) réapparaissent tels quels — la suppression du module ne touche jamais aux données des livrables, seulement à sa position d'affichage. |
| Checklist/Galerie/Liens vides | Même traitement que les sections vides aujourd'hui : le module s'affiche avec son état vide, jamais masqué automatiquement. |
| Image de galerie en session démo, > 3 Mo | Même limite que l'import de fichiers existant : blob en mémoire pour la session, mais pas persistée en `localStorage` au-delà de 3 Mo — disparaît au rechargement. Comportement déjà accepté ailleurs dans l'app, pas un nouveau compromis introduit par ce chantier. |
| Glisser-déposer une image sur la page alors qu'un module Galerie n'est pas encore ajouté | Rien ne se passe — l'upload d'image n'est actif qu'à l'intérieur d'un module Galerie déjà présent. |

---

## 6. Vérification

Aucun test automatisé dans ce projet. Vérification via `npm run dev` :

1. Page Aperçu d'un projet existant → le bloc Livrables client apparaît à sa position actuelle, migration silencieuse confirmée (pas de changement visuel).
2. Glisser le module Livrables client vers le bas → sa nouvelle position persiste après rechargement.
3. Ajouter un module Checklist → ajouter 3 éléments, en cocher 2, recharger → l'état persiste.
4. Ajouter un module Galerie → glisser-déposer une image, ajouter une légende, recharger → l'image et la légende persistent (sous la limite de 3 Mo en démo).
5. Ajouter un module Liens → lier une ressource existante du projet → elle apparaît, cliquable vers la ressource.
6. Supprimer le module Livrables client → il disparaît de la page ; rouvrir le Kanban du projet → les tâches-livrables existent toujours.
7. Vérifier que Vision reste bloqué en premier : glisser-déposer ne propose jamais de la déplacer.
8. Glisser un module vers le haut/bas de l'écran avec plusieurs modules présents → la page défile automatiquement.

`npx tsc -p tsconfig.app.json --noEmit` doit rester à zéro erreur.
