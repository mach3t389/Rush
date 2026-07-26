# Design — Unifier les demandes d'approbation autour du livrable

Date : 2026-07-26

## Contexte

L'app a aujourd'hui **deux systèmes d'approbation qui ne se parlent pas** :

1. **Bouton "Demander l'approbation" sur les écrans de ressource** (VideoReview, DocumentReview, ImageReview, WebReview, ResourceDetail) — via `RequestApprovalButton.tsx`. Il change `resource.status` à `'review'` et crée une notification interne (`kind: 'approval'`). **Aucun écran client (ni le Portail, ni `mon-espace`) ne lit jamais le statut d'une `Resource`** — donc ce bouton est un cul-de-sac : le client ne voit jamais qu'on lui a demandé une approbation.

2. **Le "livrable"** (`Task` avec `deliverable: true`, `sharedWithClient`, `deliverableType`) géré dans l'onglet **Aperçu** du projet (`TravailOverview.tsx`). C'est ce que le Portail client (`Portail.tsx`) lit réellement : les livrables `sharedWithClient` avec `status === 'review'` s'affichent dans "En attente de votre approbation", et le client peut Approuver ou Demander des corrections (`handleApprove`/`handleCorrections`).

Le type `Task` a déjà un champ `linkedResources?: string[]` (utilisé dans `TaskPanel.tsx`/`TravailOverview.tsx`) permettant de lier un livrable à une ou plusieurs ressources — l'infrastructure pour unifier les deux existe déjà, elle n'est simplement pas branchée depuis le bouton de la ressource.

## Décision

**Un seul mécanisme d'approbation, toujours client-facing : le livrable.** Pas de nouvelle table, pas de nouveau type. "Demander une approbation sur une ressource" et "demander une approbation sur une tâche" convergent tous les deux sur le livrable, puisqu'un livrable *est* une tâche (avec `deliverable: true`).

**Hors scope pour ce chantier** (documenté ici pour ne pas les perdre, à traiter séparément si le besoin se confirme) :
- Envoi d'un vrai courriel au client (dépend de Resend — voir la section dédiée dans `CLAUDE.md`, chantier déjà déféré).
- Approbation **interne** entre membres d'équipe (sign-off sans client) — aucun signal de besoin réel actuellement; l'assignation + commentaire sur une tâche couvre déjà ce cas informellement.
- Verrouillage d'une ressource pendant qu'elle est en révision — reste éditable, cohérent avec le reste de l'app qui n'a aucun concept de verrouillage de contenu.

## Flux : demander une approbation depuis une ressource

Au clic sur le bouton (VideoReview/DocumentReview/ImageReview/WebReview/ResourceDetail) :

1. **Si la ressource n'a aucun livrable lié** (aucune `Task` du projet dont `linkedResources` contient `resource.id`) : créer un nouveau livrable —
   - `title` = titre de la ressource
   - `deliverableType` déduit du type de ressource (vidéo→`video`, document→`document`, image→`photo`, web→`web`)
   - `linkedResources: [resource.id]`
   - `sharedWithClient: true`
   - `status: 'review'`
2. **Si la ressource a déjà un livrable lié** en attente (`status === 'review'`) : ne pas dupliquer — relancer simplement la notification (bump `timestamp`), pour éviter le clutter de livrables en double dans Aperçu.
3. Mettre à jour `resource.status = 'review'` (cosmétique — c'est ce qu'affichent déjà les badges dans FileBrowser/ResourceDetail/WebReview aujourd'hui, comportement inchangé).
4. Notification interne `kind: 'approval'` (comportement actuel, inchangé).
5. Toast de confirmation explicite : *"Livrable créé et partagé avec le client pour approbation — voir dans Aperçu"*, avec lien direct vers l'onglet Aperçu du projet.

Le client voit et traite ça exactement comme un livrable normal aujourd'hui dans le Portail (`handleApprove`/`handleCorrections`, notifications `deliverableApproved`/`comment`) — **rien à construire côté client**, le flux fonctionne déjà.

## UX : le bouton devient un chip de statut persistant

**Problème identifié en cours de design** : le bouton actuel est noyé dans la barre d'outils du player (à côté de Partager/Plein écran), une simple icône parmi d'autres — aucun lien visuel avec la notion de "livrable" telle qu'elle existe dans Aperçu. Un studio qui clique dessus n'a aucune raison de savoir que ça a créé une entrée dans la liste "Livrables".

**Solution** : sortir le bouton de la barre d'outils du player, le placer près du titre de la ressource (zone d'en-tête, pas dans la rangée d'icônes), et le faire refléter l'état réel du livrable :

- **Avant toute demande** : `[Demander l'approbation]` (bouton plein, comme aujourd'hui).
- **Après création du livrable** : le bouton devient un **badge de statut vivant**, synchronisé sur le statut réel du livrable lié (`review` → "En attente d'approbation", `ok` → "Approuvé ✓", `correctionsRequested` → "Corrections demandées"), cliquable pour naviguer directement vers le livrable dans l'onglet Aperçu.

Ce badge doit s'abonner aux mises à jour du livrable (le store de tâches a déjà un mécanisme `subscribe`) pour rester synchronisé si le statut change ailleurs (ex: le client approuve pendant que le studio regarde encore l'écran de la ressource).

## Composants touchés

- `app/src/components/RequestApprovalButton.tsx` — logique réécrite : chercher/créer le livrable lié plutôt que toucher directement `resource.status` seul; devient aussi le composant du badge de statut (même composant, deux rendus selon l'état).
- `app/src/screens/VideoReview.tsx`, `DocumentReview.tsx`, `ImageReview.tsx`, `WebReview.tsx`, `ResourceDetail.tsx` — déplacer le point de montage du composant depuis la barre d'outils vers la zone d'en-tête/titre.
- `app/src/data/taskStore.ts` — probablement besoin d'une fonction utilitaire pour trouver le livrable lié à une ressource donnée (chercher parmi les tâches du projet celles où `linkedResources` contient l'id), à ajouter si elle n'existe pas déjà.
- Aucun changement à `Portail.tsx`, `TravailOverview.tsx`, `notificationStore.ts` — le flux client et les notifications existants sont réutilisés tels quels.
- Nouvelles clés i18n pour le badge de statut (fr/en) — pas de texte en dur.

## Notifications

Aucun nouveau type de notification. On réutilise `kind: 'approval'` (déclenché par le studio), `kind: 'deliverableApproved'` et `kind: 'comment'` (déclenchés par le client dans `Portail.tsx`), exactement comme aujourd'hui pour les livrables créés manuellement dans Aperçu.

Le canal email pour ces notifications reste non fonctionnel (`ChannelPrefs.email` existe dans les préférences mais rien ne l'exploite) — inchangé par ce chantier, dépend de Resend.
