# Signalement de bug vers Discord — Design

## Objectif

Ajouter un bouton "Signaler un bug" toujours visible dans Rush, permettant à un utilisateur de décrire un problème rencontré, avec une capture d'écran automatique et du contexte technique, envoyé directement dans un canal Discord choisi par l'administrateur du projet (Alexis) — sans construire de système de tickets.

## Architecture

**Composant client** : un bouton flottant global (`BugReportButton.tsx`), monté dans `AppShell.tsx` aux côtés du bouton IA existant, visible sur toutes les pages authentifiées (pas sur le portail client `/portail/:projectId`, qui reste une surface distincte destinée aux clients externes).

**Backend** : pas de nouvelle fonction Vercel. La route est ajoutée comme un sous-chemin (`bug-report`) à l'intérieur du fichier existant `app/api/integrations.ts`, qui route déjà plusieurs sous-chemins via `req.query.path` (réécriture `vercel.json` : `/api/integrations/v1/(.*)` → `/api/integrations?path=$1`). Le projet reste à 12/12 fonctions. Cette branche est indépendante du système OAuth déjà présent dans ce fichier (destiné aux intégrations tierces) — elle a sa propre logique simple, sans PKCE ni jetons d'accès.

**Destination** : un webhook Discord standard (URL de la forme `https://discord.com/api/webhooks/{id}/{token}`), stocké côté serveur dans une nouvelle variable d'environnement Vercel `DISCORD_BUG_WEBHOOK_URL` (jamais exposée au client). L'utilisateur (Alexis) doit créer ce webhook lui-même dans les paramètres du canal Discord visé (clic droit sur le canal → Intégrations → Webhooks → Nouveau webhook → copier l'URL) et la fournir comme variable d'environnement.

## Composants

### `BugReportButton.tsx` (nouveau, dans `app/src/components/`)

- Bouton flottant rond, icône `bug` (SFIcon), positionné en bas à droite, au-dessus du bouton IA existant (pour ne pas les superposer — le bouton IA occupe déjà ce coin).
- **Session démo** : la route backend exige un jeton de session Supabase réel (voir plus bas), qu'une session démo n'a jamais (`isDemoSession()` contourne complètement Supabase — même principe déjà en place pour l'Assistant IA, voir `ai.demoNotice`). Au clic en session démo, la modale affiche donc un message statique expliquant que le signalement de bug nécessite un compte réel, sans tenter d'appel réseau ni de capture d'écran.
- Au clic (session réelle) :
  1. Capture immédiatement l'écran visible via `html-to-image` (nouvelle dépendance, ~13 Ko, aucune permission navigateur requise — contrairement à l'API `getDisplayMedia`).
  2. Ouvre une modale (`SFModal`) avec le formulaire, la capture en aperçu miniature, et un bouton pour la retirer si l'utilisateur ne veut pas l'envoyer.

### `BugReportModal.tsx` (nouveau)

Champs :
- **Description** (textarea, requis) — ce qui ne fonctionne pas.
- **Étapes de reproduction** (textarea, requis) — comment reproduire le problème.

Contexte capturé automatiquement (affiché en lecture seule dans la modale, pour transparence) :
- Page/route actuelle (`location.pathname`)
- Résolution d'écran (`window.innerWidth`×`window.innerHeight`)
- Navigateur (`navigator.userAgent`)
- Utilisateur + studio (nom, email, nom du studio — depuis `getCurrentUser()`/`authStore.ts`)

Bouton "Envoyer" désactivé tant que Description et Reproduction sont vides. Après envoi réussi : toast de confirmation (`showToast`, pattern existant), fermeture de la modale. En cas d'échec réseau : message d'erreur inline dans la modale (pas de toast silencieux — l'utilisateur doit savoir que son rapport n'est pas parti), le formulaire reste ouvert pour réessayer.

### Route `bug-report` dans `app/api/integrations.ts`

- Méthode POST, chemin `/api/integrations/v1/bug-report`.
- Corps : `{ description, reproduction, page, screenResolution, userAgent, userName, userEmail, studioName, screenshotDataUrl }`.
- Validation : `description` et `reproduction` requis (non vides, longueur max raisonnable ~4000 caractères chacun, limite Discord). `screenshotDataUrl` optionnel (l'utilisateur a pu la retirer).
- Construit un message Discord (embed) avec les champs ci-dessus, dans le même esprit visuel que la capture d'écran fournie par l'utilisateur (titre, description, reproduction, puis une ligne de métadonnées : page, résolution, navigateur, utilisateur/studio, horodatage).
- Si une capture d'écran est fournie : décode le `dataURL` base64 en buffer, l'envoie en pièce jointe via une requête `multipart/form-data` au webhook Discord (`payload_json` + `files[0]`), et la référence dans l'embed (`image: { url: 'attachment://screenshot.png' }`).
- Protection : la route exige un jeton de session Supabase valide (envoyé par le client dans l'en-tête `Authorization`, exactement comme le fait déjà `app/api/send-email.ts` pour les courriels transactionnels — voir sa description : "Any authenticated Rush user can call this ... checked via their Supabase session token"). Le serveur vérifie ce jeton auprès de Supabase avant de transmettre à Discord. Contrairement à un secret codé en dur, un jeton de session n'est jamais un problème même s'il apparaît dans le code client — il prouve seulement qu'un utilisateur Rush réellement connecté (avec un vrai compte, pas une session démo) a fait la demande, ce qui suffit à empêcher un tiers anonyme de spammer le webhook Discord en appelant l'endpoint directement. Une session démo n'ayant pas de jeton Supabase, la route rejette systématiquement ces appels (cohérent avec le fait que le client ne tente même pas l'appel en démo, voir plus haut).

## Flux de données

1. Clic sur le bouton flottant → capture d'écran immédiate (avant que la modale n'apparaisse et n'altère visuellement l'écran) → ouverture de la modale.
2. Utilisateur remplit Description + Reproduction, peut retirer la capture si désiré, clique Envoyer.
3. Client POST vers `/api/integrations/v1/bug-report` avec le corps JSON (capture en base64 si conservée).
4. Serveur valide, construit l'embed, envoie au webhook Discord.
5. Réponse 200 → toast de confirmation + fermeture modale. Réponse d'erreur (validation, webhook Discord indisponible, variable d'environnement manquante) → message d'erreur affiché dans la modale, formulaire conservé.

## Gestion d'erreurs

- `DISCORD_BUG_WEBHOOK_URL` non configurée côté serveur → 500 avec message clair côté client ("Le signalement de bug n'est pas encore configuré, contactez l'administrateur") — pas un crash silencieux.
- Discord répond une erreur (ex. webhook supprimé, payload trop gros) → propager un message générique côté client, logger le détail côté serveur (`console.error`) pour debug ultérieur.
- Capture d'écran échoue (rare, ex. contenu protégé par CORS dans un `<canvas>`) → continuer sans capture plutôt que bloquer l'envoi du rapport ; avertir discrètement dans la modale ("Capture d'écran indisponible, le rapport sera envoyé sans image").

## Hors scope (pour l'instant)

- Pas de système de suivi des rapports dans Rush lui-même (pas de liste "mes signalements", pas de statut) — Discord est la seule interface de suivi, comme dans l'ancien projet.
- Pas de limite de fréquence (rate limiting) applicative — l'exigence d'un compte réel authentifié suffit comme première barrière ; à revisiter si abus constaté.
- Pas de portail client (`/portail/:projectId`) — réservé aux utilisateurs internes de Rush.
