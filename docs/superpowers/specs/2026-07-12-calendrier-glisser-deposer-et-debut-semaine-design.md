# Calendrier — Glisser-déposer entre les jours & premier jour de la semaine configurable

**Date :** 2026-07-12
**Statut :** Design validé, prêt pour le plan d'implémentation

---

## 1. Contexte

Le calendrier est rendu par deux écrans qui **partagent les mêmes composants** :

- [`CalendrierGlobal.tsx`](../../../app/src/screens/CalendrierGlobal.tsx) — calendrier global (route `/calendrier`, aussi onglet de `/global`)
- [`ProjetCalendrier.tsx`](../../../app/src/screens/ProjetCalendrier.tsx) — calendrier d'un projet (route `/projets/:id/calendrier`, aussi utilisé en mode `embedded`)

Composants partagés dans [`app/src/components/calendar/`](../../../app/src/components/calendar/) :

- `calendarUtils.ts` — helpers de dates + type `CalEvent` + `layoutEvents`
- `MonthView.tsx` — vue mois (grille 7 colonnes)
- `TimeGridView.tsx` — vue semaine/jour (grille horaire)
- `EventBlock.tsx` — carte d'un événement dans la grille horaire

### État actuel

- **Glisser-déposer** : `EventBlock` permet déjà de glisser un événement **verticalement** (changer l'heure, durée conservée) et d'étirer la poignée du bas (changer la durée). Tout est **volontairement borné à la même journée** (`dayStart`/`dayEnd` dans `EventBlock.tsx`). `MonthView` n'a **aucun** glisser-déposer (événements simplement cliquables).
- **Premier jour de la semaine** : **lundi est codé en dur partout** — `startOfWeek`, `getMonthGrid`, `getWeekDays` dans `calendarUtils.ts`, plus les en-têtes de jours et le mini-calendrier. Aucun réglage.
- **Sauvegarde d'un changement d'événement** : `handleEventChange(ev, newStart, newEnd)` → `updateEvent(ev.id, { start, end })` existe déjà dans les deux écrans, câblé à `TimeGridView` via la prop `onEventChange`.

---

## 2. Objectifs

1. **Glisser un événement d'un jour à l'autre** en vue **mois** et en vue **semaine**.
2. Rendre le **premier jour de la semaine configurable** (Dimanche / Lundi), **dimanche par défaut**, réglable dans Paramètres → Personnalisation.

Les deux écrans doivent bénéficier des changements (ils partagent les composants).

---

## 3. Fonctionnalité 1 — Glisser un événement entre les jours

### 3.1 Comportement attendu

**Vue mois (`MonthView`)**
- Attraper un événement (timed ou journée entière) et le glisser vers une autre case-jour → **change la date**, en **conservant l'heure de début et la durée**.
- La case-jour survolée est **surlignée** pendant le glisser (pour montrer où l'événement va atterrir).
- Un **simple clic** ouvre toujours l'événement (comportement actuel). On distingue clic et glisser par un **seuil de mouvement** (~4 px).
- Les **puces d'échéances de tâches** ne sont **pas** déplaçables (ce sont des tâches, hors périmètre).

**Vue semaine (`TimeGridView` + `EventBlock`, `days.length > 1`)**
- En plus du glisser vertical existant (changer l'heure), on peut glisser vers une **autre colonne de jour**.
- Pendant le glisser : la position verticale prévisualise la nouvelle **heure** (comme aujourd'hui) **dans la colonne d'origine**, et la **colonne du jour cible est surlignée**. Au relâchement, l'événement se déplace vers le jour surligné à l'heure prévisualisée (jour + heure changés en un seul geste).
- Si le curseur reste dans la colonne d'origine, le comportement est identique à aujourd'hui (heure seulement).
- La poignée du bas (redimensionnement de la durée) reste **inchangée** et bornée à la journée.
- Les événements **journée entière** de la rangée « jour entier » sont glissables entre les colonnes de cette rangée → change la date.

**Vue jour (`TimeGridView`, `days.length === 1`)**
- Une seule colonne : le glisser reste **vertical uniquement** (aucun changement de jour possible — normal).

### 3.2 Mécanique technique

**Repérage du jour sous le curseur (commun aux deux vues).**
Chaque case-jour (mois) et chaque colonne-jour (semaine, grille horaire + rangée jour entier) porte un attribut `data-cal-day="AAAA-MM-JJ"`. Pendant le glisser, on résout le jour cible avec :

```
const el = document.elementFromPoint(clientX, clientY)?.closest('[data-cal-day]');
const targetDay = el ? parseISODate(el.getAttribute('data-cal-day')) : null;
```

Approche identique en mois et en semaine → une seule mécanique mentale, pas de calcul de géométrie de cellule à maintenir.

**Vue mois — `MonthView.tsx`**
- Nouvelle prop optionnelle `onEventChange?: (ev, newStart, newEnd) => void` (même signature que `TimeGridView`).
- Chaque carte d'événement devient déplaçable via un handler `onMouseDown` → `window` `mousemove`/`mouseup` (même idiome que `EventBlock`) :
  - `mousedown` sur une carte : mémorise l'événement et la position de départ ; `moved = false`.
  - `mousemove` : au-delà du seuil (~4 px), `moved = true` ; résout la case-jour sous le curseur via `data-cal-day` et la met en surbrillance (état local `dragOverDay`).
  - `mouseup` : si `moved` et jour cible valide → calcule `newStart`/`newEnd` et appelle `onEventChange` ; sinon laisse passer le clic (ouverture).
- Calcul du dépôt :
  - **Timed** : `newStart = new Date(cible.année, cible.mois, cible.jour, origStart.getHours(), origStart.getMinutes())` ; `newEnd = new Date(newStart + (origEnd − origStart))` (durée conservée).
  - **Journée entière** : `newStart`/`newEnd` = jour cible (événement d'une journée ; le multi-jour n'est pas géré aujourd'hui, on conserve ce comportement).
- Surbrillance : fond léger `rgba(249,255,0,0.08)` + bordure `1px solid var(--accent)` sur la case survolée pendant `moved`.

**Vue semaine — `TimeGridView.tsx` + `EventBlock.tsx`**
- `TimeGridView` marque chaque colonne-jour (grille horaire) et chaque colonne de la rangée « jour entier » avec `data-cal-day`.
- `EventBlock` (mode `'move'`) est étendu :
  - En plus de `deltaY` → `deltaMin` (heure), il résout le **jour cible** via `document.elementFromPoint(me.clientX, me.clientY).closest('[data-cal-day]')`.
  - `EventBlock` remonte le jour cible à `TimeGridView` (nouveau callback, p. ex. `onDragOverDay(dayISO | null)`) pour que `TimeGridView` surligne la colonne cible.
  - Au relâchement (`mouseup`), si `moved` : `newStart` = jour cible à l'heure prévisualisée (`deltaMin` appliqué à l'heure d'origine, snap 15 min, borné `[START_HOUR, END_HOUR]`) ; `newEnd = newStart + durée`. Appelle `onChange(newStart, newEnd)`.
  - La prévisualisation verticale existante (aperçu qui « colle » jusqu'à ce que les props rattrapent) est conservée telle quelle.
- **Rangée « jour entier »** : les cartes de cette rangée reçoivent leur propre petit handler de glisser (mêmes règles : seuil, `data-cal-day`, surbrillance de colonne), qui change la date via `onEventChange`.

**Sauvegarde — les deux écrans**
`handleEventChange(ev, newStart, newEnd)` est mis à jour pour **respecter le format de stockage** selon `ev.allDay` :

```
const handleEventChange = (ev, newStart, newEnd) => {
  if (ev.allDay) {
    const d = toDateOnly(newStart); // "AAAA-MM-JJ"
    updateEvent(ev.id, { start: d, end: d });
  } else {
    updateEvent(ev.id, { start: newStart.toISOString(), end: newEnd.toISOString() });
  }
};
```

(`resolveEvents`/`resolveProjectEvents` savent déjà parser les deux formats : `s.includes('T') ? new Date(s) : new Date(s+'T00:00:00')`.)

### 3.3 Câblage

- `CalendrierGlobal.tsx` et `ProjetCalendrier.tsx` : passer `onEventChange={handleEventChange}` à `<MonthView … />` (déjà passé à `TimeGridView`).
- Le `handleEventChange` des deux écrans gagne la branche `allDay` ci-dessus.

### 3.4 Cas limites

- **Clic vs glisser** : seuil de mouvement (~4 px) avant de considérer un glisser ; sinon = clic → ouverture. `MonthView` réutilise ce principe ; `EventBlock` a déjà `moved`.
- **Dépôt hors d'un jour** (curseur relâché en dehors de toute case/colonne) : aucun changement, on annule proprement (`dragOverDay = null`).
- **Cases hors mois** (jours grisés de la grille mois) : ce sont de vraies dates valides → dépôt autorisé (l'événement change simplement de mois si on le dépose là).
- **Mise à jour asynchrone du store** (sessions réelles Supabase) : `EventBlock` conserve déjà son aperçu jusqu'à ce que `ev` reflète le changement ; `MonthView` se contente d'appeler `onEventChange` et laisse le ré-abonnement au store rafraîchir la position (pas d'aperçu persistant nécessaire, la carte change simplement de case au prochain rendu).

---

## 4. Fonctionnalité 2 — Premier jour de la semaine configurable

### 4.1 Comportement attendu

- Nouveau réglage **Paramètres → Personnalisation → « Premier jour de la semaine »** : deux choix **Dimanche** / **Lundi**. Défaut = **Dimanche**.
- Le choix s'applique **en direct** (sans rechargement) à : vue mois (ordre des colonnes + en-têtes), vue semaine (les 7 jours affichés + en-têtes), **mini-calendrier** de la barre latérale de `CalendrierGlobal`.
- Persisté en `localStorage` (survit au rechargement), comme la langue / la couleur d'accent / les polices.

### 4.2 Store — `app/src/data/weekStartStore.ts` (nouveau)

Préférence **UI locale uniquement** (pas de Supabase — même nature que `sf_portal_accent` / `sf_ui_fonts`). Patron get/set/subscribe habituel, via `loadPersisted`/`savePersisted`.

```ts
import { loadPersisted, savePersisted } from './persist';

export type WeekStart = 0 | 1; // 0 = dimanche, 1 = lundi
const KEY = 'sf_week_start';

let current: WeekStart = loadPersisted<WeekStart>(KEY, 0); // défaut dimanche
const listeners: (() => void)[] = [];

export function getWeekStart(): WeekStart { return current; }
export function setWeekStart(v: WeekStart): void {
  current = v; savePersisted(KEY, v); listeners.forEach(l => l());
}
export function subscribeWeekStart(fn: () => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
```

### 4.3 `calendarUtils.ts`

Les trois fonctions de découpage de semaine prennent le premier jour en paramètre, avec **valeur par défaut lue dans le store** (pour ne pas avoir à threader le paramètre partout, tout en respectant le réglage) :

```ts
import { getWeekStart } from '../../data/weekStartStore';

export function startOfWeek(d: Date, weekStart: number = getWeekStart()): Date {
  const r = new Date(d);
  const dow = r.getDay();               // 0=dim … 6=sam
  const diff = (dow - weekStart + 7) % 7;
  r.setDate(r.getDate() - diff);
  r.setHours(0,0,0,0);
  return r;
}

export function getMonthGrid(date: Date, weekStart: number = getWeekStart()): Date[] {
  const year = date.getFullYear(), month = date.getMonth();
  const first = new Date(year, month, 1);
  const last  = new Date(year, month+1, 0);
  const pad = (first.getDay() - weekStart + 7) % 7;   // colonnes vides avant le 1er
  const days: Date[] = [];
  for (let i = -pad; i < last.getDate(); i++) days.push(new Date(year, month, 1+i));
  while (days.length % 7 !== 0) days.push(new Date(days[days.length-1].getTime() + 86400000));
  return days;
}

export function getWeekDays(date: Date, weekStart: number = getWeekStart()): Date[] {
  const start = startOfWeek(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
```

### 4.4 En-têtes de jours — dériver de la vraie date

`calendar.daysShort` est stocké en **ordre lundi-d'abord** (`["L","M","M","J","V","S","D"]`). Pour rester correct quel que soit le premier jour, on **dérive chaque libellé de la date réelle** de la colonne plutôt que de l'index :

- Libellé d'une date `d` : `daysShort[(d.getDay() + 6) % 7]` (convertit dim=0…sam=6 vers l'index lundi-d'abord).
- **`MonthView`** : l'en-tête (7 libellés, rendu une fois) se calcule à partir de `weekStart` :
  `for i in 0..6 → weekday = (weekStart + i) % 7 → label = daysShort[(weekday + 6) % 7]`.
  La grille utilise déjà `getMonthGrid(cur)` (qui respecte maintenant le réglage).
- **`TimeGridView`** : remplacer `dayNames[i]` par un libellé dérivé de la date de la colonne : `daysShort[(d.getDay() + 6) % 7]`. Cela remplace aussi l'actuelle logique `dayIdx` du mode jour (devient inutile).
- **`MiniCalendar`** (dans `CalendrierGlobal.tsx`) : utilise `getMonthGrid(mini)` (respecte le réglage) et réordonne ses libellés `datepicker.daysShort` selon `weekStart` de la même façon.

### 4.5 Réactivité

Chaque surface qui affiche le calendrier doit se **réabonner** au store et se re-rendre quand le réglage change :

- `CalendrierGlobal` et `ProjetCalendrier` : `useEffect(() => subscribeWeekStart(() => forceRerender()), [])` (petit compteur d'état). Comme `getWeekDays`/`getMonthGrid` lisent le store au moment du rendu, un simple re-rendu suffit à recalculer la grille et les en-têtes.
- `MonthView`, `TimeGridView`, `MiniCalendar` sont re-rendus par leur parent → pas besoin d'abonnement propre (ils reçoivent `cur`/`days` recalculés et lisent `weekStart` via les helpers). *Note d'implémentation :* `MonthView` calcule `getMonthGrid(cur)` en interne — il doit donc lire `weekStart` lui-même ; on lui fait lire `getWeekStart()` au rendu et le re-rendu est déclenché par le parent abonné.

### 4.6 Réglage UI — `Parametres.tsx`

Nouveau composant `WeekStartSettings` calqué sur `LanguageSettings` (deux gros boutons sélectionnables), inséré dans la section **Personnalisation** (près de `LanguageSettings`, sous un séparateur `borderTop`).

- Lit `getWeekStart()`, écrit via `setWeekStart(0 | 1)`.
- Deux options : **Dimanche** (valeur 0) / **Lundi** (valeur 1).

### 4.7 i18n — `fr.json` + `en.json`

Nouvelles clés (ajoutées **avant** usage, règle du projet). Proposition sous le namespace `settings` :

| Clé | FR | EN |
|-----|----|----|
| `settings.weekStartTitle` | « Premier jour de la semaine » | "First day of the week" |
| `settings.weekStartDesc` | « Choisissez le jour qui commence la semaine dans le calendrier. » | "Choose which day starts the week in the calendar." |
| `settings.weekStartSunday` | « Dimanche » | "Sunday" |
| `settings.weekStartMonday` | « Lundi » | "Monday" |

### 4.8 Cas limites

- Valeur `localStorage` corrompue → `loadPersisted` retombe sur le défaut (0 = dimanche).
- `calendar.daysLong` est en ordre dimanche-d'abord dans les traductions mais **n'est pas utilisé** par ces vues (elles utilisent `daysShort`) — ne pas y toucher.
- Le titre de la vue semaine utilise `startOfWeek(cur)` → suit automatiquement le réglage.

---

## 5. Fichiers touchés

**Nouveaux**
1. `app/src/data/weekStartStore.ts`

**Modifiés**
2. `app/src/components/calendar/calendarUtils.ts` — `startOfWeek`/`getMonthGrid`/`getWeekDays` paramétrés par `weekStart`
3. `app/src/components/calendar/MonthView.tsx` — glisser-déposer + prop `onEventChange` + en-têtes réordonnés
4. `app/src/components/calendar/TimeGridView.tsx` — `data-cal-day` sur colonnes + rangée jour entier, surbrillance colonne cible, en-têtes dérivés de la date, glisser rangée jour entier
5. `app/src/components/calendar/EventBlock.tsx` — mode `move` : jour cible via `elementFromPoint`, remontée du jour survolé, dépôt jour+heure
6. `app/src/screens/CalendrierGlobal.tsx` — `onEventChange` sur `MonthView`, branche `allDay` dans `handleEventChange`, abonnement `weekStart`, mini-calendrier réordonné
7. `app/src/screens/ProjetCalendrier.tsx` — `onEventChange` sur `MonthView`, branche `allDay` dans `handleEventChange`, abonnement `weekStart`
8. `app/src/screens/Parametres.tsx` — composant `WeekStartSettings` dans Personnalisation
9. `app/src/locales/fr.json` + `app/src/locales/en.json` — clés `settings.weekStart*`

---

## 6. Hors périmètre (décidé)

- **`DatePickerDropdown`** (sélecteur de date des formulaires) conserve son ordre actuel pour cette itération — pourra être aligné sur le réglage plus tard.
- **Glisser une échéance de tâche** (les puces de tâches) — ce sont des tâches, pas des événements.
- **Événements multi-jours** en journée entière — non gérés aujourd'hui, on conserve le comportement « une journée ».
- **Redimensionnement d'un événement à travers plusieurs jours** — la poignée de durée reste bornée à la journée.
- **Fantôme de glisser flottant** qui suit le curseur à travers les colonnes en vue semaine — on retient l'approche « surbrillance de la colonne cible + aperçu vertical dans la colonne d'origine » ; un vrai fantôme cross-colonne est une amélioration future possible.

---

## 7. Vérification

Pas de tests automatisés (convention du projet) → vérification via le serveur de preview :

1. **Vue mois** : glisser un événement horaire vers un autre jour → date change, heure conservée ; glisser un événement journée entière → date change ; simple clic → ouvre toujours l'événement ; surbrillance de la case cible visible pendant le glisser.
2. **Vue semaine** : glisser un événement vers une autre colonne (jour) et une autre hauteur (heure) → les deux changent ; rester dans la même colonne → seule l'heure change (inchangé) ; glisser un événement de la rangée « jour entier » vers un autre jour.
3. **Réglage** : Paramètres → Personnalisation → basculer Dimanche/Lundi → vue mois, vue semaine et mini-calendrier se réordonnent en direct ; recharger → le choix persiste.
4. **Régression** : le redimensionnement par la poignée du bas fonctionne toujours ; les deux écrans (global + projet, y compris `embedded`) se comportent identiquement.
5. `npm run build` (vérification TypeScript) passe.
