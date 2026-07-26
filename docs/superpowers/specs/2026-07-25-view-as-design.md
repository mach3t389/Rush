# Étape D — Bascule admin « voir comme »

**Date :** 2026-07-25
**Contexte :** quatrième et dernière étape du chantier « vues par rôle ». Les étapes A (rôles internes structurés), B (comptes clients réels + accès sécurisé) et C (vrai tableau de bord client à 4 onglets) sont livrées et en production. Cette étape ajoute une capacité de prévisualisation admin : voir l'app comme la verrait un membre interne ou un contact client donné, sans avoir besoin d'un vrai compte pour ce dernier. Voir [[client-access-followup-chantier]] et les mémoires des étapes A/B/C pour l'historique des décisions déjà prises.

## Découverte de départ

Une infrastructure partielle existe déjà et n'a pas besoin d'être reconstruite :

- `app/src/data/viewAsStore.ts` — état global `ViewAsUser` (`type: 'internal' | 'external'`), `enterViewAs`/`exitViewAs`/`subscribeViewAs`.
- `app/src/components/ViewAsBanner.tsx` — bandeau permanent affiché quand un `viewAs` est actif, avec bouton « Quitter ».
- `app/src/components/layout/Sidebar.tsx` — lit déjà `viewAsStore` pour masquer les liens Clients/Finances selon les permissions du membre interne prévisualisé.
- Boutons « Voir en tant que » déjà câblés dans `MonEquipe.tsx` (membre interne → `enterViewAs({type:'internal', ...})` puis `navigate('/')`) et `FicheClient.tsx` (contact client → `enterViewAs({type:'external', ...})` puis `navigate('/portail/:projectId')`, l'ancienne page portail non routée pour les vrais clients).

Cette étape complète les deux côtés de ce système déjà amorcé, sans changer son API publique (`enterViewAs`/`exitViewAs`/`ViewAsUser`).

## Portée

1. **Membre interne** : la restriction de permissions devient réelle au niveau des routes (pas seulement l'affichage de la barre latérale) — impossible de contourner en tapant une URL ou via un lien direct.
2. **Contact client** : le bouton « Voir en tant que » affiche désormais les vrais écrans de l'Étape C (Aperçu/Fichiers/Calendrier/Factures), alimentés par les données du studio (l'admin y a déjà légitimement accès) plutôt que par une session client réelle — jamais via l'ancienne page `/portail`.

Hors scope : toute modification du système `viewAsStore`/`ViewAsBanner` lui-même (déjà correct) ; toute action d'écriture en mode prévisualisation (les deux vues restent strictement en lecture) ; la restriction d'accès *réelle* d'un vrai membre (l'étape A gère déjà les permissions réelles côté backend/RLS — cette étape ne fait que simuler la vue d'un membre pour un admin qui observe).

## 1 — Membre interne : garde au niveau des routes

**Problème actuel :** `Sidebar.tsx` calcule déjà `canSeeClients`/`canSeeFinances` à partir de `viewAsPerms` et masque les liens correspondants, mais rien n'empêche d'atteindre `/clients` ou une page Finances directement (URL tapée, favori, lien depuis une autre page).

**Solution :** un petit composant garde `ViewAsPermissionGate` (nouveau fichier `app/src/components/ViewAsPermissionGate.tsx`), qui :
- lit `getViewAsUser()` ;
- si `viewAs?.type === 'internal'` et que la permission requise pour cette route n'est pas dans `viewAs.permissions`, redirige immédiatement vers `/` (`useEffect` + `navigate('/', {replace: true})`, même mécanisme que les redirections déjà utilisées ailleurs dans l'app, ex. `authLoader`) ;
- sinon rend `children` normalement.

Enveloppe dans `main.tsx` les éléments des routes déjà identifiées par `Sidebar.tsx` comme sensibles aux permissions : `/clients`, `/clients/:clientId` (permission `manage_clients`), et toute route Finances-projet (`/projets/:projectId` n'a pas d'onglet Finances séparé dans le routeur actuel — à vérifier lors du plan ; si les finances sont un onglet dans `TravailOverview`/`ProjetFinances`, la garde s'applique à la route `ProjetFinances` si elle existe séparément, sinon au composant d'onglet lui-même).

Réutilise le même mapping route→permission déjà implicite dans `Sidebar.tsx` (`canSeeClients`/`canSeeFinances`) plutôt que d'en inventer un nouveau — extraire ce mapping dans une petite fonction partagée (`getRequiredPermissionForPath(pathname): PermissionKey | null`) que `Sidebar.tsx` et `ViewAsPermissionGate` utilisent tous les deux, pour ne jamais les laisser diverger.

## 2 — Contact client : réutiliser les vrais écrans de l'Étape C

### 2.1 — Nouvelles routes de prévisualisation

Séparées de `/mon-espace` (qui reste strictement réservé aux vraies sessions client authentifiées — aucun changement à `clientLoader` ni aux policies RLS) :

```
/apercu-client/:clientId                              → liste de projets (équivalent ClientHome)
/apercu-client/:clientId/projets/:projectId            → Aperçu
/apercu-client/:clientId/projets/:projectId/fichiers   → Fichiers
/apercu-client/:clientId/projets/:projectId/calendrier → Calendrier
/apercu-client/:clientId/projets/:projectId/finances   → Factures
```

Gardées par un loader dédié `viewAsClientLoader` : si aucun `viewAs` externe actif (`getViewAsUser()?.type !== 'external'`), redirige vers `/clients` (l'admin ne doit jamais atterrir sur ces routes sans avoir cliqué « Voir en tant que »).

### 2.2 — Sources de données « aperçu »

Nouveau fichier `app/src/data/viewAsClientDataStore.ts` (garde `clientSessionStore.ts` intact — celui-ci reste dédié aux vraies sessions client authentifiées, ne pas mélanger les responsabilités) avec des fonctions miroir de celles de l'Étape C, mais lisant les stores studio (auxquels l'admin a déjà un accès complet et légitime) au lieu de faire des requêtes Supabase RLS-dépendantes :

- `getPreviewClientProjects(clientId): ClientProject[]` — construit à partir de `getProjectsByClient(clientId)` (déjà existant, `projectStore.ts`), remappé vers la même forme `ClientProject`.
- `getPreviewClientDeliverables(projectId): ClientDeliverable[]` — à partir de `getDeliverables(projectId)` (`taskStore.ts`, déjà existant), même filtre `deliverable && sharedWithClient !== false` que la version réelle.
- `getPreviewClientEvents(projectIds: string[]): ClientCalEvent[]` — à partir de `getEvents()`/`getEventTypes()` (`eventStore.ts`/`eventTypeStore.ts`), filtré par `projectIds`, remappé vers `ClientCalEvent`.
- `getPreviewClientFolders(projectId)`/`getPreviewClientFiles(projectId): ClientFileFolder[]/ClientFileItem[]` — à partir de `getFolders()`/`getFiles()` (`fileStore.ts`), filtré par `projectId` et état actif (même règle que la version réelle : `state` null/undefined).
- `getPreviewClientInvoices(projectId): ClientInvoice[]` — à partir de `getInvoicesByProject(projectId)` (`financeStore.ts`), remappé.

Chaque fonction retourne **exactement le même type exporté** (`ClientProject`, `ClientDeliverable`, `ClientCalEvent`, `ClientFileFolder`, `ClientFileItem`, `ClientInvoice` — réexportés ou importés depuis `clientSessionStore.ts`/`ClientProjectFichiers.tsx` selon où ils sont actuellement définis) pour que les écrans n'aient besoin d'aucune adaptation de type, seulement d'un aiguillage de fonction.

Toutes ces fonctions sont **synchrones** (contrairement aux vraies, qui sont `async` car elles font une requête réseau) puisque les stores studio sont déjà en cache mémoire — les écrans doivent gérer les deux cas (`Promise<T> | T`) via un simple `await Promise.resolve(...)`, ou les nouvelles fonctions preview retournent délibérément une `Promise` résolue immédiatement pour garder une signature identique aux vraies (recommandé — évite toute branche `if (typeof result === 'object' && 'then' in result)` dans les écrans).

### 2.3 — Aiguillage dans les écrans existants

Chacun des 5 écrans concernés (`ClientHome.tsx`, `ClientProjectApercu.tsx`, `ClientProjectFichiers.tsx`, `ClientProjectCalendrier.tsx`, `ClientProjectFinances.tsx`) ajoute, au moment de choisir quelle fonction de récupération appeler :

```ts
const viewAs = getViewAsUser();
const fetchProjects = viewAs?.type === 'external'
  ? () => Promise.resolve(getPreviewClientProjects(viewAs.clientId!))
  : getMyClientProjects;
```

Même `ClientProjectHeader.tsx` (utilisé par les 4 écrans d'onglet) doit basculer sa propre source (`getMyClientProjects` → `getPreviewClientProjects`) et ses liens de navigation (`/mon-espace/projets/:id/...` → `/apercu-client/:clientId/projets/:id/...`), sinon cliquer un onglet depuis la prévisualisation ramènerait vers les vraies routes `/mon-espace` (qui redirigeraient l'admin ailleurs, cassant le flux).

### 2.4 — Redirection du bouton existant

`FicheClient.tsx`'s `handleViewAsPortal` : remplacer `navigate(`/portail/${clientProjects[0].id}`)` par `navigate(`/apercu-client/${clientId}`)` (toujours vers la liste de projets, jamais directement dans un projet — contrairement à Étape C section 5 qui atterrit directement dans le projet après acceptation d'invitation, ici l'admin choisit lui-même dans quel projet entrer, cas d'usage différent). Le cas « plusieurs projets » (`showProjectPicker`) devient inutile pour cette nouvelle destination (la liste de projets remplit déjà ce rôle) — mais garder `enterViewAs(...)` inchangé, seule la ligne `navigate(...)` change. `MonEquipe.tsx`'s `handleViewAs` (interne) reste inchangé (`navigate('/')`), déjà correct pour la garde de route de la section 1.

L'ancienne route `/portail/:projectId` et `Portail.tsx` restent sur le disque, non touchées — aucun autre code n'en dépend après ce changement, mais leur suppression est hors scope (pas demandée, pas nécessaire).

## Sécurité

Aucun changement à la sécurité réelle (RLS, `clientLoader`, `authLoader`) — cette étape est purement une simulation admin-side utilisant des données auxquelles l'admin a déjà un accès studio légitime. Les nouvelles routes `/apercu-client/*` sont gardées par `viewAsClientLoader`, qui exige un `viewAs` externe actif (donc un clic explicite sur « Voir en tant que » par un admin déjà authentifié studio) — pas de nouvelle surface d'accès pour un utilisateur non-admin. Toutes les vues restent strictement en lecture (aucune fonction preview n'écrit).

## Test

Entièrement testable par Claude en mode démo — aucun compte réel requis (l'admin observe ses propres données studio, filtrées). Parcours à vérifier lors de la vérification manuelle : « Voir en tant que » membre interne sans permission Finances → tentative d'atteindre une route Finances par URL directe → redirection automatique confirmée ; « Voir en tant que » contact client → parcours des 4 onglets → données cohérentes avec ce que montre le studio pour ce projet → bouton Quitter → retour à l'écran d'origine.

## Hors scope (rappel)

- Modification du système `viewAsStore`/`ViewAsBanner` (déjà correct, aucun changement d'API).
- Suppression de l'ancienne page `/portail/:projectId` (laissée intacte, simplement plus référencée par ce bouton).
- Toute action d'écriture en mode prévisualisation, quel que soit le type de vue.
- Restriction d'accès réelle (non simulée) pour un membre interne — déjà couverte par l'étape A et les policies RLS existantes.
