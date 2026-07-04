# Calculateur de prix par sièges + stockage sur `Pricing.tsx`

## Contexte

`Pricing.tsx` propose actuellement trois paliers fixes (Gratuit/Studio/Agence) avec des membres "illimités" sur Studio et Agence, plus une section "Stockage" séparée montrant le coût de blocs de stockage additionnel (`STORAGE_BLOCKS`), indépendante du choix de palier.

L'utilisateur veut passer à un modèle où le nombre de **membres d'équipe interne** (comptes internes au studio) a un coût au-delà d'un seuil inclus par palier — avec un prix par siège additionnel basé sur le coût réel d'infrastructure (Supabase auth, quasi nul) plus une marge raisonnable, explicitement **pas** le modèle par siège à haute marge d'Asana. Il veut aussi un outil interactif permettant de visualiser en temps réel le coût total selon le nombre de sièges et le stockage choisis.

**Distinction essentielle, à clarifier explicitement sur la page :** les **invités/clients** (accès au portail client d'un projet) ne comptent jamais comme des sièges facturables — ils sont **illimités et gratuits sur tous les paliers, y compris Gratuit**. Seuls les comptes membres de l'équipe interne du studio (designers, monteurs, chargés de projet, etc.) comptent dans le calcul de sièges.

**Contrainte explicite de l'utilisateur :** aucun palier ne doit forcer un nombre minimum de sièges payants qui ne correspond pas à l'usage réel — la personne doit payer exactement ce dont elle a besoin, sans "bloc" de sièges imposé. Et passer de Gratuit à un palier payant ne doit jamais donner l'impression d'un recul (downgrade) sur le nombre de membres inclus.

## Objectif

1. Remplacer la mention "membres illimités" de Studio/Agence par un nombre de sièges inclus + un prix par siège additionnel, applicable uniquement aux membres d'équipe interne (jamais aux invités/clients).
2. Ajouter une section calculateur interactive (palier + sièges + stockage → prix total en direct), qui fusionne l'actuelle section "Stockage".
3. Ajouter une barre fixe en bas d'écran qui affiche le prix total calculé en permanence pendant qu'on navigue la page.

## Modèle de prix

**Sièges inclus : 2 membres d'équipe interne sur les trois paliers (Gratuit, Studio, Agence)** — uniforme, pour qu'aucun passage à un palier payant ne semble un recul par rapport à Gratuit. Les invités/clients du portail restent illimités et gratuits sur les trois paliers, sans exception.

| Palier | Sièges inclus | Sièges additionnels possibles ? | Prix/siège add. (mensuel) | Prix/siège add. (annuel) |
|--------|---------------|----------------------------------|---------------------------|---------------------------|
| Gratuit | 2 | Non — plafond dur, il faut changer de palier | — | — |
| Studio | 2 | Oui, à partir du 3e membre | 3 $ CA | 29 $ CA |
| Agence | 2 | Oui, à partir du 3e membre | 2 $ CA | 19 $ CA |

Le prix annuel par siège suit le même ratio de rabais (~20 %) que les paliers actuels (`priceY` vs `priceM × 12`).

`STORAGE_BLOCKS` n'est pas modifié — réutilisé tel quel comme les crans du slider de stockage du calculateur.

**Tableau comparatif (`COMPARE_SECTIONS`)** : la ligne `featMembers` est renommée "Membres d'équipe" et devient `["2 inclus", "2 inclus", "2 inclus"]` (nouvelle clé i18n commune) avec une note sous le tableau précisant le prix des sièges additionnels pour Studio/Agence et renvoyant au calculateur. Une **nouvelle ligne "Invités / clients"** est ajoutée juste en dessous, avec la valeur `Illimité` répétée sur les trois colonnes, pour rendre la distinction visible dans le tableau lui-même.

## Section calculateur (remplace la section "Stockage" actuelle)

Nouvelle section positionnée exactement là où se trouve la section "Stockage" actuelle : après le tableau comparatif, avant la section Auto-hébergement.

**Contrôles :**
- **Sélecteur de palier** : segmented control Studio / Agence (même style visuel que le toggle mensuel/annuel existant). Gratuit n'apparaît pas ici (plafond dur à 2, pas de surplus payant à calculer).
- **Slider sièges (membres d'équipe interne)** : de 2 (les 2 sièges inclus, plancher du slider) jusqu'à 50, pas de 1. Une légende précise "2 membres inclus dans le prix de base". Le champ des invités/clients n'apparaît pas dans le calculateur — mention explicite juste au-dessus des sliders : "Les invités et clients sur le portail sont toujours illimités et gratuits, peu importe le palier."
- **Slider stockage** : 5 crans discrets correspondant à `STORAGE_BLOCKS` (inclus / +50 Go / +200 Go / +500 Go / +1 To) — pas de valeur continue, les paliers de stockage ont des prix fixes non linéaires.
- Respecte le toggle mensuel/annuel déjà présent en haut de la page (état `billing` partagé, pas de toggle dupliqué).

**Calcul affiché :**
```
total = plan[tier].price(billing)
      + max(0, seats - 2) × plan[tier].seatPrice(billing)
      + STORAGE_BLOCKS[storageIndex].price(billing)
```

Le détail (prix de base + surplus sièges + surplus stockage = total) est affiché en clair sous les sliders, pas seulement le total.

## Barre fixe en bas d'écran

- `position: fixed; bottom: 0; left: 0; right: 0`, au-dessus du contenu (`zIndex` élevé), visible sur toute la page dès qu'elle est montée (pas seulement dans la section calculateur).
- Contenu : résumé compact de la sélection courante (ex. `Studio · 8 sièges · +200 Go → 43 $/mois`) + bouton CTA `Commencer` vers `/register`.
- Se met à jour en direct à chaque changement des sliders/sélecteur, l'état du calculateur devant donc remonter au niveau du composant `Pricing` (pas local à la section).
- N'apparaît que sur la page Pricing (pas de fuite vers le reste de l'app).

## i18n

Nouvelles clés dans `fr.json`/`en.json` (namespace `pricing`) : titre/sous-titre de la section calculateur, labels des sliders (sièges/stockage), mention "invités/clients toujours illimités", texte de la barre fixe, note "2 inclus" du tableau comparatif (valeur commune remplaçant `pricing.upTo5`/`pricing.unlimited` sur la ligne membres), libellé de la nouvelle ligne "Invités / clients". Aucun texte hard-codé — tout passe par `t()`.

## Hors scope

- Pas de vrai flux de facturation/paiement (le CTA reste un lien vers `/register`, cohérent avec le reste de la page qui n'a pas de backend de paiement actif).
- Pas de changement au plafond du plan Gratuit à 2 membres d'équipe (pas de surplus payant, absent du calculateur) — seul le nombre inclus change (5 → 2) par rapport à l'affichage actuel.
- Pas de changement à la section Auto-hébergement (licence unique + abonnement mises à jour), qui reste indépendante de ce modèle par sièges.
- Le tableau comparatif garde sa structure globale ; la ligne `featMembers` change de valeurs et une ligne "Invités / clients" est ajoutée.
