# Facturation Stripe — chantier A : plomberie de base

## Contexte

Rush n'a actuellement **aucune facturation réelle**. La page `Pricing.tsx` et l'onglet Facturation de `Parametres.tsx` affichent des paliers et des prix, mais tout est statique/local — il n'existe aucune colonne `plan`/`subscription_status` en base de données, aucun code Stripe, et aucune fonctionnalité n'est réellement restreinte selon le palier d'un studio (confirmé par exploration du code : `PLATFORM_PLANS` dans `Parametres.tsx` et les données de `Pricing.tsx` sont entièrement mockées).

Ce chantier (« A » d'une décomposition en trois : A = plomberie de base, B = restriction des fonctionnalités selon le palier, C = libre-service et extras) construit la fondation : base de données, catalogue Stripe, parcours de paiement, et synchronisation par webhook. B et C dépendent de ce chantier et seront brainstormés séparément.

**Décision d'hébergement associée (élargit une décision précédente Supabase + Stripe + Cloudflare R2) :** le frontend Rush sera déployé sur **Vercel** ; les deux fonctions serveur nécessaires à Stripe (création de session de paiement, réception des webhooks) vivront aussi sur Vercel comme fonctions serverless, plutôt que sur des Edge Functions Supabase — un seul déploiement, un seul endroit pour les logs. Supabase reste la base de données/authentification ; Cloudflare R2 reste le stockage de fichiers (non touché par ce chantier).

## Objectif

1. Ajouter les colonnes nécessaires à `studios` dans Supabase pour représenter un abonnement (Stripe **ou** un accès gratuit accordé manuellement).
2. Créer le catalogue de produits/prix Stripe correspondant exactement à la grille de prix actuelle de `Pricing.tsx` (paliers + sièges variables + stockage variable).
3. Construire le parcours de paiement (Stripe Checkout) déclenché depuis l'inscription **et** depuis Paramètres → Upgrade.
4. Construire le webhook qui garde Supabase synchronisé avec l'état réel de l'abonnement dans Stripe.

## Modèle de données (Supabase, table `studios`)

Nouvelles colonnes :

| Colonne | Type | Description |
|---|---|---|
| `plan` | `text` | `'gratuit'` \| `'studio'` \| `'agence'` — reflète le palier actif |
| `billing_seats` | `integer` | Nombre de sièges facturés (défaut 2, pertinent seulement pour Studio/Agence) |
| `billing_storage_tier` | `integer` | Index 0–6 dans `STORAGE_BLOCKS`/`STORAGE_TOTALS` (0 = pas d'ajout) — comme `billing_seats`, pertinent seulement pour Studio/Agence ; reste à sa valeur par défaut (0) et non utilisé pour un studio Gratuit |
| `stripe_customer_id` | `text`, nullable | Vide pour un studio Gratuit ou un accès gratuit accordé manuellement |
| `stripe_subscription_id` | `text`, nullable | Vide dans les mêmes cas |
| `subscription_status` | `text`, nullable | Reflète directement le statut Stripe (`active`, `past_due`, `canceled`, etc.) ; `null` si pas d'abonnement Stripe |

**Pourquoi `stripe_customer_id`/`stripe_subscription_id` sont nullable :** un studio peut être sur un palier payant sans jamais avoir payé via Stripe (accès gratuit accordé manuellement — mécanisme complet livré au chantier C, mais la structure de données le permet dès ce chantier-ci). Dans ce cas, `plan` est renseigné mais `stripe_*` reste `null` et `subscription_status` reste `null` — l'app traite l'absence de `stripe_subscription_id` comme « accès non géré par Stripe, ne jamais toucher automatiquement ».

Ces colonnes sont **la seule source de vérité** consultée par le reste de l'app (chantier B) — jamais modifiées directement depuis le navigateur, seulement par le webhook (voir plus bas) ou, plus tard, par un outil d'octroi manuel (chantier C).

## Catalogue Stripe

Chaque abonnement payant (Studio ou Agence) comporte jusqu'à 3 lignes (`subscription items`) :

1. **Palier de base** — quantité fixe 1. 4 Prices : Studio mensuel/annuel, Agence mensuel/annuel.
2. **Sièges additionnels** — quantité = `max(0, billing_seats - 2)`. 4 Prices : Studio mensuel/annuel (3 $/29 $), Agence mensuel/annuel (2 $/19 $). Absent de l'abonnement quand la quantité serait 0 (ligne retirée, pas mise à 0).
3. **Stockage additionnel** — quantité fixe 1, mais le Price utilisé change selon `billing_storage_tier`. 10 Prices (5 paliers payants × 2 fréquences ; le palier 0 = « 50 Go inclus, rien à ajouter » n'a pas de Price, la ligne est simplement absente).

Total : 18 Prices, valeurs exactement alignées sur `PLANS`/`STORAGE_BLOCKS` dans `app/src/screens/Pricing.tsx` (source de vérité pour les montants).

**Création scriptée, pas manuelle :** un script one-shot utilisant l'API Stripe crée les 18 Prices (et les 5 Products associés : Studio, Agence, Sièges Studio, Sièges Agence, Stockage) de façon reproductible — évite la saisie manuelle sujette aux erreurs et permet de recréer le catalogue identique en mode test et en mode production.

**Codes promo :** activés nativement sur la session de paiement (`allow_promotion_codes: true`) — aucun développement additionnel ce chantier-ci ; la création des codes eux-mêmes (chantier C) se fait directement dans le tableau de bord Stripe.

## Fonctions serveur (Vercel serverless)

### `POST /api/create-checkout-session`

- Reçoit : `studioId`, `plan` (`'studio'` | `'agence'`), `billingCycle` (`'monthly'` | `'yearly'`), `seats`, `storageTier`.
- Construit la liste des `line_items` Stripe (palier de base + siège additionnel si `seats > 2` + stockage additionnel si `storageTier > 0`), en résolvant les bons Price IDs à partir de `plan`/`billingCycle`/`storageTier`.
- Crée une Stripe Checkout Session (`mode: 'subscription'`, `allow_promotion_codes: true`, `success_url`/`cancel_url` pointant vers Rush) et retourne l'URL de paiement.
- Le studio est identifié dans les `metadata` de la session (pour que le webhook sache quel studio mettre à jour).

### `POST /api/stripe-webhook`

- Vérifie la signature Stripe (secret de webhook, jamais exposé au navigateur).
- Écoute : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- Sur chaque événement pertinent, met à jour `plan`, `billing_seats`, `billing_storage_tier`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status` du studio correspondant (retrouvé via les `metadata` de l'abonnement) directement dans Supabase.
- **Seule source qui écrit ces colonnes** — le frontend ne les modifie jamais lui-même, même après un retour réussi de Checkout (on attend/fait confiance au webhook, pas à la redirection, en cas de fermeture prématurée du navigateur).

## Parcours de paiement (frontend)

Deux points d'entrée, même flux sous-jacent :

1. **Inscription** — après avoir choisi Studio ou Agence (et ajusté sièges/stockage si désiré) dans le flux de création de compte, le nouveau studio est redirigé vers Stripe Checkout.
2. **Paramètres → Upgrade** — un studio existant sur Gratuit déclenche le même parcours depuis ses paramètres.

Dans les deux cas : appel à `/api/create-checkout-session` → redirection vers l'URL Stripe retournée → à la complétion, Stripe redirige vers une page de confirmation Rush ; le webhook (indépendamment de cette redirection) est ce qui active réellement le palier.

## Hors scope (ce chantier)

- Restreindre l'accès aux fonctionnalités selon le palier (chantier B).
- Modifier ses sièges/stockage après l'achat initial depuis l'app (portail client Stripe = chantier C ; le webhook gère déjà la synchronisation quel que soit le déclencheur du changement).
- Outil d'octroi d'accès gratuit manuel (chantier C — la structure de données le permet déjà, l'outil viendra plus tard).
- Création des codes promo eux-mêmes (chantier C — le support technique est prêt dès ce chantier).
- Déploiement effectif sur Vercel en tant que tel (configuration de projet, domaine) — traité comme un prérequis d'infrastructure à faire une fois, pas une tâche de ce plan de code.
