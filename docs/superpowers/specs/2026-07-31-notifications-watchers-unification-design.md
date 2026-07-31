# Notifications — modèle d'observateurs et uniformisation — design

## Constat

Le système de notifications actuel a deux problèmes de fond, découverts en
auditant le code (`notificationStore.ts`, `commentNotify.ts`,
`emailStore.ts`, `notifPrefsStore.ts`, et tous les points d'appel) :

**1. Les notifications ne sont pas ciblées.** En session réelle, la table
`notifications` est un flux partagé par tout le studio — chaque membre voit
toutes les notifications de commentaires, peu importe s'il est concerné par
la tâche/ressource en question, avec seulement un marqueur lu/non-lu
personnel (`notification_reads`). Il n'existe aucune notion de "cette
notification concerne telle personne précisément". C'est probablement la
source principale du bruit/spam ressenti.

**2. La couverture est incohérente selon le type d'entité.**
- Les commentaires sur une **facture** (`financeStore.addInvoiceComment`)
  ne déclenchent aucune notification, ni en-app ni courriel.
- Le courriel de "demande d'approbation" (`RequestApprovalButton.tsx`) part
  **toujours**, même si le destinataire a désactivé ce type de courriel
  dans ses préférences — contrairement à `commentNotify.ts`, qui passe
  correctement `eventKey`/`recipientUserId` pour être filtré par
  `notif_prefs`.
- Les actions du portail client (message du client, demande de correction,
  approbation d'un livrable — `Portail.tsx`) ne créent qu'une notification
  en-app, jamais de courriel.
- Sur les 6 catégories affichées dans Paramètres → Notifications
  (`comment`, `mention`, `approval`, `version`, `status`, `deadline`),
  seule `mention` est réellement câblée pour filtrer un courriel — les
  cases des 5 autres catégories ne font rien.

Ce chantier corrige les deux en même temps : le ciblage par observateurs
est le mécanisme qui permet de rendre chaque type d'entité cohérent, en une
seule passe plutôt qu'au cas par cas.

## Design retenu

### Modèle d'observateurs ("watchers")

Chaque tâche (`Task`), ressource (`Resource`) et facture (`Invoice`) gagne
un champ `watchers: string[]` (ids utilisateur du studio, + id de contact
client le cas échéant pour les factures — voir plus bas). Les
notifications futures sur cette entité ne sont envoyées (en-app + courriel)
qu'aux personnes de cette liste, plus l'auteur de l'action lui-même en est
toujours exclu (on ne se notifie pas soi-même).

**Auto-ajout — zéro effort, toujours visible et modifiable ensuite :**
- Assigner quelqu'un à une tâche → ajouté automatiquement, **dès la
  création** (pas seulement au premier commentaire).
- Commenter sur l'item → l'auteur du commentaire est ajouté automatiquement.
- Être mentionné avec `@Nom` dans un commentaire → ajouté automatiquement.
- Le créateur de l'item est ajouté automatiquement dès la création.

**Interface :** une section observateurs, affichée **près des
commentaires** (pas en haut du panneau à côté de "Assigné à"), sous forme
de bulles avec avatar/nom, avec un bouton pour en ajouter manuellement et
un `×` sur chaque bulle pour en retirer — y compris se retirer soi-même.
Cette liste est la seule source de vérité affichée : contrairement au
comportement caché d'Asana (mentionner quelqu'un une fois le fait suivre
le fil indéfiniment, sans qu'on puisse facilement voir ni défaire ça), on
voit toujours exactement qui suit quoi et on peut le corriger en un clic.

### Livraison des notifications

`notificationStore.ts` passe d'un flux partagé studio-wide à un ciblage
par destinataire. Le moyen le plus direct compatible avec le schéma
existant (`notifications` + `notification_reads`) : ajouter une colonne
`recipient_ids text[]` (ou table de jonction équivalente) sur
`notifications`, remplie à la création à partir de la liste `watchers` de
l'entité concernée (moins l'auteur). La lecture (`getUnreadForTask`,
etc.) filtre désormais sur `recipient_ids @> ARRAY[auth.uid()]` en plus des
filtres déjà existants par tâche/ressource/projet. `notification_reads`
garde son rôle inchangé (marqueur lu/non-lu par utilisateur).

### Courriels

`commentNotify.ts` (et l'équivalent pour factures/portail) envoie
désormais un courriel à **chaque observateur** sur un nouveau
commentaire/activité — pas seulement aux personnes mentionnées comme
aujourd'hui — chacun filtré individuellement par ses propres préférences
(`eventKey` + `recipientUserId`, mécanisme déjà en place et fonctionnel
pour les mentions, simplement étendu à tous les observateurs). Un
observateur qui a désactivé les courriels de type "commentaire" dans
Paramètres ne reçoit toujours qu'une notification en-app, comme avant.

### Corrections apportées aux types d'entité

- **Factures** — `addInvoiceComment` gagne l'équivalent de `notifyComment`
  (notification + courriel aux observateurs). Observateurs initiaux :
  l'équipe du projet lié à la facture, plus le contact comptable du client
  si un contact accounting_email est identifié (`getClientExternalTeam`
  filtré sur le rôle comptable, déjà résolu ailleurs dans le code pour
  l'email de rappel de facture en retard).
- **Demande d'approbation** (`RequestApprovalButton.tsx`) — passe
  désormais `eventKey: 'approval'` + `recipientUserId` pour chaque contact
  client visé, comme `commentNotify.ts` le fait déjà pour les mentions.
  Pour un contact qui n'a pas de compte portail (`user_id` absent, jamais
  accepté d'invitation), il n'y a pas de préférences à consulter — le
  courriel part sans filtre, exactement comme aujourd'hui pour ce cas
  précis. Remplace aussi l'acteur codé en dur (`USERS.lea.name`) par
  `getCurrentUser()`, comme le reste du code.
- **Actions du portail client** (`Portail.tsx` : message, correction
  demandée, approbation d'un livrable) — envoient désormais un courriel
  aux observateurs du projet/de la ressource concernée, filtré par leurs
  préférences, en plus de la notification en-app déjà existante.
- **`NotifKind`** — les valeurs `'status'`, `'annotation'`, `'version'`
  actuellement mortes (jamais produites) restent inutilisées ; les cases
  correspondantes dans Paramètres seront retirées ou clairement annotées
  "à venir" plutôt que de laisser des cases à cocher inertes qui donnent
  une fausse impression de contrôle — décision de nettoyage laissée à
  l'implémentation, pas un changement de comportement en soi.

## Hors scope (chantiers suivants)

- **Regroupement** de plusieurs commentaires rapprochés en une seule
  notification/un seul courriel (ex. dix commentaires sur une vidéo en 5
  minutes → une seule notification groupée) — chantier 2.
- **Récap quotidien** en courriel comme alternative aux envois individuels,
  et réglages de fréquence plus fins dans les préférences — chantier 3.
- Ce chantier ne change pas l'affichage groupé déjà existant dans l'onglet
  Activité (`groupNotifs()`) — purement cosmétique, indépendant du système
  de livraison, reste tel quel.
