# Chantier C3 — Octroi manuel d'accès (design)

Date : 2026-07-13
Statut : approuvé pour planification

## Contexte

Chantier C (décomposé en 3 sous-chantiers indépendants pendant le brainstorming initial : C1 portail self-service — livré, C2 codes promo — non commencé, C3 octroi manuel d'accès) a été identifié dès la planification initiale du système de facturation.

Ce document couvre **C3** : aujourd'hui, il n'existe aucun moyen pour l'admin (Alexis, propriétaire du produit Rush) de donner un accès payant gratuitement à un studio précis (partenaire, bêta-testeur) sans passer par une vraie transaction Stripe. Rush n'a par ailleurs aucun concept de "super-admin" — chaque compte n'a accès qu'à son propre studio via `studio_members`.

## Décisions prises pendant le brainstorming

- Construire une **petite page admin** dans Rush (pas juste une requête SQL manuelle) — recherche d'un studio par nom, changement de son plan, avec une note libre.
- **Identification admin** : vérification de l'adresse courriel exacte d'Alexis, côté client (pour l'UI) ET côté serveur (pour l'endpoint — impossible à contourner en modifiant le code du navigateur). Pas de système de rôles/permissions généralisé — solution volontairement minimale, adaptée à un seul admin.
- **Pas d'expiration automatique** — l'admin retire l'accès manuellement plus tard depuis la même page. Pas de tâche planifiée (cron) à construire.
- **Une note libre optionnelle** par octroi (ex. "Partenaire X — bêta gratuite"), pour se souvenir plus tard pourquoi un studio a un accès gratuit.
- Un octroi manuel ne touche **jamais** `stripe_customer_id`/`stripe_subscription_id` — uniquement `studios.plan` (et la note). Ça garantit qu'aucun webhook Stripe existant ne peut jamais écraser ou être écrasé par un octroi manuel, puisque le webhook n'agit que sur des événements liés à un vrai `stripe_subscription_id`.
- Cas limite accepté sans garde-fou spécial : si un studio a déjà un vrai abonnement Stripe payant ET reçoit un octroi manuel, le plan affiché change immédiatement mais un futur événement Stripe (ex. renouvellement) resynchronisera le plan réel — jugé un risque négligeable (scénario peu probable en pratique).

## Architecture

### 1. Migration Supabase (manuelle)

```sql
alter table studios
  add column if not exists manual_grant_note text;
```

Aucune contrainte RLS additionnelle nécessaire : cette colonne est écrite exclusivement via le service role côté serveur (jamais directement par le client), donc elle suit le même modèle que les colonnes de facturation existantes (`plan`, `billing_seats`, etc., déjà verrouillées en écriture côté `authenticated` depuis le chantier A).

### 2. `app/api/admin-set-plan.ts` (nouveau)

Fonction serverless Vercel :

- Body attendu : `{ studioId: string; plan: 'gratuit' | 'studio' | 'agence'; note?: string }`.
- Authentification : header `Authorization: Bearer <token>`, validation via `supabaseAdmin.auth.getUser(token)` (401 si invalide).
- **Vérification admin** : `user.email === ADMIN_EMAIL` (constante définie dans le fichier, valeur = l'adresse courriel d'Alexis) — 403 si l'email ne correspond pas. C'est la seule autorisation nécessaire ; pas de vérification `studio_members` ici puisque l'admin agit sur n'importe quel studio, pas seulement le sien.
- Met à jour `studios.plan` et `studios.manual_grant_note` (si fourni) pour le `studioId` ciblé, via le client Supabase service role (bypass RLS, légitime ici).
- Ne touche jamais `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `billing_seats`, `billing_storage_tier` — un octroi manuel ne change que le plan affiché/appliqué, laissant les sièges/stockage à leurs valeurs par défaut existantes (déjà gérées ailleurs).

### 3. `app/api/admin-search-studios.ts` (nouveau)

Fonction serverless Vercel :

- Body attendu : `{ query: string }`.
- Même vérification admin que ci-dessus (Bearer token + email).
- Recherche `studios` où `name ilike '%query%'` (recherche insensible à la casse, correspondance partielle), retourne au maximum 20 résultats : `{ id, name, plan, manual_grant_note }`.

### 4. `app/src/screens/AdminStudios.tsx` (nouveau)

Nouvelle route `/admin/studios`, ajoutée à `app/src/main.tsx` comme route de premier niveau (pas sous `AppShell` — elle n'appartient à aucun studio particulier). Structure :

- Au montage, vérifie `getCurrentUser()?.email === ADMIN_EMAIL` (même constante que côté serveur, dupliquée côté client pour l'UI uniquement — le vrai contrôle d'accès reste server-side). Si ça ne correspond pas, affiche un message "Accès refusé" simple (pas de redirection agressive, juste un message).
- Un champ de recherche (nom de studio) qui appelle `/api/admin-search-studios` à la frappe (avec un debounce simple) et affiche les résultats sous forme de liste.
- Cliquer sur un studio affiche son plan actuel, sa note existante (si présente), un menu déroulant pour choisir le nouveau plan, un champ texte pour la note, et un bouton "Appliquer" qui appelle `/api/admin-set-plan`.
- Cette page n'apparaît dans aucun menu de navigation — accessible uniquement en connaissant l'URL directe.

## Data flow

```
Alexis (connecté) → /admin/studios
  → recherche "Studio XYZ" → POST /api/admin-search-studios { query }
    → vérif email admin → SELECT studios WHERE name ilike ... → résultats
  → sélectionne le studio, choisit "Studio", note "Partenaire beta"
  → POST /api/admin-set-plan { studioId, plan: 'studio', note: 'Partenaire beta' }
    → vérif email admin → UPDATE studios SET plan='studio', manual_grant_note='Partenaire beta' WHERE id=studioId
  → le studio ciblé voit immédiatement son plan changé (planStore.ts le relit au prochain accès/rechargement)
```

## Edge cases

- **Studio déjà sur un vrai abonnement Stripe payant** : voir décision ci-dessus — accepté sans garde-fou, cas jugé improbable.
- **Recherche sans résultat** : afficher simplement "Aucun studio trouvé" — pas de création de studio depuis cette page (hors scope, un studio se crée uniquement via l'inscription normale).
- **Retirer un accès manuel** : se fait en revenant sur la page et en choisissant "Gratuit" comme nouveau plan — pas d'action "retirer" dédiée, le changement de plan suffit.

## Hors scope (explicitement)

- Chantier C2 (codes promo) — sous-chantier séparé, non planifié ici.
- Système de rôles/permissions généralisé (multi-admin) — solution actuelle volontairement liée à une seule adresse courriel.
- Expiration automatique / tâche planifiée.
- Historique/audit log des octrois passés (seule la note la plus récente est conservée, pas un historique complet des changements).
