# Composant `SFModal` partagé

## Contexte

Le mémo d'audit du projet note qu'environ 30 "overlays" (fenêtres superposées) sont recodés à la main à travers l'app, avec des valeurs de `zIndex`, `borderRadius` et d'opacité de fond différentes selon l'écran. Une exploration du code confirme le problème mais révèle qu'il recouvre en réalité **trois patterns UI distincts** qu'il ne faut pas confondre :

1. **Dialogues centrés avec fond assombri** (backdrop + boîte centrée) — le vrai "modal". Exemple : `ImageReview.tsx:747-761` ("Supprimer la ronde ?").
2. **Menus/popovers ancrés** (positionnés relativement à un bouton déclencheur, via `position: 'fixed'`/`'absolute'` + coordonnées calculées) — ex. les menus de `TaskPanel.tsx`, `DatePicker.tsx`, les dropdowns de mention. Ce sont des composants différents (`DatePickerDropdown` existe déjà pour ce pattern) et ne doivent pas être forcés dans un composant "modal".
3. **Panneaux latéraux coulissants** (backdrop + panneau plein-hauteur ancré à droite) — ex. `MonEquipe.tsx:168-171`, `ProfileEditPanel.tsx:206-209`, et un des deux modals de `TravailOverview.tsx` (lignes 167-170). Pattern visuellement proche du modal (backdrop partagé) mais géométrie différente (drawer, pas boîte centrée).

## Objectif

Créer `SFModal` dans `app/src/components/ui/` pour le pattern 1 uniquement (dialogue centré), et migrer un premier lot de sites d'appel confirmés pour prouver le composant et corriger l'incohérence la plus visible. Les patterns 2 et 3 restent hors scope de ce chantier.

## Portée

**Sites d'appel confirmés pour ce chantier (9 sites, 6 fichiers) :**
- `app/src/screens/ImageReview.tsx` — 3 dialogues (nouvelle ronde, upload, suppression de ronde)
- `app/src/screens/DocumentReview.tsx` — 2 dialogues (upload, suppression de version)
- `app/src/components/ProjectTaskRow.tsx` — 1 dialogue
- `app/src/screens/ProjectMembres.tsx` — 1 dialogue (avec en-tête titre + bouton fermer)
- `app/src/screens/Travail.tsx` — 1 dialogue
- `app/src/screens/TravailOverview.tsx` — 1 des deux (le dialogue centré ligne 312-315 ; le panneau latéral ligne 167-170 reste un drawer, hors scope)

**Hors scope, documenté comme suite possible :**
- Les panneaux latéraux (drawers) — pattern différent, mériterait son propre composant si repris un jour.
- Les menus/popovers ancrés — pattern déjà couvert conceptuellement par `DatePickerDropdown`.
- Les dialogues de création plus complexes dans `Modeles.tsx` et `FichiersGlobal.tsx` — structure interne plus spécifique à chaque écran, migration individuelle plus risquée pour un gain proportionnellement plus faible ; à reprendre dans un chantier séparé si souhaité.

## Conception

`SFModal` est un composant générique à enfants (`children`), pas un composant à emplacements rigides (pas de props `header`/`footer` séparées) — ça minimise la friction de migration : on remplace juste le wrapper `fixed+backdrop+boîte` par `<SFModal>`, le contenu interne (titre, texte, boutons) ne change pas.

```tsx
interface SFModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;       // si fourni, affiche l'en-tête titre + bouton fermer (X) automatiquement
  width?: number | string; // défaut 400
  zIndex?: number;       // défaut 400
  closeOnBackdrop?: boolean; // défaut true
  closeOnEscape?: boolean;   // défaut true
  children: React.ReactNode;
}
```

**Valeurs standardisées** (remplacent les valeurs variées trouvées : `borderRadius` 10/14/16/18, opacité backdrop 0.45/0.5/0.55, `boxShadow` avec opacités 0.5-0.8) :
- `borderRadius: 14` (valeur `var(--radius)` du design system, déjà la plus fréquente parmi les dialogues centrés)
- Backdrop : `rgba(0,0,0,0.5)` fixe
- `boxShadow: '0 16px 48px rgba(0,0,0,0.6)'` fixe
- `zIndex` par défaut `400`, overridable (certains sites empilent un second modal par-dessus, ex. confirmation de suppression au-dessus d'un modal d'upload — nécessite un `zIndex` plus élevé explicite dans ce cas)

**Comportements ajoutés** (absents ou incohérents aujourd'hui) :
- Fermeture par la touche Échap — actuellement absent de tous les sites d'appel identifiés.
- Clic sur le fond assombri ferme le modal — déjà présent partout, centralisé.
- Quand `title` est fourni : en-tête avec titre + bouton `X` (icône `SFIcon name="x"`), reproduisant le pattern déjà utilisé par `ProjectMembres.tsx`.
- Quand `title` est omis : pas d'en-tête, le contenu (titre `<h3>` etc.) reste géré par l'appelant — reproduit le pattern des dialogues de confirmation simples (ex. `ImageReview.tsx`'s "Supprimer la ronde ?").

## Hors scope

- Pas de migration des drawers latéraux (`MonEquipe.tsx`, `ProfileEditPanel.tsx`, le panneau de `TravailOverview.tsx`).
- Pas de migration des menus/popovers ancrés.
- Pas de migration des dialogues de `Modeles.tsx`/`FichiersGlobal.tsx`.
- Pas de changement du composant `DatePickerDropdown` existant.

## Tests / vérification

Pas de suite de tests automatisés. Vérification manuelle prévue après implémentation :
1. Ouvrir chacun des 9 dialogues migrés, confirmer que le look est cohérent (radius/ombre/backdrop identiques) et que le contenu/comportement (boutons, formulaires) fonctionne exactement comme avant.
2. Confirmer que la touche Échap ferme chaque dialogue migré (nouveau comportement).
3. Confirmer que le clic sur le fond assombri ferme toujours chaque dialogue (comportement préservé).
4. `npx tsc --noEmit -p tsconfig.app.json` : aucune nouvelle erreur sur les fichiers touchés.
