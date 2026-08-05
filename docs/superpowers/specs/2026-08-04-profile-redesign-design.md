# Refonte du panneau Profil — design

**Date:** 2026-08-04
**Status:** approuvé par l'utilisateur, prêt pour le plan d'implémentation

## Problème

Le panneau "Mon profil" (`ProfileEditPanel.tsx`) a quatre défauts distincts, remontés par l'utilisateur :

1. **Format** — c'est un tiroir qui sort de la droite de l'écran, alors que le reste de l'app utilise des fenêtres flottantes centrées pour ce type d'édition (voir le panneau détail d'une tâche).
2. **Bug d'initiales** — les initiales affichées dans "Mes tâches" ne correspondent pas à celles du profil. Cause exacte : le nom peut être modifié à trois endroits (édition de profil, acceptation d'invitation, cache de session) et un seul recalcule les initiales correctement, mais ne les sauvegarde jamais ; les deux autres n'en tiennent pas compte du tout.
3. **Photo de profil ignorée ailleurs** — la photo de profil n'apparaît que dans le panneau lui-même. Tous les autres avatars de l'app (`SFAvatar`/`SFAvatarGroup`, utilisés pour les tâches, l'équipe, les observateurs, etc.) n'acceptent même pas de photo en entrée — ils affichent toujours les initiales.
4. **Confusion compte vs organisation** — le formulaire actuel mélange des champs propres à une organisation (nom affiché, rôle, téléphone) avec des champs qui devraient être uniques et globaux (courriel, mot de passe). Il n'y a aujourd'hui aucune façon de changer son mot de passe ou de supprimer son compte depuis l'app.

## Portée confirmée avec l'utilisateur

- Nom affiché, rôle, téléphone, **et maintenant aussi la photo** restent propres à chaque organisation (c'est déjà la structure actuelle de `studio_members` — aucun changement de schéma nécessaire pour ça).
- Courriel et mot de passe deviennent des attributs de **compte** (uniques, gérés à un seul endroit), pas de la fiche par organisation.
- Le courriel peut être changé depuis la section Compte, via le mécanisme de confirmation par courriel de Supabase — mais jamais modifiable pendant l'acceptation d'une invitation (l'invitation cible un courriel précis).
- Suppression de compte : bloquée si la personne est seule propriétaire (`owner`) d'une organisation qui a d'autres membres — message explicite invitant à transférer la propriété d'abord.
- Quand une photo de profil existe pour l'organisation active, elle remplace les initiales **partout** où un avatar de cette personne est affiché dans l'app.

## Architecture

### 1. Panneau flottant

`ProfileEditPanel` change de conteneur : au lieu de sa `<div position:fixed>` custom en tiroir, il utilise `SFModal` (`app/src/components/ui/SFModal.tsx`), déjà standard dans l'app. Largeur ~480px, hauteur limitée avec scroll interne (comme aujourd'hui), mais centré avec fond assombri au lieu d'ancré à droite. Les onglets (Info / Permissions) et le contenu de chaque onglet ne changent pas de structure interne, seulement de conteneur.

Nouvel onglet **Compte** (visible seulement si `isSelf` — on ne gère jamais le compte de quelqu'un d'autre depuis ce panneau) :
- Courriel actuel (lecture seule) + bouton "Changer d'adresse courriel"
- Bouton "Changer le mot de passe"
- Bouton "Supprimer mon compte" (zone à part, style danger)

### 2. Correction des initiales — recalcul à la source, jamais stocké de manière autonome

Fonction utilitaire partagée `computeInitials(name: string): string` (déjà l'algorithme correct existant dans `ProfileEditPanel.tsx:226` et `authStore.ts:43` — extraite dans un module commun, ex. `app/src/utils/initials.ts`, pour éviter la troisième implémentation divergente).

Points d'écriture corrigés pour recalculer et persister les initiales à chaque changement de nom :
- `saveProfile()` (`ProfileEditPanel.tsx`) : quand `name` change, calcule les initiales et les inclut dans le patch envoyé à `updateMemberFields` (real session) ou au JSON localStorage (démo).
- `teamStore.ts` → `updateMemberFields` / `upsertSupabaseMemberFields` : accepte désormais aussi `initials` dans le patch et l'écrit dans `studio_members.initials`.
- La fonction SQL `accept_studio_invitation` (spec `2026-07-15-access-level-migration.sql`) calcule aujourd'hui `upper(left(name, 2))` — mauvais algorithme (2 premiers caractères plutôt que 1ʳᵉ lettre de chaque mot). Nouvelle migration qui remplace cette fonction pour utiliser la même logique "première lettre de chaque mot, max 2".
- Cache de session (`authStore.ts` `getCurrentUser()`) : après une sauvegarde de profil réussie sur son propre compte (`isSelf`), on rafraîchit aussi `localStorage[AUTH_KEY]` (démo) ou on déclenche un re-fetch du membre courant (réel) pour que la barre du haut (`GlobalTopBar`) reflète les initiales/le nom à jour sans reload.

### 3. Photo affichée partout — extension de `SFAvatar`

`SFAvatar` et `SFAvatarGroup` (`app/src/components/ui/SFAvatar.tsx`) gagnent une prop optionnelle `photoUrl?: string`. Quand elle est fournie, l'avatar affiche `<img>` (object-fit cover, même arrondi) au lieu des initiales ; sinon, comportement inchangé.

Chaque site qui construit aujourd'hui un objet `{ initials, bg, name }` pour alimenter `SFAvatar`/`SFAvatarGroup` doit aussi transmettre `photoUrl` quand disponible. Sites concernés (à confirmer/compléter lors du plan) :
- `AssigneeGroup.tsx` (tâches — assignés)
- `WatchersRow.tsx` (observateurs)
- `ProjectCard.tsx` (membres du projet)
- `MonEquipe.tsx` / `Membres.tsx` (fiche équipe)
- `GlobalTopBar.tsx` (déjà géré séparément mais doit rester cohérent)

La source de la photo : `TeamMemberInfo.photoUrl` (session réelle, déjà présent dans `teamStore.ts`) ou `loadPhoto(userId)` (session démo, déjà présent dans `ProfileEditPanel.tsx`).

### 4. Flux d'invitation — collecte des infos par organisation

**Nouveau compte via invitation** (`TeamInvitationAccept.tsx`, mode `register`) : formulaire déjà correct pour le nom ; ajout de deux champs optionnels — photo (upload, comme dans `ProfileEditPanel`) et téléphone. Le rôle n'est jamais demandé ici : il est fixé par la personne qui invite (déjà saisi dans `InviteTeamModal`).

**Compte existant rejoignant une nouvelle organisation** (`TeamInvitationAccept.tsx`, branche "already logged in", fonction `acceptAsCurrentSession`) : aujourd'hui, cette branche appelle `acceptInvitation(token)` directement sans jamais montrer de formulaire. Nouveau comportement : avant de finaliser, affiche le même mini-formulaire (nom pré-rempli à partir du compte, photo optionnelle, téléphone optionnel) — parce que ces champs sont propres à cette organisation et n'existent pas encore pour elle. Le courriel n'est jamais affiché modifiable ici (déjà fixé par la session active).

Le SQL `accept_studio_invitation` doit accepter ces valeurs additionnelles (nom personnalisé le cas échéant, téléphone, photo) au lieu de les dériver uniquement de `auth.users.raw_user_meta_data`.

### 5. Section Compte — actions

**Changer le mot de passe.** Réutilise `resetPassword(email)` (déjà dans `authStore.ts`, utilisé par `ForgotPassword.tsx`) : envoie un courriel Supabase avec lien de réinitialisation. Le bouton affiche une confirmation "Courriel envoyé à {email}". Désactivé pour les sessions démo (pas de compte Supabase réel), avec message explicatif.

**Changer d'adresse courriel.** Appelle `supabase.auth.updateUser({ email: newEmail })` — mécanisme intégré à Supabase : envoie un lien de confirmation à la nouvelle adresse (et selon la configuration du projet, une notification à l'ancienne) ; le changement ne prend effet qu'après confirmation. Aucune donnée `studio_members.email` n'est plus éditable nulle part dans l'app — ce champ, s'il existe encore en base pour compat, devient un simple miroir non modifiable, jamais la source de vérité.

**Supprimer mon compte.** Nouvelle action serveur. Étant donné le plafond de 12 fonctions serverless du plan Vercel Hobby (déjà atteint — voir mémoire `vercel-hobby-plan-deploy-limits`), cette action est ajoutée comme un `action` supplémentaire sur un endpoint existant plutôt que comme un nouveau fichier `app/api/*.ts` (choix exact de l'endpoint hôte à trancher pendant le plan — candidat naturel : un endpoint déjà authentifié par jeton de session utilisateur, ex. `update-subscription.ts`, à généraliser, ou un nouveau petit routeur `account.ts` qui absorbe une fonction existante à faible usage pour rester à 12).

Logique serveur :
1. Vérifie le jeton de session (comme `update-subscription.ts` le fait déjà) pour confirmer l'identité de l'appelant.
2. Cherche toutes les lignes `studio_members` où `user_id = <appelant>` et `is_owner = true`.
3. Pour chaque organisation où il est owner : vérifie s'il existe d'autres membres (`studio_members` avec le même `studio_id`, `user_id` différent). Si oui → refuse toute la suppression avec une erreur nommée (`owner_must_transfer`), le front affiche le message explicatif et n'efface rien.
4. Si aucun blocage : supprime le compte via `supabaseAdmin.auth.admin.deleteUser(userId)` (clé service-role) — les lignes `studio_members` liées à cet utilisateur se suppriment en cascade (`on delete cascade` déjà en place sur les FK vers `auth.users` dans les migrations existantes) ; pour les organisations où il était seul propriétaire et seul membre, l'organisation elle-même (et son contenu) se retrouve orpheline — comportement acceptable ici car il n'y avait personne d'autre.

Confirmation front : dialogue à deux étapes (pas juste "OK/Annuler" — cocher "Je comprends que cette action est irréversible" ou retaper son courriel), cohérent avec les autres actions destructrices déjà dans l'app.

## Gestion des erreurs

- Formulaire d'invitation (nouveau ou existant) : les nouveaux champs (photo, téléphone) sont optionnels — aucune validation bloquante, cohérent avec le comportement actuel du profil.
- Changement de courriel : si `updateUser` échoue (ex. adresse déjà utilisée par un autre compte), message d'erreur explicite, aucun état modifié tant que la confirmation n'est pas faite.
- Suppression de compte : toute erreur serveur (dont `owner_must_transfer`) est renvoyée avec un message localisé distinct ; le compte n'est jamais partiellement supprimé (une seule opération serveur atomique du point de vue du client).
- Session démo : "Changer le mot de passe", "Changer d'adresse courriel" et "Supprimer mon compte" sont visibles mais désactivés avec une explication ("Cette action nécessite un compte réel").

## Tests (vérification manuelle — pas de suite automatisée dans ce projet)

- Modifier son nom dans le profil → vérifier que les initiales changent immédiatement dans : la barre du haut, une carte de tâche assignée, la fiche équipe.
- Ajouter une photo de profil → vérifier qu'elle apparaît sur les mêmes trois surfaces, à la place des initiales.
- Accepter une invitation avec un compte tout neuf → vérifier que les initiales calculées sont correctes (première lettre de chaque mot, pas les 2 premiers caractères) et que le nom/téléphone/photo saisis apparaissent dans la fiche équipe de la nouvelle organisation.
- Accepter une invitation à une 2ᵉ organisation avec un compte déjà existant → vérifier que le mini-formulaire apparaît, et que les infos de la 1ʳᵉ organisation restent inchangées après le changement d'organisation active.
- Demander un changement de mot de passe → vérifier la réception du courriel Supabase.
- Demander un changement de courriel → vérifier la réception du lien de confirmation à la nouvelle adresse, et que l'ancien courriel reste actif tant que non confirmé.
- Tenter de supprimer son compte en étant seul propriétaire d'une organisation avec d'autres membres → vérifier le blocage et le message.
- Supprimer un compte de test qui n'est owner nulle part (ou owner d'une organisation sans autre membre) → vérifier la suppression réelle et la déconnexion automatique qui suit.
