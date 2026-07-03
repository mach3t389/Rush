# Livrables du Portail client — design

Date : 2026-07-03
Statut : approuvé (en attente de plan d'implémentation)

## Contexte

`Portail.tsx` (route `/portail/:projectId`, client-facing, sans backend) affiche une liste de livrables (`LIVRABLES`) entièrement écrite en dur dans le code — mêmes 4 entrées ("Rough Cut Final — V4", etc.) quel que soit le projet consulté. Les boutons "Approuver" / "Demander des corrections" ne changent qu'un état local React (`approved`/`requestedCorrections`) : rien n'est persisté, et le vrai livrable côté studio (une `Task` avec `deliverable: true`, gérée dans `TravailOverview.tsx`) ne change jamais de statut.

Le modèle studio existe déjà et fonctionne : un livrable est une `Task` (`deliverable: true`), avec un type (`deliverableType`), un format (`format`/`customWidth`/`customHeight`), un statut (`Status`: `warn`=à livrer, `info`=en cours, `review`=en révision, `ok`=approuvé, `danger`=en retard) et des ressources liées (`linkedResources: string[]`). Cette spec branche le portail client sur ce modèle réel, au lieu de son mock actuel.

## Hors scope (explicite)

- Le panneau "Corrections en cours" (annotations détaillées sur une vidéo précise, `VIDEO_CORRECTIONS` mock) — concept différent, reste factice, spec séparée à venir.
- Notion de version (V1/V2/V3) — absente du modèle de données actuel, n'est pas introduite ici. Un livrable reste un seul état courant.
- Aperçu réel du contenu (vidéo/document) dans la carte — icône générique par type, comme aujourd'hui. Une vraie prévisualisation nécessiterait une vue "sécurisée client" des ressources internes, qui n'existe pas (`ResourceRouter`/`VideoReview`/etc. sont conçus pour l'interface interne du studio, avec outils d'annotation et navigation internes) — chantier à part entière si un jour souhaité.
- Authentification du portail (reste un lien ouvert par `projectId`, comme aujourd'hui).

## 1. Nouveaux champs sur `Task` (`app/src/types/index.ts`)

```ts
export interface Task {
  // ... champs existants inchangés ...
  sharedWithClient?: boolean;      // le studio décide quels livrables sont visibles au portail
  correctionsRequested?: boolean;  // le client a demandé des changements sur ce livrable
}
```

- `sharedWithClient` : absent/`false` par défaut. Un livrable nouvellement créé n'est jamais visible au portail tant que le studio ne l'active pas explicitement.
- `correctionsRequested` : distinct du champ `status` existant. On n'ajoute pas de 6e valeur au type `Status` global (utilisé par `SFPill` et de nombreux `Record<Status, …>` à travers l'app) — élargir un type partagé comme celui-là crée un risque de cas manquants ailleurs dans le code (confirmé par un incident similaire sur `NotifKind` dans le chantier précédent). Un champ booléen séparé, propre à ce cas, est plus sûr et suffit au besoin.

## 2. `app/src/data/deliverableStatus.ts` — affichage centralisé (nouveau fichier)

Extrait de la constante `DELIVERABLE_STATUS` actuellement locale à `TravailOverview.tsx`, augmenté pour gérer `correctionsRequested` :

```ts
import type { Task } from '../types';

export interface DeliverableDisplay {
  color: string;
  icon: string;
  labelKey: string;
}

const DELIVERABLE_STATUS: Record<string, DeliverableDisplay> = {
  warn:    { labelKey: 'overview.deliverableToDeliver',  color: 'var(--text-3)', icon: 'clock' },
  info:    { labelKey: 'overview.deliverableInProgress', color: 'var(--info)',   icon: 'loader' },
  ok:      { labelKey: 'overview.deliverableApproved',   color: 'var(--ok)',     icon: 'check-circle' },
  review:  { labelKey: 'overview.deliverableInReview',   color: 'var(--review)', icon: 'eye' },
  danger:  { labelKey: 'overview.deliverableOverdue',    color: 'var(--danger)', icon: 'alert-circle' },
};

const CORRECTIONS_REQUESTED: DeliverableDisplay = {
  labelKey: 'overview.deliverableCorrectionsRequested',
  color: '#a85f3e',
  icon: 'message-circle-warning',
};

export function getDeliverableDisplay(task: Task): DeliverableDisplay {
  if (task.correctionsRequested) return CORRECTIONS_REQUESTED;
  return DELIVERABLE_STATUS[task.status] ?? DELIVERABLE_STATUS['warn'];
}
```

`TravailOverview.tsx` et `Portail.tsx` importent tous les deux `getDeliverableDisplay` — un seul endroit à maintenir pour que les deux vues restent visuellement cohérentes. `TravailOverview.tsx` perd sa constante locale `DELIVERABLE_STATUS` (remplacée par l'import).

**Note d'implémentation :** vérifier l'icône exacte `message-circle-warning` sur lucide.dev au moment d'écrire le code (règle du projet : `SFIcon` retourne `null` silencieusement si le nom est invalide) ; à défaut utiliser `alert-triangle`.

## 3. Studio : bouton "Partager avec le client" (`TravailOverview.tsx`)

Sur chaque ligne de livrable, un nouveau bouton icône à côté du trombone existant (lier une ressource) :
- Icône `eye` (partagé) / `eye-off` (non partagé), avec tooltip `t('overview.shareWithClient')` / `t('overview.unshareWithClient')`.
- Au clic : `updateTask(project.id, dl.id, { sharedWithClient: !dl.sharedWithClient })`.
- État visuel actif (accent) quand `sharedWithClient` est vrai, comme le trombone quand des ressources sont liées.

## 4. `Portail.tsx` — données réelles

- Remplace la constante `LIVRABLES` par `getDeliverables(project.id).filter(d => d.sharedWithClient)`, lu depuis `taskStore` et abonné via `subscribeStore` (même pattern que `TravailOverview.tsx`) pour que la page se mette à jour si le studio modifie un livrable pendant que le client a la page ouverte.
- Séparation :
  - **En attente d'approbation** : livrables partagés avec `status === 'review'`. Une carte par livrable (pas de limite à un seul) — la section disparaît complètement si la liste est vide.
  - **Historique** : tous les autres livrables partagés (`ok`, `danger`, `warn`, `info`, ou avec `correctionsRequested`), affichés avec `getDeliverableDisplay`. Message `t('portal.noDeliverablesShared')` si la liste complète des livrables partagés est vide.
- Suppression des états locaux `approved`/`requestedCorrections` — l'affichage de chaque carte dépend uniquement de l'état réel du livrable (`status`/`correctionsRequested`), donc il survit à un rechargement de page.
- **Approuver** (par livrable) :
  ```ts
  updateTask(project.id, dl.id, { status: 'ok', correctionsRequested: false });
  addNotif({ kind: 'approval', actor: project.clientName, text: `a approuvé le livrable "${dl.title}"`, taskId: dl.id, projectId: project.id, timestamp: Date.now() });
  ```
- **Demander des corrections** (par livrable) :
  ```ts
  updateTask(project.id, dl.id, { correctionsRequested: true });
  addNotif({ kind: 'comment', actor: project.clientName, text: `a demandé des corrections sur "${dl.title}"`, taskId: dl.id, projectId: project.id, timestamp: Date.now() });
  ```
  Les deux notifications portent `taskId: dl.id`, donc elles sont cliquables dans la cloche/`Activite.tsx` (navigue vers la tâche), cohérent avec le comportement existant des autres notifications de tâche.
- **Résolution de `correctionsRequested`** : quand le studio change ensuite le statut du livrable via le contrôle de statut habituel des tâches (`ProjectTaskRow.tsx`, utilisé par les listes/kanban), le gestionnaire de changement de statut réinitialise aussi `correctionsRequested: false` sur cette tâche. Pas de nouveau bouton "résolu" à construire — le geste naturel du studio (changer le statut une fois la correction traitée) suffit à faire disparaître l'état "corrections demandées". Cette réinitialisation est inoffensive pour les tâches non-livrables (`correctionsRequested` n'y est jamais défini).
- L'aperçu de chaque livrable reste une icône générique selon `deliverableType` (comme le fait déjà `TravailOverview.tsx` avec `DELIVERABLE_TYPES`) — pas de lecteur vidéo ni de clic vers une page de ressource interne.

## 5. i18n

Nouvelles clés (`fr.json`/`en.json`), toutes déjà dans l'esprit des clés `overview.*`/`portal.*` existantes :
- `overview.deliverableCorrectionsRequested` ("Corrections demandées" / "Corrections requested")
- `overview.shareWithClient` / `overview.unshareWithClient` (tooltips du nouveau bouton)
- `portal.noDeliverablesShared` (état vide)
- Les clés `portal.deliverableType*`/`portal.status*` actuelles de `Portail.tsx` (utilisées par l'ancien mock) sont supprimées si elles ne sont plus référencées ailleurs — à vérifier lors de l'implémentation.

## Points de vérification pour le plan d'implémentation

- Confirmer qu'aucun autre écran ne dépend de la constante locale `DELIVERABLE_STATUS` de `TravailOverview.tsx` avant de la supprimer (recherche globale).
- Vérifier que `ProjectTaskRow.tsx` a un seul point d'entrée pour le changement de statut (pas plusieurs call sites à patcher).
- Après tout changement de type partagé (`Task`), lancer `npx tsc --noEmit -p tsconfig.app.json` (pas la commande nue — voir mémoire `typecheck-command`) et comparer au nombre d'erreurs préexistant.
- Test manuel : créer un livrable, le partager, le voir apparaître au portail ; approuver depuis le portail → vérifier statut + notification cliquable côté studio ; demander des corrections → vérifier le badge orange distinct ; changer le statut côté studio → vérifier que `correctionsRequested` se réinitialise ; retirer le partage → vérifier la disparition immédiate du portail.
