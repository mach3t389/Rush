# Fusion du calculateur dans le tableau comparatif

## Contexte

Le chantier précédent (voir [2026-07-04-pricing-calculator-design.md](2026-07-04-pricing-calculator-design.md)) a ajouté un modèle de prix par sièges (2 inclus partout, surplus payant sur Studio/Agence) avec une section calculateur séparée (sélecteur de palier + sliders + détail du calcul) et une barre fixe en bas d'écran. La barre a depuis été retirée (répétition jugée inutile par l'utilisateur, le total étant déjà visible dans la section calculateur).

L'utilisateur reste insatisfait de la structure actuelle : trois vues distinctes du même prix (cartes de palier, tableau comparatif statique, section calculateur séparée) et le calculateur affiche des **deltas** ("+200 Go", un compte de sièges brut) sans qu'on voie clairement le **total** obtenu (Go totaux, membres totaux). Il propose d'intégrer les contrôles ajustables **directement dans le tableau comparatif détaillé**, plutôt que d'avoir un widget séparé.

## Objectif

1. Retirer la section calculateur autonome en entier.
2. Rendre les lignes "Membres d'équipe" et "Stockage inclus" du tableau comparatif interactives pour les colonnes Studio et Agence (compteurs `− / +`), avec des **totaux absolus** affichés (pas des deltas).
3. Le prix affiché en en-tête du tableau (par colonne Studio/Agence) se recalcule en direct selon les réglages de sa colonne.
4. Studio et Agence ont chacun leur propre état — configurables indépendamment, comparables côte à côte dans le même tableau.
5. Les 3 cartes de palier en haut de page ne changent pas (prix de départ fixe, indépendant du tableau).

## Modèle de données et d'état

`PLANS` et `STORAGE_BLOCKS` ne changent pas (mêmes champs qu'actuellement : `includedSeats`, `seatPriceM/Y`, `STORAGE_BLOCKS[].priceM/Y`).

Nouvel tableau local (à côté de `STORAGE_BLOCKS`, purement pour l'affichage — ne remplace pas les prix) :
```ts
const STORAGE_TOTALS = ['50 Go', '100 Go', '250 Go', '550 Go', '1 050 Go']; // aligné index-à-index avec STORAGE_BLOCKS
```
(50 Go = stockage de base inclus dans Studio/Agence + le bloc additionnel à cet index — même convention hardcodée "Go" que le reste du fichier, pas de nouvelle clé i18n.)

**State remplacé** — supprimer `calcPlan`, `calcSeats`, `calcStorageIdx` ; ajouter :
```ts
const [studioSeats, setStudioSeats] = useState(2);
const [studioStorageIdx, setStudioStorageIdx] = useState(0);
const [agenceSeats, setAgenceSeats] = useState(2);
const [agenceStorageIdx, setAgenceStorageIdx] = useState(0);
```

**Valeurs dérivées remplacées** — supprimer le bloc `calcPlanData/calcBasePrice/calcSeatPrice/calcExtraSeats/calcSeatsCost/calcStorageBlock/calcStorageCost/calcTotal/calcStorageLabel` ; ajouter une fonction pure réutilisée pour les deux colonnes (évite de dupliquer la formule) :
```ts
function planTotal(plan: typeof PLANS[number], seats: number, storageIdx: number, billing: 'monthly' | 'yearly') {
  const base = billing === 'monthly' ? plan.priceM : plan.priceY;
  const seatPrice = billing === 'monthly' ? plan.seatPriceM : plan.seatPriceY;
  const extraSeats = Math.max(0, seats - plan.includedSeats);
  const storagePrice = billing === 'monthly' ? STORAGE_BLOCKS[storageIdx].priceM : STORAGE_BLOCKS[storageIdx].priceY;
  return base + extraSeats * seatPrice + storagePrice;
}
```
Appelée dans le composant : `planTotal(studioPlanData, studioSeats, studioStorageIdx, billing)` et l'équivalent pour Agence.

## Composant `Stepper` (nouveau helper local, à côté de `Check`/`CellValue`)

```tsx
function Stepper({ label, onDec, onInc, disableDec, disableInc, editable, value, min, max, onChangeValue }: {
  label: string; onDec: () => void; onInc: () => void; disableDec: boolean; disableInc: boolean;
  editable?: boolean; value?: number; min?: number; max?: number; onChangeValue?: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={onDec} disabled={disableDec} style={{
        width: 20, height: 20, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: disableDec ? 'default' : 'pointer', opacity: disableDec ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}>
        <SFIcon name="minus" size={10} color="var(--text-2)" />
      </button>
      {editable ? (
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => {
            const parsed = parseInt(e.target.value, 10);
            if (Number.isNaN(parsed)) return;
            onChangeValue?.(Math.min(max ?? parsed, Math.max(min ?? parsed, parsed)));
          }}
          style={{
            width: 44, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-mono)',
            color: 'var(--text)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 0',
          }}
        />
      ) : (
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--text)', minWidth: 52, textAlign: 'center' }}>{label}</span>
      )}
      <button onClick={onInc} disabled={disableInc} style={{
        width: 20, height: 20, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: disableInc ? 'default' : 'pointer', opacity: disableInc ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}>
        <SFIcon name="plus" size={10} color="var(--text-2)" />
      </button>
    </div>
  );
}
```
Réutilisé pour les 4 cellules interactives (Studio/Agence × sièges/stockage) avec des bornes différentes :
- **Sièges** : `editable`, `value = seats`, `min = 2`, `max = 50`, `onChangeValue = setSeats` (clampé à [2, 50] avant d'être appliqué). Champ `<input type="number">` — permet de taper un chiffre directement, et les flèches haut/bas du clavier (comportement natif du navigateur sur un `input[type=number]` focus) incrémentent/décrémentent par pas de 1, en plus des boutons `−`/`+` pour un clic rapide. `disableDec = seats <= 2`, `disableInc = seats >= 50`.
- **Stockage** : non-`editable` (comme avant), `label = STORAGE_TOTALS[idx]`, `disableDec = idx <= 0`, `disableInc = idx >= STORAGE_TOTALS.length - 1`, pas de 1 sur l'index. Reste boutons uniquement — les paliers de stockage sont des valeurs fixes (pas de saisie libre possible, contrairement aux sièges).

## Restructuration du tableau comparatif

`COMPARE_SECTIONS` perd sa première entrée (`sectionProjects`) — celle-ci est retirée du tableau générique et rendue à la main juste avant la boucle `COMPARE_SECTIONS.map(...)`, pour permettre d'intercaler des cellules interactives entre les lignes statiques. Les 4 autres sections (Portail, Fonctionnalités, Intégrations, Support) restent strictement inchangées et continuent d'utiliser le mécanisme générique `CellValue`.

**Ordre des lignes dans la section "Projets & équipe" (identique à l'ordre visuel actuel) :**
1. "Projets actifs" — statique, rendu via le même mécanisme générique qu'avant (`CellValue`, valeurs `['3', 'Illimités', 'Illimités']`).
2. "Membres d'équipe" — **nouvelle ligne custom** : cellule Gratuit = texte statique `t('pricing.included2')` ("2 inclus") ; cellules Studio/Agence = `<Stepper>` sur `studioSeats`/`agenceSeats`.
3. "Invités / clients" — statique, inchangé (`CellValue`, valeurs `['Illimités', 'Illimités', 'Illimités']`).
4. "Stockage inclus" — **nouvelle ligne custom** : cellule Gratuit = texte statique `'5 Go'` ; cellules Studio/Agence = `<Stepper>` sur `studioStorageIdx`/`agenceStorageIdx` (label = `STORAGE_TOTALS[idx]`).

Chaque ligne custom réutilise exactement le même wrapper visuel que les lignes génériques (`display: grid; gridTemplateColumns: '2fr 1fr 1fr 1fr'`, `colStyle(i)` pour les cellules de valeur, même `borderBottom`) pour rester visuellement indissociable du reste du tableau.

**En-tête du tableau (prix par colonne) :** pour Gratuit, comportement inchangé (prix statique formaté). Pour Studio/Agence, remplacer l'affichage statique `${plan.priceM} $/mois` par `${planTotal(plan, seats, storageIdx, billing)} $/${mois|an}` (recalcul en direct à chaque changement de stepper ou de toggle mensuel/annuel).

**Note sous le tableau (`pricing.membersNote`)** : contenu réduit — retirer la phrase sur les invités (déjà portée par la ligne "Invités / clients" du tableau, redondante ici). Nouveau texte :
- FR : "Studio : +3 $ CA/mois par membre d'équipe additionnel (dès le 3e). Agence : +2 $ CA/mois (dès le 3e)."
- EN : "Studio: +$3 CA/month per additional team member (from the 3rd on). Agency: +$2 CA/month (from the 3rd on)."

## Suppression de la section calculateur

Retirer entièrement le bloc JSX "── Calculateur ──" (sélecteur de palier, notes, sliders, détail du calcul) ainsi que les clés i18n devenues inutilisées dans `fr.json`/`en.json` : `calcTitle`, `calcSubtitle`, `calcGuestsNote`, `calcSeatsLabel`, `calcSeatsIncludedNote`, `calcStorageLabel`, `calcNoStorage`, `calcBreakdownBase`, `calcBreakdownSeats`, `calcBreakdownStorage`, `calcBreakdownTotal`.

## Ce qui ne change pas

- Les 3 cartes de palier en haut de page (prix de départ fixe, aucun lien avec les compteurs du tableau plus bas).
- Le toggle mensuel/annuel (`billing`), qui s'applique maintenant au tableau au lieu de la section calculateur supprimée.
- La ligne "Invités / clients" et son texte "Illimités".
- La section Auto-hébergement, la FAQ, le CTA final.
- `STORAGE_BLOCKS` (prix sources, non modifié) — `STORAGE_TOTALS` n'est qu'un tableau d'affichage parallèle.

## Hors scope

- Corriger l'unité "Go" hardcodée (au lieu de "GB" en anglais) : c'est un gap i18n préexistant dans ce fichier (déjà présent avant ce chantier, sur `plan.storage` et la ligne `featStorage`), pas introduit ici — pas corrigé pour rester focalisé sur la fusion demandée.
- Adaptation mobile/tablette des colonnes du tableau (page déjà orientée desktop, `maxWidth: 1080`, aucune media query existante dans ce fichier).
- Persistance des réglages sièges/stockage entre visites (état local React, remis à zéro au rechargement — comportement identique à l'ancien calculateur).
