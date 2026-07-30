# Assignation multiple d'une tâche — Design

**Date :** 2026-07-30
**Statut :** validé, prêt pour le plan d'implémentation

## Objectif

Permettre d'assigner une tâche à plusieurs personnes, à égalité, avec une seule
case « terminée » partagée : quand l'une d'elles coche la tâche, elle est
terminée pour tout le monde.

Asana ne le permet pas (un seul assigné, plus des « collaborateurs » qui ne sont
pas responsables). C'est un différenciateur produit demandé par les
utilisateurs.

## Décisions produit

| Question | Décision |
|----------|----------|
| Affichage à 3+ personnes | Avatars superposés (max 2) + « +N ». Survol de « +N » → liste des noms. |
| Mes Tâches | Affiche les **autres** assignés (« avec (TH) »), pas soi-même. |
| Complétion | Une seule case partagée. Pas de statut par personne. |
| Hiérarchie | Aucune. Tous les assignés sont à égalité, pas de « responsable ». |
| Notification | À la complétion d'une tâche partagée — voir la section dédiée. |
| Portail client | Inchangé (il n'affiche pas les assignés aujourd'hui). |

## Hors périmètre

- Statut par personne (« Thomas a fini sa part ») — rouvrirait la question
  « la tâche est-elle terminée ? », que la case unique tranche.
- Rôle « responsable » parmi les assignés.
- Filtrage ou regroupement par assigné (n'existe pas aujourd'hui).
- Portail client.

---

## 1. Modèle de données

### Changement de type

`app/src/types/index.ts` :

```ts
// avant
assignee: User | null;

// après
assignees: User[];   // liste vide = non assignée
```

`app/src/data/templates.ts`, type `TemplateTask` :

```ts
// avant
assignee?: { id: string; name: string; initials: string; avatarColor: string };

// après
assignees?: { id: string; name: string; initials: string; avatarColor: string }[];
```

Sans ce second changement, enregistrer comme modèle un projet dont une tâche a
3 assignés en perdrait 2 silencieusement.

### Aucune migration Supabase

Les tâches sont stockées **en JSON dans une seule colonne `data`** (table
`tasks`, voir `taskStore.ts` → `writeSupabaseSections`). Ajouter ou changer un
champ de `Task` ne touche pas le schéma Postgres. Aucun script SQL à exécuter à
la main.

### Conversion à la lecture

Les tâches déjà enregistrées contiennent `{assignee: X}`. Une fonction
convertit l'ancien format au moment de la lecture :

```ts
const { assignee, ...rest } = task;
return { ...rest, assignees: assignee ? [assignee] : [] };
```

Les sous-tâches ont leur propre assigné et doivent être converties
récursivement. Version complète :

```ts
// app/src/data/normalizeTask.ts (nouveau fichier)
export function normalizeTask(raw: unknown): Task {
  const t = raw as Task & { assignee?: User | null };
  const { assignee, ...rest } = t;
  const base = (t.assignees
    ? t
    : { ...rest, assignees: assignee ? [assignee] : [] }) as Task;
  return base.subtasks
    ? { ...base, subtasks: base.subtasks.map(normalizeTask) }
    : base;
}
```

**Points d'application** (les seuls endroits où des tâches entrent en mémoire) :

| Fichier | Emplacement |
|---------|-------------|
| `taskStore.ts` | `fetchSupabaseSections` — `trows.filter(...).map(t => t.data)` |
| `myTaskStore.ts` | `fetchSupabaseMyTasks` — `_freestandingTasks` et `_assignedTasks` |
| `taskStore.ts` / `myTaskStore.ts` | lecture `localStorage` des sessions démo |

Dès qu'une tâche convertie est réécrite, l'ancien format disparaît de la base.
Aucune bascule à surveiller : les deux formats cohabitent sans conflit.

### Données de démo

`mock.ts` contient 59 occurrences de `assignee: USERS.x`. Conversion mécanique
en `assignees: [USERS.x]` (script). Sans ça, TypeScript refuse le fichier
puisqu'il est typé `Task[]`.

---

## 2. Composant partagé `AssigneeGroup`

### Pourquoi

Six écrans gèrent l'assignation avec le **même bloc copié-collé** : un
`SFAvatar` (ou un rond pointillé si vide), un bouton, et un `InlineDropdown`
listant `getTeam()` en sélection unique. Les convertir un par un multiplierait
par six les occasions de diverger.

Un composant partagé, placé dans `app/src/components/ui/`, suit la convention
de l'app (`SFButton`, `SFAvatar`, `SFPill`…) et supprime environ 200 lignes
dupliquées.

### Interface

```tsx
// app/src/components/ui/AssigneeGroup.tsx
export function AssigneeGroup({
  assignees,
  onChange,
  size = 20,
  max = 2,
  readOnly = false,
}: {
  assignees: User[];
  onChange?: (next: User[]) => void;
  size?: number;        // diamètre d'un avatar
  max?: number;         // avatars affichés avant le « +N »
  readOnly?: boolean;   // pas de menu au clic
}): JSX.Element;
```

### Rendu

```
Vide       →  ( ⌀ )              rond pointillé + icône « user », comme aujourd'hui
1 personne →  (SA)               strictement identique à l'affichage actuel
2          →  (SA)(TH)           superposition de size/3 px
3+         →  (SA)(TH) +2        pastille « +2 »
```

- Superposition : `marginLeft: -size/3` à partir du deuxième avatar, chacun
  bordé de `2px solid var(--surface)` pour détacher les disques.
- Pastille `+N` : même diamètre que les avatars, `background: var(--surface-3)`,
  `fontFamily: var(--ff-mono)`, `fontSize: size * 0.45`.
- Survol de la pastille : `title` natif listant tous les noms, un par ligne.
- `readOnly` : aucun `onClick`, `cursor: default`.

### Sélection

Au clic, un `InlineDropdown` (composant existant) liste l'équipe avec une case
à cocher par personne.

- Le menu **reste ouvert** entre les clics — on coche plusieurs personnes
  d'affilée. Il se ferme au clic à l'extérieur ou sur `Escape`.
- Chaque bascule appelle `onChange` avec la liste complète mise à jour.
- Une entrée « Personne » en tête vide la liste et ferme le menu.

L'ordre de la liste suit l'ordre d'ajout — pas de tri, pour que l'affichage
reste stable quand on ajoute quelqu'un.

### Sites de remplacement

| Fichier | Contexte |
|---------|----------|
| `screens/Travail.tsx` | ligne de tâche + ligne d'ajout |
| `screens/Taches.tsx` | ligne Mes Tâches + ligne d'ajout |
| `screens/TravailBoard.tsx` | carte Kanban |
| `screens/TravailOverview.tsx` | ligne de livrable |
| `components/TaskPanel.tsx` | panneau de détail |
| `components/ProjectTaskRow.tsx` | éditeur de modèles |

### Sites de création de tâche

Cinq endroits construisent un `Task` avec un assigné en dur. Une ligne chacun :

| Fichier:ligne | Changement |
|---------------|------------|
| `screens/VideoReview.tsx:628` | `assignee: USERS.lea` → `assignees: [USERS.lea]` |
| `screens/Modeles.tsx:557` | `assignee: owner` → `assignees: owner ? [owner] : []` |
| `screens/Modeles.tsx:2153` | `assignee: USERS.lea` → `assignees: [USERS.lea]` |
| `components/ProjectsListView.tsx:170` | `assignee: members[0] ?? USERS.lea` → `assignees: [members[0] ?? USERS.lea]` |
| `components/RequestApprovalButton.tsx:67` | `assignee: USERS.lea` → `assignees: [USERS.lea]` |

`Taches.tsx` a également un `defaultAssignee` (ligne ~1395) à convertir en
liste.

---

## 3. Mes Tâches

### Filtre

`myTaskStore.ts`, dans `fetchSupabaseMyTasks` :

```ts
// avant
.filter(t => !!myUserId && t.assignee?.id === myUserId);

// après
.filter(t => !!myUserId && t.assignees?.some(u => u.id === myUserId));
```

Le même filtre existe pour les sessions démo — les deux chemins doivent
changer.

Conséquence directe : une tâche assignée à deux personnes apparaît dans les
deux listes, et se coche dans les deux quand l'une la termine. C'est le
comportement recherché ; aucun code supplémentaire n'est nécessaire puisque la
case `checked` est un champ unique de la tâche.

### Affichage

Sur une ligne de Mes Tâches, afficher les **autres** assignés — pas
soi-même, l'utilisateur sait déjà que la tâche est la sienne :

```
○  Révision scénario V3
○  Tournage jour 1          avec (TH)
○  Mixage sonore            avec (JU)(MA)
```

- Rendu par `AssigneeGroup` en `readOnly`, alimenté par
  `task.assignees.filter(u => u.id !== currentUserId)`.
- Le groupe n'apparaît que si cette liste filtrée n'est pas vide.
- Le mot « avec » vient d'une clé i18n (`tasks.sharedWith`), pas du code.

Attention : le sélecteur d'assignés **éditable** de Mes Tâches (ligne ~732)
reste sur la liste complète, non filtrée — on doit pouvoir se retirer soi-même.

---

## 4. Notification de complétion

### Contrainte : les notifications sont visibles par tout le studio

La table `notifications` est scopée par `studio_id` et n'a **pas de champ
destinataire** ; `notification_reads` ne retient que qui a lu quoi. Toutes les
notifications de l'app (commentaires, mentions, statuts) sont déjà visibles par
l'ensemble du studio.

Cibler uniquement les assignés demanderait une colonne supplémentaire, donc une
migration Supabase manuelle — que ce chantier évite par ailleurs entièrement.

**Décision :** la notification suit la convention existante et est visible par
le studio. Le texte nomme la tâche, ce qui la rend ignorable par ceux qu'elle
ne concerne pas.

*Alternative si le ciblage devient nécessaire :* ajouter une colonne
`recipient_ids uuid[]` à `notifications`, filtrer à la lecture dans
`fetchSupabaseNotifs`. Migration manuelle requise (avec le `grant` associé —
voir la note RLS du projet). Non retenu ici.

### Déclenchement

Quand une tâche dont `assignees.length > 1` passe de non cochée à cochée :

```ts
addNotif({
  kind: 'taskCompleted',
  actor: currentUser.name,
  text: `a terminé « ${task.title} »`,
  timestamp: Date.now(),
  taskId: task.id,
  projectId: task.projectId,
});
```

Conditions strictes :
- uniquement au passage `false → true` (jamais au décochage) ;
- uniquement si `assignees.length > 1` (une tâche solo ne notifie personne) ;
- une seule fois par bascule.

### Un seul point de déclenchement : `taskStore.updateTask()`

La case à cocher est gérée dans quatre écrans. Placer la notification dans
chacun garantirait d'en oublier un. Elle doit partir de `updateTask()` dans
`taskStore.ts`, qui les couvre tous — vérifié :

| Origine du clic | Chemin |
|-----------------|--------|
| `Travail.tsx`, `TravailBoard.tsx`, `TravailOverview.tsx`, `TaskPanel.tsx` | appellent directement `taskStore.updateTask` |
| Mes Tâches, session réelle | `updateMyTask` → `updateSupabaseMyTask` → `updateProjectTask` (alias de `taskStore.updateTask`, `myTaskStore.ts:159`) |
| Mes Tâches, session démo | liste indépendante (`_tasks` issu de `MY_TASKS`), ne contient **aucune** tâche de projet — rien à notifier, et aucun risque de double notification |

`updateTask()` reçoit un `patch`. La condition est donc :

```ts
const before = /* tâche avant patch, déjà lue dans updateTask */;
if (patch.checked === true && before.checked !== true && before.assignees.length > 1) {
  addNotif({ /* … */ });
}
```

`taskStore.ts` n'importe pas encore `getCurrentUser` (il importe
`isDemoSession, onLogout` depuis `authStore`) ni `addNotif` — deux imports à
ajouter. `notificationStore` n'importe pas `taskStore`, donc pas de cycle.

### Nouveau type de notification

Ajouter `'taskCompleted'` à `NotifKind` (`notificationStore.ts:22`).

TypeScript imposera alors une entrée dans **cinq** tables indexées par
`NotifKind` :

| Fichier:ligne | Table |
|---------------|-------|
| `notificationStore.ts:45` | `taskMessages` — mettre `[]` (jamais généré par le seed) |
| `Activite.tsx:36` | libellé i18n |
| `Activite.tsx:49` | couleur de statut → `'ok'` |
| `Activite.tsx:130` | verbe traduit |
| `Activite.tsx:150` | icône → `{ icon: 'check-circle', color: 'var(--ok)', bg: 'rgba(0,200,100,0.12)' }` |

La notification porte un `taskId`, donc `Activite.tsx:158` la rend cliquable
automatiquement (`clickable = !!(taskId || …)`) — aucun changement requis là.

---

## 5. Internationalisation

Nouvelles clés, à ajouter dans `fr.json` **et** `en.json` :

| Clé | FR | EN |
|-----|----|----|
| `tasks.sharedWith` | `avec` | `with` |
| `tasks.assignees` | `Assignés` | `Assignees` |
| `tasks.noOne` | `Personne` | `No one` |
| `activity.taskCompleted` | `Tâche terminée` | `Task completed` |
| `activity.verbTaskCompleted` | `a terminé` | `completed` |

La clé existante `tasks.unassigned` reste utilisée pour l'état vide.

---

## 6. Cas limites

| Cas | Comportement |
|-----|--------------|
| Tâche sans assigné | `assignees: []` → rond pointillé, identique à aujourd'hui. |
| Membre retiré du studio | Son avatar reste dans les tâches (les `User` sont copiés dans le JSON, pas référencés). Comportement déjà en place pour l'assigné unique — inchangé. |
| Même personne ajoutée deux fois | Impossible : la sélection est une bascule par identifiant. |
| Sous-tâches | Ont leur propre liste d'assignés, indépendante de la tâche parente. Traitées par `normalizeTask`. |
| Modèle chargé dans un projet | Les assignés du modèle sont recopiés tels quels. |
| Conversion tâche ↔ sous-tâche | La liste suit la tâche. Aucun traitement particulier. |
| Session démo | Chemin identique : `normalizeTask` s'applique aussi aux lectures `localStorage`. |

---

## 7. Vérification

Aucun test automatisé dans ce projet. Vérification via `npm run dev` :

1. Assigner 3 personnes à une tâche depuis la liste → « (SA)(TH) +1 », survol
   affiche les 3 noms.
2. Ouvrir le panneau de détail → mêmes 3 personnes, retirer l'une d'elles →
   la ligne se met à jour.
3. Kanban, aperçu projet (livrables), éditeur de modèles → même affichage.
4. Mes Tâches : une tâche partagée montre « avec (X) » ; une tâche solo ne
   montre rien.
5. Cocher une tâche partagée → elle se coche partout, et une notification
   « a terminé » apparaît dans la cloche et dans Activité.
6. Cocher une tâche solo → **aucune** notification.
7. Décocher → aucune notification.
8. Recharger la page → les assignés persistent.
9. Ouvrir un projet dont les tâches sont à l'ancien format → un seul avatar
   s'affiche, sans erreur console.

`npx tsc -p tsconfig.app.json --noEmit` doit rester à zéro erreur.
