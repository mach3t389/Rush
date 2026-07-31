# Unification complète des modules Aperçu (Factures/Fichiers/Notes/Vision rejoignent le système)

## Contexte

Le chantier précédent (`docs/superpowers/specs/2026-07-30-apercu-modules-design.md`) a rendu Livrables client et les 3 nouveaux types (Checklist/Galerie/Liens) réordonnables par glisser-déposer via `customSections`. Mais trois blocs restent codés en dur, en dehors du système, rendus avant la boucle `customSections.map` : Factures, Fichiers, Notes internes. Vision, elle, est dans `customSections` mais verrouillée (`locked: true`) — ni déplaçable, ni supprimable, ni renommable.

Deux problèmes concrets en résultent :
1. **Fonctionnalité à moitié faite** : Factures/Fichiers/Notes internes ne peuvent pas être réorganisés, supprimés, ni ré-ajoutés — contrairement à Vision et Livrables client.
2. **Incohérence visuelle** : l'espace entre deux modules du système `customSections` (52px — le `gap` du conteneur flex ×2 plus la hauteur de la `ModuleInsertZone` entre eux) diffère de l'espace entre les cartes codées en dur (20px, juste le `gap` du conteneur). Résultat : l'espacement autour de Vision/Livrables client ne correspond pas à celui autour de Factures/Fichiers/Notes internes.

## Objectif

Unifier les 5 blocs (Vision, Livrables client, Factures, Fichiers, Notes internes) en un seul concept : des **modules système**, qui rejoignent `customSections` au même titre que les modules personnalisés (Champs/Note/Checklist/Galerie/Liens), avec les mêmes capacités — déplaçables, renommables, supprimables — tout en gardant leur comportement fonctionnel actuel intact (Factures/Fichiers restent synchronisés en direct avec les vraies données du projet ; Livrables client aussi, déjà fait).

## Modèle de données

### Nouveaux kinds

`OverviewSectionKind` s'étend de 6 à 10 valeurs : `'fields' | 'note' | 'vision' | 'deliverables' | 'checklist' | 'gallery' | 'links' | 'invoices' | 'files' | 'notes'` — `'invoices'`, `'files'`, `'notes'` sont les 3 nouvelles motivées par ce chantier, plus `'vision'` (découvert nécessaire au moment d'écrire le plan d'implémentation : Vision était jusqu'ici représentée avec `kind: 'fields'`, ce qui ne permet pas de la proposer comme choix distinct de « Champs personnalisés » dans le sélecteur « Ajouter un module ». Vision garde une restitution visuelle partagée avec le kind `fields` générique — un module système identifié par kind seul n'aurait pas été possible pour elle, d'où l'identification par **id canonique** retenue pour les 5 modules système, détaillée plus bas).

Trois nouvelles constantes d'id canonique et constructeurs par défaut, sur le même modèle que `getDefaultVisionSection()`/`getDefaultDeliverablesSection()` :

```ts
export const INVOICES_SECTION_ID = 'invoices';
export const FILES_SECTION_ID = 'files';
export const NOTES_SECTION_ID = 'notes';

export function getDefaultInvoicesSection(): CustomOverviewSection {
  return { id: INVOICES_SECTION_ID, kind: 'invoices', title: i18n.t('overview.invoicesTitle'), icon: 'receipt' };
}
export function getDefaultFilesSection(): CustomOverviewSection {
  return { id: FILES_SECTION_ID, kind: 'files', title: i18n.t('overview.filesTitle'), icon: 'folder' };
}
export function getDefaultNotesSection(): CustomOverviewSection {
  return { id: NOTES_SECTION_ID, kind: 'notes', title: i18n.t('overview.internalNotesTitle'), icon: 'sticky-note' };
}
```

Ces 3 modules, comme `deliverables`, n'ont pas d'entrée dans `customSectionData` — leur contenu vit ailleurs :
- `invoices` : lit `getInvoices(project.id)` (financeStore), déjà utilisé aujourd'hui par le bloc Factures.
- `files` : lit `getRecentFiles(project.id)` ou équivalent (fileStore), déjà utilisé aujourd'hui par le bloc Fichiers.
- `notes` : lit/écrit le champ `notes: string` déjà présent au niveau racine de `ProjectContent` (aucun changement de stockage — seule sa position et sa présence deviennent pilotées par `customSections`).

### Vision perd son statut verrouillé

`getDefaultVisionSection()` ne met plus `locked: true`. Le champ `locked` reste dans le type `CustomOverviewSection` (pour compatibilité, rien ne le lit plus comme condition de blocage) mais rien ne le positionne plus jamais à `true` pour aucun module. Toute la logique conditionnée sur `!section.locked` (poignée de glissement, bouton supprimer, index de calcul des flèches — déjà retiré au chantier précédent) devient inconditionnelle : chaque module a une poignée et un menu « ... ».

### Suppression sans perte de données — flag généralisé

Le flag `deliverablesRemoved: boolean` (ajouté au chantier précédent pour corriger le bug de réapparition) se généralise en un tableau :

```ts
export interface ProjectContent {
  notes?: string;
  customSections?: CustomOverviewSection[];
  customSectionData?: Record<string, CustomSectionValue>;
  /** Kinds de modules système que l'utilisateur a explicitement supprimés de
   * l'Aperçu — la migration à la lecture ne les réinsère PAS, contrairement à
   * un projet qui ne les a simplement jamais eus. Remplace l'ancien champ
   * deliverablesRemoved (booléen unique) par un ensemble générique couvrant
   * les 5 kinds système. */
  removedSystemModules?: OverviewSectionKind[];
}
```

Migration de lecture de l'ancien champ (`deliverablesRemoved: true` → `removedSystemModules: ['deliverables']`) au chargement, silencieuse, sans réécriture immédiate (le prochain `setProjectContent` persistera la nouvelle forme naturellement — même principe que `migrateLegacyVision`).

**Règle de suppression différenciée selon la nature du contenu :**
- Pour les 5 kinds système (`vision`, `deliverables`, `invoices`, `files`, `notes`) : supprimer le module retire son entrée de `customSections` et ajoute son kind à `removedSystemModules` — mais **ne touche jamais `customSectionData[id]`**. Pour `vision`, ça veut dire que ses 5 champs (concept, tonalité, public cible, objectifs, références) restent intacts en mémoire ; ré-ajouter le module via « Ajouter un module » les fait réapparaître tels quels. Pour `deliverables`/`invoices`/`files`, il n'y a de toute façon rien dans `customSectionData` à perdre. Pour `notes`, le contenu vit dans `ProjectContent.notes` (jamais touché par la suppression d'un module).
- Pour les kinds non-système (`fields`, `note`, `checklist`, `gallery`, `links`) : comportement inchangé — supprimer efface aussi `customSectionData[id]`, puisqu'un nouvel ajout crée toujours un id frais (`sec-<timestamp>`), sans possibilité de « retrouver » l'ancien contenu de toute façon.

### Id canonique à la re-création

`OverviewSectionForm.handleSave` assigne déjà l'id canonique `DELIVERABLES_SECTION_ID` quand `kind === 'deliverables'` (corrigé au chantier précédent). Étendre la même règle aux 4 autres kinds système : `vision` → `VISION_SECTION_ID`, `invoices` → `INVOICES_SECTION_ID`, `files` → `FILES_SECTION_ID`, `notes` → `NOTES_SECTION_ID`. Sans ça, ré-ajouter un module système après suppression casserait la reconnaissance par id à la prochaine suppression (bug identique à celui corrigé pour `deliverables`).

## Menu et poignée — un seul pattern pour tous les modules

**Poignée de glissement** : déplacée dans l'en-tête du `Card`, tout à gauche, **avant l'icône** — même position que `Travail.tsx` (réorganisation des sections de tâches, `SFIcon name="grip-vertical"` premier élément du header). Actuellement la poignée est un élément de `action` (à droite, à côté du menu « ... »). Elle migre dans le `<div style={{display:'flex', alignItems:'center', gap:8}}>` qui contient aujourd'hui l'icône+titre, en premier.

**Menu « ... »** : identique pour tous les modules, système ou personnalisés — Renommer + Supprimer. Le bouton delete-only ajouté au chantier précédent spécifiquement pour Livrables client est retiré ; Livrables client (et Vision/Factures/Fichiers/Notes) passent par le même menu générique `sectionMenuOpenId`/`handleEditSection`/`handleDeleteSection` que les modules personnalisés.

**Renommer un module système** ouvre le même `OverviewSectionForm` (mode édition, `initial` fourni) que pour un module personnalisé — seul le champ titre est modifiable (le `kind` d'un module existant n'est jamais reproposé au choix en édition, comportement déjà en place aujourd'hui pour tout module édité).

## Rendu des 3 nouveaux kinds système

À l'intérieur de la boucle `customSections.map`, ajouter 2 nouvelles branches (après celle de `deliverables`, avant le `return` générique fields/note/checklist/gallery/links) :

- **`kind === 'invoices'`** : le contenu exact du bloc Factures actuel (strip de résumé + liste des factures + bouton « Nouvelle facture » qui navigue vers `/projets/:id/finances`), copié tel quel depuis son emplacement actuel — aucun changement de logique, seulement de position dans l'arbre React (même principe que le déplacement de Livrables client au chantier précédent).
- **`kind === 'files'`** : le contenu exact du bloc Fichiers actuel (liste des fichiers récents + bouton « Importer »).
- **`kind === 'notes'`** : le contenu exact du bloc Notes internes actuel (textarea liée à `notes`/`setNotes`).

## Migration à la lecture — ordre par défaut

`applyLoadedContent` migre chacun des 5 kinds système indépendamment : si un kind est absent de `customSections` chargées **et** absent de `removedSystemModules`, il est inséré à une position par défaut. Ordre choisi pour les projets qui n'ont encore aucun de ces modules (nouveaux projets, ou migration d'un projet créé avant ce chantier) :

```
Vision → Livrables client → Factures → Fichiers → Notes internes → [modules personnalisés déjà existants, dans leur ordre actuel]
```

Vision garde sa position par défaut en premier (comme aujourd'hui) mais n'est plus *forcée* — l'utilisateur peut la glisser ailleurs ensuite, exactement comme les 4 autres modules système.

Chaque kind manquant est inséré indépendamment des autres (un projet qui a déjà Vision+Livrables mais jamais eu Factures/Fichiers/Notes ne voit que ces 3-là s'insérer, sans toucher à la position déjà choisie par l'utilisateur pour Vision/Livrables si elle a été modifiée).

## Résolution du bug d'espacement

Effet secondaire automatique : une fois Factures/Fichiers/Notes internes rendus à l'intérieur de la boucle `customSections.map` (avec une `ModuleInsertZone` entre chaque module, comme tous les autres), l'espacement devient uniforme partout — plus de distinction entre « modules système historiques » (dans la boucle) et « blocs codés en dur » (hors boucle, juste le `gap` du conteneur). Aucun correctif CSS séparé n'est nécessaire.

## Hors scope

- La colonne de droite (Infos du projet / Équipe / Activité récente) n'est pas touchée — elle reste hors du système de modules.
- Aucun nouveau kind de module au-delà des 3 ajoutés ici (`invoices`/`files`/`notes`).
- Le contenu fonctionnel de Factures/Fichiers/Notes internes (résumé de facturation, liste de fichiers, éditeur de texte) reste identique à aujourd'hui — seule sa position dans l'arbre de rendu et sa capacité à être déplacé/supprimé/renommé changent.
