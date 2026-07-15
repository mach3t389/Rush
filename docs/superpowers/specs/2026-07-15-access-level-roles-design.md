# Étape A — Niveaux d'accès structurés (fondation du système de rôles)

**Date :** 2026-07-15
**Contexte :** premier chantier d'un plan à quatre étapes (voir la section « Suite du chantier » en bas) visant à donner à Rush une vraie vue client (dashboard multi-projets, accès restreint) et une bascule admin pour prévisualiser l'app comme n'importe quel type d'usager. Cette étape ne touche que les **membres internes du studio** — les clients restent hors scope (étape B).

## Problème actuel

Le champ `role` de `studio_members` (et de `AuthUser`) sert à deux choses en même temps :
1. Le **titre affiché** dans l'UI (`"Dir. créative"`, `"Chef de projet"`, texte libre choisi par l'utilisateur).
2. La **vérification d'admin**, faite un peu partout dans le code en comparant ce texte littéralement à `'Admin'` (ex. `Parametres.tsx:2464` : `isAdmin={me.role === 'Admin'}`).

Conséquences concrètes :
- Renommer son titre (« Admin » → « Fondateur ») casse silencieusement les vérifications de permission qui en dépendent.
- `app/src/data/authStore.ts:49` (`mapSupabaseUser`) donne `role: 'Admin'` à **tout** utilisateur réel connecté (propriétaire du studio ou simple membre invité) — ce champ ne reflète jamais le vrai rôle Supabase (`studio_members.role`) de la personne. Un code qui ferait `getCurrentUser().role === 'Admin'` obtiendrait toujours `true`, peu importe qui est connecté — un piège pour du futur code de sécurité.
- `Parametres.tsx:1959` a un vestige de code démo — `const me = USERS.lea` — codé en dur même en session réelle, plutôt que d'utiliser l'utilisateur courant réel. La vérification `isAdmin` citée plus haut hérite donc de ce bug.
- `isTeamOwner()` (booléen unique) est la seule distinction structurelle qui existe aujourd'hui — pas de notion de « admin sans être propriétaire ».

## Ce que cette étape livre

Un champ **`accessLevel`** structuré (`'owner' | 'admin' | 'member'`), distinct du titre affiché, qui devient la seule source de vérité pour les vérifications de permission des membres du studio.

### Modèle de données (Supabase)

- Nouvelle colonne `studio_members.access_level` (`text`, contrainte `check (access_level in ('owner','admin','member'))`, `not null default 'member'`).
- Nouvelle colonne `studio_invitations.access_level` (même contrainte, mais **sans** `'owner'` autorisé — une invitation ne peut jamais accorder le niveau propriétaire, puisqu'il n'y en a qu'un par studio).
- `studio_members.is_owner` (booléen) **reste tel quel** — c'est déjà la source de vérité pour la contrainte d'unicité du propriétaire (voir `2026-07-14-studios-owner-uniqueness-fix-migration.sql`). `access_level = 'owner'` doit toujours être cohérent avec `is_owner = true`, mais on ne remplace pas ce mécanisme existant, on l'étend.
- Backfill des lignes existantes (dans la même migration) :
  - `is_owner = true` → `access_level = 'owner'`
  - sinon, `role ilike 'Admin'` → `access_level = 'admin'`
  - sinon → `access_level = 'member'` (défaut)
- `accept_studio_invitation` (fonction RPC `security definer`) mise à jour pour copier `inv.access_level` (défaut `'member'` si `null`) dans la nouvelle ligne `studio_members`, `is_owner` restant toujours `false` pour une acceptation d'invitation.
- ⚠️ Comme pour toute nouvelle policy RLS touchant ces colonnes : ne pas oublier le `grant ... to authenticated` correspondant (erreur commise 2 fois par le passé sur ce projet).
- Le fichier de migration sera livré comme d'habitude sous `docs/superpowers/specs/*-migration.sql`, à exécuter manuellement dans Supabase → SQL Editor (aucune application automatique dans ce projet).

### Modèle de données (TypeScript / frontend)

- Nouveau type `AccessLevel = 'owner' | 'admin' | 'member'` (emplacement suggéré : `app/src/data/teamStore.ts`, réexporté si besoin ailleurs).
- `TeamMemberInfo` (dans `teamStore.ts`) gagne un champ `accessLevel: AccessLevel`.
- Nouvelle fonction `getMyAccessLevel(): AccessLevel` dans `teamStore.ts` :
  - Session démo : dérivée des `USERS` mock (Léa = `'owner'`, les autres = `'member'`, cohérent avec `isTeamOwner()` actuel).
  - Session réelle : lookup de `findTeamMember(getCurrentUser().id)?.accessLevel`, avec repli sur `'member'` (le niveau le plus restrictif) tant que le fetch initial n'est pas terminé, pour ne jamais flasher une UI trop permissive pendant le chargement.
- `isTeamOwner()` reste inchangé dans son comportement (équivalent à `accessLevel === 'owner'`), mais peut être ré-implémenté en termes du nouveau champ en interne.
- **`AuthUser.role` (authStore.ts) reste un champ d'affichage uniquement** — aucune vérification de permission ne doit plus jamais le lire. Le bug de `mapSupabaseUser` (hardcode `'Admin'`) n'est pas corrigé dans le cadre de cette étape (il concerne l'affichage du titre, pas la sécurité) — mais devient inoffensif puisque plus aucun code de permission ne s'y fie après cette étape.

### Nettoyage des vérifications existantes

Tous les sites qui comparent actuellement `role === 'Admin'` (ou équivalent) pour une décision de permission sont audités et migrés vers `getMyAccessLevel() !== 'member'` (ou la vérification plus précise appropriée). Ça inclut au minimum :
- `Parametres.tsx:2464` (`isAdmin` passé à `ProfileEditPanel`) — et par la même occasion, correction du `const me = USERS.lea` hardcodé (ligne 1959) pour utiliser le vrai utilisateur courant.
- Tout autre site trouvé par grep sur `role === 'Admin'` / `.role === 'Admin'` lors de l'implémentation.

La liste exhaustive des sites à modifier sera établie au moment du plan d'implémentation (recherche exhaustive dans le code, pas dans cette spec).

### Règles d'accès entre les trois niveaux

- **Propriétaire** et **Admin** : accès complet à toutes les fonctionnalités du studio (équivalent à ce que « Admin » permet aujourd'hui).
- **Membre** : accès limité, gouverné par le tableau `permissions?: string[]` déjà existant sur `studio_members` (`manage_clients`, `view_invoices`, etc.) — ce système de permissions granulaires n'est **pas modifié** par cette étape.
- Un seul Propriétaire par studio (déjà garanti en base). Le Propriétaire peut promouvoir un Membre en Admin ou rétrograder un Admin en Membre. Le transfert de propriété (changer qui est Propriétaire) reste hors scope — fonctionnalité future séparée si jamais demandée.

### UI

Dans l'écran de gestion d'équipe (section « team » de `Parametres.tsx` / `MonEquipe.tsx`), le champ titre actuel reste tel quel, et un nouveau menu déroulant **« Niveau d'accès »** apparaît à côté (options : Admin / Membre — « Propriétaire » n'est jamais sélectionnable manuellement, il est attribué automatiquement à la création du studio). Le formulaire d'invitation (`createInvitation`) gagne le même sélecteur.

## Hors scope (rappel)

- Le rôle « Client » et tout ce qui touche à l'authentification/l'accès des clients invités (étape B).
- La correction de la protection manquante sur `/admin/studios` (aucune vérification de rôle côté route) — problème réel repéré en marge de ce chantier, mais indépendant. À traiter séparément si souhaité.
- Le transfert de propriété du studio.
- Toute modification au système de permissions granulaires (`permissions: string[]`) déjà en place pour les Membres.

## Suite du chantier (pour mémoire, pas dans le scope de cette spec)

- **Étape B** — Comptes clients réels (email/mot de passe) + règles RLS pour qu'un client ne puisse techniquement voir que ses projets/organisation assignés.
- **Étape C** — Dashboard client multi-projets (nouvelle vue, scope client).
- **Étape D** — Sélecteur admin pour prévisualiser l'app comme n'importe quel usager (client ou membre à permissions limitées), en s'appuyant sur `accessLevel` (cette étape) et sur le futur système client (étape B).
