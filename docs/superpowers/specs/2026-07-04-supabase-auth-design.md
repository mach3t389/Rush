# Authentification réelle avec Supabase (Phase 1 du backend)

## Contexte

Rush est actuellement une SPA 100% frontend : toutes les données (projets, tâches, clients, ressources) vivent en mock (`app/src/data/mock.ts`) et en `localStorage`, sans backend ni base de données réelle. L'authentification (`app/src/data/authStore.ts`) est un mock complet : mots de passe stockés en clair dans `localStorage`, comptes démo où n'importe quel mot de passe est accepté.

Après avoir livré les 6 chantiers frontend demandés (voir mémoire projet `audit-roadmap`), l'utilisateur a décidé de commencer le backend. Décision d'architecture prise (voir mémoire `backend-architecture-decision`) : **Supabase** pour la base de données/authentification/temps réel, **Cloudflare R2** pour le stockage de fichiers vidéo, **Stripe** pour la facturation. Ce document couvre uniquement la **première phase : l'authentification**, isolée des autres préoccupations.

## Objectif

Remplacer l'authentification mock par une vraie authentification Supabase, **sans toucher aux données de l'app** (projets/tâches/clients restent en mock/localStorage pour l'instant — c'est un chantier volontairement isolé).

## Portée

**Inclus :**
- Vraie inscription (création de compte réel dans Supabase Auth)
- Vraie connexion (email + mot de passe, vérifié côté serveur)
- Vraie déconnexion
- Vraie récupération de mot de passe (courriel envoyé par Supabase)
- Gestion de session réelle (persistée par Supabase, pas par un simple flag `localStorage`)

**Explicitement hors scope (chantiers futurs séparés) :**
- Migration des données (projets, tâches, clients) vers une vraie base de données
- Création d'un enregistrement "studio/organisation" réel dans Supabase
- Connexion OAuth (Google, etc.) — email/mot de passe seulement pour cette phase
- Stockage de fichiers réel (Cloudflare R2)
- Facturation (Stripe)

## Conception

### Deux chemins de connexion en parallèle (pendant la transition)

1. **Comptes démo** (Léa Marchand, Sarah Martin, Thomas Robert) — restent exactement comme aujourd'hui : un bouton de connexion instantanée côté client, sans passer par Supabase. Raison : tout le contenu mock de l'app (tâches, commentaires assignés, avatars) est actuellement lié à ces 3 utilisateurs précis dans `mock.ts`. Les migrer vers de vrais comptes Supabase n'aurait de sens qu'une fois les données elles-mêmes migrées (une phase future), pas avant — ça créerait un décalage entre "qui est connecté" et "à qui appartiennent les données mock".

2. **Vraies inscriptions/connexions** (formulaire email + mot de passe sur `/register` et `/login`) — passent désormais réellement par Supabase Auth. Un vrai mot de passe est vérifié côté serveur, une vraie session est émise et gérée par Supabase (rafraîchissement automatique du jeton), plus aucun mot de passe en clair dans le navigateur.

### Composants touchés

- **`app/src/data/authStore.ts`** — la logique interne de `login()`, `register()`, `logout()`, `isAuthenticated()`, `getCurrentUser()` est remplacée par des appels au client Supabase (`supabase.auth.signInWithPassword`, `supabase.auth.signUp`, `supabase.auth.signOut`, `supabase.auth.getSession`), mais les noms de fonctions exportées restent identiques — aucun autre fichier de l'app qui les consomme déjà n'a besoin de changer.
- **`app/src/main.tsx`** — `authLoader`/`guestLoader` (actuellement des fonctions synchrones vérifiant un flag `localStorage`) deviennent asynchrones, puisque vérifier une session Supabase est une opération asynchrone. React Router v7 (déjà en place) supporte nativement les loaders asynchrones — changement purement technique, pas de nouvelle dépendance.
- **`app/src/screens/ForgotPassword.tsx`** — branché sur le vrai flux d'envoi de courriel de réinitialisation de mot de passe de Supabase (actuellement un formulaire qui ne fait rien de réel).
- **Nouvelle configuration** — l'URL du projet Supabase et sa clé publique ("anon key") doivent être ajoutées comme variables d'environnement Vite (`import.meta.env.VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Ces valeurs sont sûres à exposer côté client — c'est le fonctionnement normal du SDK Supabase, la sécurité réelle repose sur les règles d'accès aux données côté serveur, pas sur le secret de ces valeurs.

### Comptes déjà inscrits en mock

Les entrées existantes dans `localStorage` (`sf_registered_users`, créées via le formulaire d'inscription mock avant ce chantier) sont ignorées, pas migrées. L'app n'a pas encore de vrais utilisateurs en production — on repart à neuf avec Supabase pour toute nouvelle inscription réelle à partir de maintenant.

## Hors scope

- Migration de données (projets/tâches/clients) — chantier futur séparé
- Enregistrement "studio/organisation" réel en base de données — chantier futur séparé
- Connexion OAuth (Google, etc.)
- Stockage de fichiers (Cloudflare R2) et facturation (Stripe) — chantiers futurs séparés, voir mémoire `backend-architecture-decision`

## Tests / vérification

Pas de suite de tests automatisés dans ce projet (vérification via le serveur de preview). Vérification manuelle prévue après implémentation :
1. Inscription d'un nouveau compte réel via `/register` → confirmer qu'un utilisateur apparaît dans le tableau de bord Supabase Auth.
2. Connexion avec ce compte via `/login` → confirmer l'accès à l'app.
3. Déconnexion → confirmer le retour à `/login`.
4. Tentative de connexion avec un mauvais mot de passe → confirmer le message d'erreur.
5. Demande de réinitialisation de mot de passe → confirmer la réception d'un vrai courriel.
6. Rechargement de la page après connexion réelle → confirmer que la session persiste (pas de déconnexion involontaire).
7. Connexion via les 3 boutons de compte démo → confirmer qu'ils fonctionnent exactement comme avant (comportement inchangé, ne passe pas par Supabase).
