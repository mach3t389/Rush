# Unification des calendriers — design

Date : 2026-07-03
Statut : approuvé (en attente de plan d'implémentation)

## Contexte

Trois écrans calendrier existent dans le code : `CalendrierGlobal.tsx` (1228 lignes, route `/calendrier`), `ProjetCalendrier.tsx` (1035 lignes, route `/projets/:projectId/calendrier`) et `TravailCalendar.tsx` (723 lignes).

Investigation confirmée par exploration du code :
- `CalendrierGlobal.tsx` et `ProjetCalendrier.tsx` sont tous deux branchés sur `eventStore.ts` (get/add/update/delete/subscribeEvents) et fonctionnent correctement. Ils partagent ~60 % de code identique ou quasi-identique : helpers de dates (`addDays`, `isSameDay`, `startOfWeek`, `fmt2`, `fmtTime`, `parseFrDate`), constantes (`HOUR_H`, `START_HOUR`, `END_HOUR`, `HOURS`), le composant `EventBlock` (carte d'événement, code identique caractère pour caractère), la logique `layoutEvents()`, la grille mensuelle (`MonthView`), la grille horaire semaine/jour (`TimeGridView`) avec sélection par glisser-déposer.
- `TravailCalendar.tsx` est **du code mort** : aucun fichier de l'application ne l'importe. Il n'est atteignable par aucune route ni onglet. Ses bugs documentés (déconnecté d'`eventStore`, champs de date en `defaultValue` non contrôlés, bascule Événement/Tâche non fonctionnelle) n'affectent donc aucun utilisateur réel — c'est un fichier orphelin, probablement un brouillon jamais branché.

## Décision

1. **Supprimer `TravailCalendar.tsx`.** Code mort, remplacé fonctionnellement par `ProjetCalendrier.tsx` qui couvre déjà le calendrier d'un projet correctement.
2. **Extraire le code partagé** de `CalendrierGlobal.tsx`/`ProjetCalendrier.tsx` dans de nouveaux fichiers sous `app/src/components/calendar/` :
   - `calendarUtils.ts` — helpers de dates et constantes (purs, sans JSX).
   - `EventBlock.tsx` — la carte d'événement (identique dans les deux écrans).
   - `MonthView.tsx` — la grille mensuelle, paramétrée par la liste d'événements et les callbacks (clic jour, clic événement) déjà utilisés par les deux écrans.
   - `TimeGridView.tsx` — la grille semaine/jour avec glisser-déposer, même principe.
3. **Ne pas créer un `CalendarScope` unique fusionnant toute la logique des deux écrans** (option initialement envisagée dans l'audit) — après lecture du code, les deux écrans divergent sur des points structurants (légende multi-projets + filtres par type dans le global ; portée fixée à un seul projet dans l'écran projet) qui rendraient un composant unique paramétré plus complexe à lire que deux écrans fins qui composent les mêmes briques partagées. Extraire les briques communes (étape 2) donne le même gain (une seule implémentation de la grille/carte/dates à maintenir) sans la complexité d'un composant à multiples branches conditionnelles.

## Portée

- `CalendrierGlobal.tsx` et `ProjetCalendrier.tsx` gardent leur fichier propre, mais deviennent nettement plus courts (la grille/carte/dates déménagent). Leur comportement visible ne change pas.
- `TravailCalendar.tsx` est supprimé.
- Aucun changement de route, aucun changement de `eventStore.ts`, aucun changement visuel pour l'utilisateur final — c'est un refactor interne pur.

## Hors scope

- Ajouter de nouvelles fonctionnalités calendrier (vue année, récurrence d'événements, etc.) — pas demandé.
- Réintroduire un calendrier dans l'onglet Travail — si ce besoin existe un jour, ce sera un nouveau chantier qui pourra réutiliser les briques créées ici.

## Points de vérification pour le plan d'implémentation

- Confirmer via une recherche globale qu'aucun fichier n'importe `TravailCalendar` avant suppression (déjà fait par l'exploration : zéro résultat).
- Après extraction, les deux écrans doivent afficher un rendu visuel identique à avant (mêmes captures d'écran/comportement) — vérification manuelle via le serveur de preview sur les deux routes (`/calendrier` et `/projets/:id/calendrier`), en mode mois et semaine/jour, y compris la création d'événement par glisser-déposer.
- `npx tsc --noEmit -p tsconfig.app.json` (pas la commande nue) après chaque extraction, comparé au nombre d'erreurs préexistant.
