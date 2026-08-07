# Invités manuels du calendrier Google d'un projet — design

Status: approved by user, ready for implementation planning.

## Problème

Le bouton calendrier Google d'un projet (`GoogleProjectCalendarButton`, `ProjetCalendrier.tsx`) ne peut partager le calendrier dédié du projet qu'avec les contacts client déjà liés au projet (`client_contacts` via `project_client_access`). Il n'y a aucun moyen d'inviter une adresse courriel qui n'est pas déjà un contact Rush — par exemple son propre courriel personnel (pour voir le projet dans son propre Google Calendar), ou une adresse alternative qu'un client préfère utiliser pour ses invitations calendrier plutôt que l'adresse liée à son compte Rush.

Voir aussi `docs/superpowers/specs/2026-07-16-project-google-calendars-design.md` (le design d'origine de cette fonctionnalité) pour l'architecture de base sur laquelle ce chantier s'appuie.

## Objectifs

- Depuis le menu du bouton calendrier d'un projet, pouvoir ajouter n'importe quelle adresse courriel comme invité du calendrier Google dédié — sans exiger que ce soit un contact client existant.
- Le bouton calendrier reste disponible même pour un projet sans client (déjà livré séparément, voir commit `df74371`) — les courriels manuels sont le principal moyen de partager le calendrier d'un projet personnel.
- Un courriel ajouté suit exactement le même cycle que les contacts client actuels : ajouté à la liste avec le statut "En attente", envoyé uniquement au clic sur "Partager".
- Retirer un invité (contact client ou courriel manuel) révoque son accès Google Calendar immédiatement, qu'il ait accepté l'invitation ou non.
- Un courriel manuel est propre à un seul projet — pas de liste réutilisable partagée entre projets dans cette première version.

## Non-goals (hors scope pour ce chantier)

- Lier un courriel manuel à une identité (nom, compte Rush) — seule l'adresse est stockée, comme pour un simple champ texte.
- Liste de courriels réutilisable entre projets (ex. carnet d'adresses personnel) — chaque projet a sa propre liste, à ajouter à nouveau si besoin ailleurs.
- Détecter/fusionner automatiquement un courriel manuel qui correspondrait à un contact client existant sous une autre forme — la validation se limite à un blocage de doublon texte exact (voir Edge cases).
- Notifier l'utilisateur par un canal Rush (in-app/email Resend) quand un courriel manuel est ajouté ou retiré — seule l'invitation Google Calendar native s'applique, comme pour les contacts client aujourd'hui.

## Modèle de données

Nouvelle colonne sur la table existante `project_google_calendars` (migration additive, pas de nouvelle table) :

```sql
alter table project_google_calendars
  add column extra_invitees text[] not null default '{}';
```

`extra_invitees` suit le même rôle que `shared_contact_ids`, mais stocke des adresses courriel brutes au lieu d'ids de `client_contacts`. Les deux colonnes évoluent indépendamment : retirer un contact client de `shared_contact_ids` n'affecte jamais `extra_invitees`, et inversement.

## Interface

Dans le menu déroulant du bouton calendrier (`GoogleProjectCalendarButton`, `ProjetCalendrier.tsx:454`) :

- La liste d'invités affiche désormais **contacts client + courriels manuels** ensemble, chacun avec son badge Partagé/En attente existant (`c.shared ? 'Partagé' : 'En attente'`) et une icône ✕ pour le retirer.
- Un champ texte "+ Ajouter un courriel" est ajouté sous la liste (visible dès que le calendrier est actif, même sans contact client). Valide le format email côté client avant d'activer le bouton d'ajout ; bloque si le courriel est déjà présent (contact existant ou déjà dans `extra_invitees`) avec un message inline.
- Le bouton "Partager" (`gcalProjectShareAction`) reste inchangé dans son déclenchement — il s'active dès qu'il existe un contact **ou** un courriel manuel non partagé (`contacts.some(c => !c.shared) || extraInvitees.some(e => !e.shared)`), et partage les deux listes en un seul appel.

## Backend

Réutilise entièrement `shareGoogleCalendar`/`unshareGoogleCalendar` (déjà utilisés pour les contacts, `app/api/google-calendar-project.ts`) — un courriel manuel est partagé/révoqué exactement de la même façon qu'un contact, Google Calendar ne fait aucune distinction.

- **`sync-access`** (partage) : étendu pour diffuser `extra_invitees` en plus de `shared_contact_ids` — même logique de diff (comparer l'état actuel vs la liste stockée), juste appliquée à une seconde colonne.
- **Nouvelle action `add-extra-invitee`** : `{ action: 'add-extra-invitee', studioId, projectId, email }` — ajoute `email` à `extra_invitees` (pas d'appel Google ici, juste la colonne ; l'invitation part au prochain `sync-access`).
- **Nouvelle action `remove-extra-invitee`** : `{ action: 'remove-extra-invitee', studioId, projectId, email }` — retire `email` de `extra_invitees` ET appelle `unshareGoogleCalendar` immédiatement si cette adresse avait déjà été partagée (même règle que retirer un contact client aujourd'hui).
- **`status`** (lecture) : la réponse inclut `extra_invitees` sous la même forme que `contacts` (`{ email, shared }`), pour que le front les rende ensemble sans logique spéciale.

## Edge cases

- **Doublon** : ajouter un courriel déjà présent dans `extra_invitees` OU correspondant à l'email d'un contact client existant est bloqué côté client (message inline), pas d'appel API.
- **Retirer un courriel jamais partagé** (encore "En attente") : retire simplement de `extra_invitees`, aucun appel Google (rien à révoquer).
- **Calendrier désactivé puis réactivé** : suit exactement la règle déjà en place pour `shared_contact_ids`. Une réactivation normale (le calendrier Google existant est toujours joignable) conserve `extra_invitees` tel quel — reactivate ne touche que `active`. Seule la branche "calendrier introuvable, recréé sous le compte Google actuellement connecté" (`google-calendar-project.ts:218-231`) réinitialise la colonne à `[]`, en même temps que `shared_contact_ids` — un nouveau calendrier Google n'a plus aucun accès existant, peu importe la source (contact ou manuel).
- **Email invalide** : validation format basique (regex simple) côté client avant d'activer le bouton d'ajout ; le backend ne revalide pas le format (même niveau de confiance qu'un contact client existant, dont l'email est déjà supposé valide).
