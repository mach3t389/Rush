# Chantier C1 — Portail self-service Stripe (design)

Date : 2026-07-13
Statut : approuvé pour planification

## Contexte

Chantier C (décomposé en 3 sous-chantiers indépendants pendant le brainstorming : C1 portail self-service, C2 codes promo, C3 octroi manuel d'accès) a été identifié dès la planification initiale du système de facturation, explicitement différé après les chantiers A (plomberie Stripe de base) et B (restriction des fonctionnalités par plan), tous deux livrés et vérifiés en direct.

Ce document couvre uniquement **C1** : aujourd'hui, un client abonné (Studio/Agence) n'a aucun moyen de changer sa carte de paiement, consulter ses vraies factures, ou annuler son abonnement lui-même — il faudrait contacter le studio manuellement pour toute demande de ce genre. Le sous-onglet "Historique des paiements" existant dans Paramètres → Plan affiche d'ailleurs des factures fictives (`MOCK_INVOICES`), jamais connectées à Stripe.

## Décisions prises pendant le brainstorming

- Utiliser le **portail hébergé par Stripe** (Stripe Customer Portal) plutôt qu'une interface maison — beaucoup moins de travail, maintenu par Stripe, fiable.
- Actions activées dans le portail : mise à jour de la carte, consultation/téléchargement des factures, annulation de l'abonnement. **Pas** de changement de plan/sièges/stockage dans le portail — ça reste géré exclusivement dans Paramètres → Plan (chantier A), pour éviter deux chemins différents vers la même action.
- Le sous-onglet "Historique des paiements" (données fictives) est **retiré** et remplacé par le bouton d'accès au portail.
- Une annulation via le portail garde l'accès au plan payant jusqu'à la fin de la période déjà payée (comportement standard Stripe `cancel_at_period_end`), puis le studio retombe automatiquement sur Gratuit à l'échéance.

## Architecture

### 1. `app/api/create-portal-session.ts` (nouveau)

Fonction serverless Vercel, calquée sur `app/api/create-checkout-session.ts` (chantier A) :

- Même garde d'authentification : header `Authorization: Bearer <token>`, validation via `supabaseAdmin.auth.getUser(token)`, puis vérification d'appartenance au studio via `studio_members`.
- Récupère `studios.stripe_customer_id` pour le studio concerné (erreur 400 si absent — un studio sans `stripe_customer_id` n'a jamais eu d'abonnement payant, donc rien à gérer).
- Appelle `stripe.billingPortal.sessions.create({ customer: stripe_customer_id, return_url })` et renvoie l'URL de session au frontend.
- `return_url` pointe vers `/parametres?section=plan` (réutilise le paramètre `?section=` ajouté au chantier B).

### 2. Aucun changement au webhook existant

`app/api/stripe-webhook.ts` (chantier A) gère déjà `customer.subscription.deleted`, qui remet le studio sur `plan: 'gratuit'`, `subscription_status: 'canceled'`, `stripe_subscription_id: null`, `billing_seats: 2`, `billing_storage_tier: 0`. Ce handler existant couvre exactement le cas d'une annulation initiée depuis le portail — rien à modifier.

Le comportement "garde l'accès jusqu'à la fin de la période" est géré nativement par Stripe (`cancel_at_period_end`) : le webhook `customer.subscription.updated` continue de synchroniser le studio normalement pendant cette période (toujours actif), et `customer.subscription.deleted` ne se déclenche qu'à l'échéance réelle. Aucune UI supplémentaire n'est construite dans ce chantier pour afficher "votre abonnement se termine le X" dans Rush — le portail Stripe lui-même communique déjà cette information au client pendant l'annulation. Hors scope explicite (voir plus bas).

### 3. `app/src/screens/Parametres.tsx` (modifier)

Dans `PlanSettings()` :

- Retirer le sous-onglet "Historique des paiements" et sa section (`MOCK_INVOICES`, le tableau de factures fictives, et le sélecteur de sous-onglets `planSubTab` devient inutile si un seul onglet reste — simplifier en retirant le système de sous-onglets entièrement et en remettant le contenu "Abonnement" comme unique vue).
- Ajouter un bouton **"Gérer mon abonnement"** (nouvelle icône, ex. `external-link` ou `credit-card`), visible uniquement si `hasActiveSubscription` est vrai (état déjà présent dans le composant depuis le chantier A). Au clic : appelle `/api/create-portal-session`, redirige `window.location.href` vers l'URL retournée.
- Si `hasActiveSubscription` est faux (Gratuit) : ne pas afficher le bouton du tout (pas de message "aucun abonnement" — le reste de la page explique déjà clairement l'état du plan).

### 4. Étape manuelle (comme au chantier A)

Dans Stripe Dashboard → Settings → Billing → Customer Portal :

- Activer le portail.
- Cocher : mise à jour du moyen de paiement, historique des factures, annulation d'abonnement.
- Décocher : changement de plan/quantité (pour éviter le chemin parallèle mentionné plus haut).
- Définir la politique d'annulation sur "à la fin de la période de facturation" (`cancel_at_period_end`).

## Edge cases

- **Studio sans `stripe_customer_id`** (jamais eu d'abonnement payant, toujours Gratuit) : le bouton n'apparaît pas côté UI (`hasActiveSubscription` false), donc ce cas n'est normalement jamais atteint ; si atteint quand même (état incohérent), l'endpoint renvoie une erreur 400 explicite plutôt qu'un crash Stripe.
- **Retour du portail après annulation** : l'utilisateur revient sur `/parametres?section=plan` avec son plan encore affiché comme actif (puisque l'annulation ne prend effet qu'à l'échéance) — c'est le comportement correct et attendu, pas un bug.
- **Retour du portail après simple mise à jour de carte** (pas d'annulation) : rien ne change côté Rush, comportement normal.

## Hors scope (explicitement)

- Afficher "votre abonnement se termine le X" dans l'interface Rush elle-même (le portail Stripe communique déjà cette info pendant l'annulation).
- Changement de plan/sièges/stockage depuis le portail (reste dans Paramètres → Plan, chantier A).
- Chantier C2 (codes promo) et C3 (octroi manuel d'accès) — sous-chantiers séparés, à planifier individuellement.
