# Actions bulk (Assigner / Statut / Date) — Design

## Objectif

La sélection multiple de tâches (Ctrl/Shift-clic) existe déjà dans les 3 vues concernées (Liste projet `Travail.tsx`, Tableau `TravailBoard.tsx` via le parent `Travail.tsx`, Mes tâches `Taches.tsx`) et affiche déjà une barre d'actions flottante en bas d'écran avec : Déplacer, Copier, Convertir en sous-tâche, Supprimer. Cette barre ne permet pas encore de modifier en masse l'assigné, le statut ou la date d'échéance des tâches sélectionnées — chaque tâche doit être éditée une par une. Ce chantier ajoute ces 3 actions à la barre existante, sans toucher au mécanisme de sélection lui-même (déjà fonctionnel).

## Architecture

Un nouveau bouton **« Modifier »** (icône crayon, `SFIcon name="pencil"`) est inséré dans la barre bulk existante, entre le bouton **Convertir** et le bouton **Copier**. Au clic, il ouvre un petit menu déroulant ancré (même pattern que les autres dropdowns de l'app — `ddItem`, `position: absolute`, fermeture au clic extérieur) avec 3 entrées :

- **Assigné** → sous-menu listant `getTeam()` (même source que le sélecteur d'assigné d'une tâche individuelle)
- **Statut** → sous-menu listant `STATUS_OPTIONS` (les 6 statuts existants, `board.ts`/`Travail.tsx`)
- **Date d'échéance** → ouvre `DatePickerDropdown` (composant standard, jamais `<input type="date">`)

Chaque choix déclenche immédiatement l'action (pas de bouton "Confirmer" séparé — comportement identique aux dropdowns d'édition de tâche unique déjà en place) puis ferme tout le menu et vide `multiSelIds`.

Le bouton **Déplacer** existant reste inchangé et séparé : il gère aussi le changement de **projet**, une portée différente de ce menu (qui ne modifie que des champs sur des tâches qui restent en place).

## Comportement des 3 actions

**Assigné** — sélectionner une personne dans le sous-menu **remplace** la liste d'assignés de chaque tâche sélectionnée par `[personne]` (pas un ajout aux assignés existants).

**Statut** — sélectionner un statut applique `{ status: value, statusLabel: t(labelKey) }` à chaque tâche sélectionnée, identique au patch qu'applique déjà le sélecteur de statut d'une tâche individuelle.

**Date d'échéance** — sélectionner une date dans le `DatePickerDropdown` applique la **même date unique** (`dueDate`) à toutes les tâches sélectionnées. Pas de décalage relatif, pas de plage.

## Écriture des données

- Dans `Travail.tsx` (Liste + Tableau, qui partagent le même état) : boucle `multiSelIds.forEach(id => updateTask(project.id, id, patch))`.
- Dans `Taches.tsx` (Mes tâches) : boucle équivalente avec `updateMyTask(id, patch)`. Les tâches assignées par quelqu'un d'autre (`isAssignedTask(id)`) restent éditables ici exactement comme elles le sont déjà individuellement dans cet écran (le statut et la date sont déjà modifiables sur une tâche assignée ; seule la suppression/conversion est bloquée sur ces tâches, cf. code existant) — aucun changement à cette restriction existante.

Une fonction utilitaire locale à chaque écran, `applyBulkPatch(taskIds, patch, undoPatch)`, centralise : capturer un instantané `{ id, previousValue }[]` avant d'écrire, appliquer le patch à chaque tâche, fermer le menu, vider `multiSelIds`, puis déclencher le toast de confirmation.

## Confirmation et annulation

Après l'application, un toast (`showToast`, pattern déjà utilisé pour "Section terminée") apparaît avec :
- message : `"5 tâches assignées à Marc"` / `"5 tâches passées à En cours"` / `"5 tâches déplacées au 15 août"` (nouvelles clés i18n, comptage via la forme `_one`/`_other` déjà utilisée ailleurs)
- bouton **Annuler** (`onUndo`) qui réapplique à chaque tâche sa valeur précédente capturée dans l'instantané avant l'action

Cet instantané est pris avant l'écriture (jamais après), pour éviter le bug de cache déjà rencontré ailleurs dans ce projet où l'état "avant" doit être capturé avant d'écraser le cache optimiste.

## Portée

Les 3 nouvelles actions sont disponibles dans les 3 vues : Liste projet, Tableau, Mes tâches — la barre bulk et `multiSelIds` étant déjà un mécanisme unique partagé par ces vues, aucune duplication de logique de sélection n'est nécessaire, seulement l'ajout du bouton/menu et de la fonction d'application dans chacun des 2 fichiers parents (`Travail.tsx` pour Liste+Tableau, `Taches.tsx` pour Mes tâches).

## Hors scope

- Pas d'ajout d'assigné en plus des existants (remplacement uniquement, décidé avec l'utilisateur)
- Pas de décalage de date relatif (date unique uniquement)
- Pas de fusion du bouton Déplacer dans le nouveau menu Modifier
- Pas de nouvelle action bulk sur la catégorie/section dans ce menu (déjà couvert par Déplacer)
