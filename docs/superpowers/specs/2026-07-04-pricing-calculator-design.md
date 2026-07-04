# Calculateur de prix par sièges + stockage sur `Pricing.tsx`

## Contexte

`Pricing.tsx` propose actuellement trois paliers fixes (Gratuit/Studio/Agence) avec des membres "illimités" sur Studio et Agence, plus une section "Stockage" séparée montrant le coût de blocs de stockage additionnel (`STORAGE_BLOCKS`), indépendante du choix de palier.

L'utilisateur veut passer à un modèle où le nombre de membres d'équipe (comptes internes au studio, pas les clients invités sur le portail) a un coût au-delà d'un seuil inclus par palier — mais avec un prix par siège additionnel basé sur le coût réel d'infrastructure (Supabase auth, quasi nul) plus une marge raisonnable, explicitement **pas** le modèle par siège à haute marge d'Asana. Il veut aussi un outil interactif permettant de visualiser en temps réel le coût total selon le nombre de sièges et le stockage choisis.

## Objectif

1. Remplacer la mention "membres illimités" de Studio/Agence par un nombre de sièges inclus + un prix par siège additionnel.
2. Ajouter une section calculateur interactive (palier + sièges + stockage → prix total en direct), qui fusionne l'actuelle section "Stockage".
3. Ajouter une barre fixe en bas d'écran qui affiche le prix total calculé en permanence pendant qu'on navigue la page.

## Modèle de prix

Ajout aux entrées `PLANS` (Studio, Agence uniquement — Gratuit reste plafonné à 5 membres, sans surplus) :

| Palier | Sièges inclus | Prix/siège add. (mensuel) | Prix/siège add. (annuel) |
|--------|---------------|---------------------------|---------------------------|
| Studio | 5 | 3 $ CA | 29 $ CA |
| Agence | 10 | 2 $ CA | 19 $ CA |

Le prix annuel par siège suit le même ratio de rabais (~20 %) que les paliers actuels (`priceY` vs `priceM × 12`).

`STORAGE_BLOCKS` n'est pas modifié — réutilisé tel quel comme les crans du slider de stockage du calculateur.

**Tableau comparatif (`COMPARE_SECTIONS`)** : la ligne `featMembers` passe de `[upTo5, unlimited, unlimited]` à `[upTo5, "5 inclus", "10 inclus"]` (nouvelles clés i18n), avec une note sous le tableau renvoyant au calculateur pour le prix des sièges additionnels.

## Section calculateur (remplace la section "Stockage" actuelle)

Nouvelle section positionnée exactement là où se trouve la section "Stockage" actuelle : après le tableau comparatif, avant la section Auto-hébergement.

**Contrôles :**
- **Sélecteur de palier** : segmented control Studio / Agence (même style visuel que le toggle mensuel/annuel existant). Gratuit n'apparaît pas ici.
- **Slider sièges** : de `includedSeats` du palier sélectionné jusqu'à 50, pas de 1. En dessous ou égal au nombre inclus, le coût additionnel est 0.
- **Slider stockage** : 5 crans discrets correspondant à `STORAGE_BLOCKS` (inclus / +50 Go / +200 Go / +500 Go / +1 To) — pas de valeur continue, les paliers de stockage ont des prix fixes non linéaires.
- Respecte le toggle mensuel/annuel déjà présent en haut de la page (état `billing` partagé, pas de toggle dupliqué).

**Calcul affiché :**
```
total = plan[tier].price(billing)
      + max(0, seats - plan[tier].includedSeats) × plan[tier].seatPrice(billing)
      + STORAGE_BLOCKS[storageIndex].price(billing)
```

Le détail (prix de base + surplus sièges + surplus stockage = total) est affiché en clair sous les sliders, pas seulement le total.

## Barre fixe en bas d'écran

- `position: fixed; bottom: 0; left: 0; right: 0`, au-dessus du contenu (`zIndex` élevé), visible sur toute la page dès qu'elle est montée (pas seulement dans la section calculateur).
- Contenu : résumé compact de la sélection courante (ex. `Studio · 8 sièges · +200 Go → 43 $/mois`) + bouton CTA `Commencer` vers `/register`.
- Se met à jour en direct à chaque changement des sliders/sélecteur, l'état du calculateur devant donc remonter au niveau du composant `Pricing` (pas local à la section).
- N'apparaît que sur la page Pricing (pas de fuite vers le reste de l'app).

## i18n

Nouvelles clés dans `fr.json`/`en.json` (namespace `pricing`) : titre/sous-titre de la section calculateur, labels des sliders (sièges/stockage), texte de la barre fixe, note "sièges inclus" du tableau comparatif, valeurs `"5 inclus"`/`"10 inclus"` remplaçant `pricing.unlimited` pour ces deux colonnes. Aucun texte hard-codé — tout passe par `t()`.

## Hors scope

- Pas de vrai flux de facturation/paiement (le CTA reste un lien vers `/register`, cohérent avec le reste de la page qui n'a pas de backend de paiement actif).
- Pas de changement au modèle Gratuit (reste plafonné à 5, sans surplus, absent du calculateur).
- Pas de changement à la section Auto-hébergement (licence unique + abonnement mises à jour), qui reste indépendante de ce modèle par sièges.
- Le tableau comparatif garde sa structure ; seule la ligne `featMembers` change de valeurs.
