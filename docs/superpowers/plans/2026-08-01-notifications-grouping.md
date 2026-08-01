# Regroupement des notifications en-app — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une notification `comment` non lue sur le même item se met à jour
(plutôt que d'en créer une nouvelle) à chaque nouveau commentaire, avec un
texte qui reflète le nombre de personnes impliquées ("Sarah a commenté" →
"Sarah et 2 autres ont commenté « X »"). Les mentions restent toujours
individuelles.

**Architecture:** `AppNotif` gagne trois champs : `itemLabel` (le nom de
l'item affiché entre guillemets, séparé du texte pour pouvoir reconstruire
la phrase), `actorNames` (liste des noms distincts impliqués, la plus
récente activité en premier), `count` (nombre d'événements fusionnés).
`addNotif()` cherche une notification non lue existante avec la même clé
`(taskId ?? resourceId, kind)` avant de créer une ligne — si trouvée, elle
la met à jour (fusion des acteurs, texte régénéré, `recipientIds` et
`timestamp` rafraîchis) au lieu d'insérer une nouvelle ligne. Les deux
points d'émission de commentaires (`commentNotify.ts`, `financeStore.ts`)
passent désormais `itemLabel` séparément plutôt qu'un texte déjà composé.

**Tech Stack:** React 19 + TypeScript, Supabase.

## Global Constraints

- Les mentions (`kind: 'mention'`) ne sont **jamais** regroupées — toujours
  une notification individuelle, comme aujourd'hui.
- Toute nouvelle colonne Supabase est ajoutée par une migration SQL dans
  `docs/superpowers/specs/`, exécution manuelle par l'utilisateur —
  rappeler ça explicitement à la fin de la tâche qui l'ajoute.
- Pattern démo/réel existant à respecter partout.
- `npx tsc --noEmit -p app/tsconfig.app.json` (ou la forme
  `node_modules/.bin/tsc` depuis `app/` si `npx` échoue à résoudre) → 0
  erreur.
- Ne pas toucher `app/src/screens/Activite.tsx` — son regroupement
  d'affichage (`groupNotifs()`) continue de fonctionner tel quel sur des
  notifications déjà fusionnées à l'écriture, aucun changement requis de
  son côté (vérifié dans le design).

---

### Task 1: Étendre `AppNotif` (itemLabel, actorNames, count) + migration

**Files:**
- Modify: `app/src/data/notificationStore.ts`
- Create: `docs/superpowers/specs/2026-08-01-notifications-grouping-migration.sql`

**Interfaces:**
- Produces: `AppNotif.itemLabel?: string`, `AppNotif.actorNames?: string[]`, `AppNotif.count?: number` (tous optionnels — absent/`1` = notification simple, non groupée, comportement inchangé pour tous les `kind` autres que `comment`).
- Produces: colonnes Postgres `notifications.item_label text`, `notifications.actor_names text[] default '{}'`, `notifications.count integer default 1`.

- [ ] **Step 1: Étendre le type `AppNotif`**

Dans `app/src/data/notificationStore.ts`, ajouter au type `AppNotif` (après `recipientIds: string[];`) :

```typescript
  /** Nom de l'item affiché entre guillemets dans le texte (ex. le titre
   * d'une ressource) — séparé du texte final pour pouvoir régénérer la
   * phrase quand plusieurs événements se fusionnent en une notification. */
  itemLabel?: string;
  /** Noms distincts des personnes impliquées, la plus récente activité
   * en premier — sert à composer "Sarah et 2 autres ont commenté". */
  actorNames?: string[];
  /** Nombre d'événements fusionnés dans cette notification (1 = simple). */
  count?: number;
```

- [ ] **Step 2: Étendre `NotificationRow`, `toNotif`, `toRow`**

```typescript
interface NotificationRow {
  id: string;
  kind: NotifKind;
  actor: string;
  text: string;
  timestamp: number;
  task_id: string | null;
  resource_id: string | null;
  project_id: string | null;
  client_id: string | null;
  recipient_ids: string[];
  item_label: string | null;
  actor_names: string[];
  count: number;
}
```

`toNotif` :

```typescript
function toNotif(row: NotificationRow, read: boolean): AppNotif {
  return {
    id: row.id,
    kind: row.kind,
    actor: row.actor,
    text: row.text,
    timestamp: row.timestamp,
    read,
    taskId: row.task_id ?? undefined,
    resourceId: row.resource_id ?? undefined,
    projectId: row.project_id ?? undefined,
    clientId: row.client_id ?? undefined,
    recipientIds: row.recipient_ids ?? [],
    itemLabel: row.item_label ?? undefined,
    actorNames: row.actor_names ?? [],
    count: row.count ?? 1,
  };
}
```

`toRow` :

```typescript
function toRow(n: AppNotif, studioId: string): NotificationRow & { studio_id: string } {
  return {
    id: n.id,
    studio_id: studioId,
    kind: n.kind,
    actor: n.actor,
    text: n.text,
    timestamp: n.timestamp,
    task_id: n.taskId ?? null,
    resource_id: n.resourceId ?? null,
    project_id: n.projectId ?? null,
    client_id: n.clientId ?? null,
    recipient_ids: n.recipientIds,
    item_label: n.itemLabel ?? null,
    actor_names: n.actorNames ?? [],
    count: n.count ?? 1,
  };
}
```

Mettre à jour le `.select(...)` de `fetchSupabaseNotifs()` pour inclure
`item_label, actor_names, count` dans la liste de colonnes demandées.

- [ ] **Step 3: `seedNotifs()` (démo) — ajouter les champs par défaut**

Chaque entrée générée par `seedNotifs()` gagne `count: 1` (les autres
champs restent `undefined`, optionnels — pas nécessaire de les ajouter
explicitement).

- [ ] **Step 4: Migration SQL**

`docs/superpowers/specs/2026-08-01-notifications-grouping-migration.sql` :

```sql
-- Regroupement des notifications de commentaires : une notification non
-- lue peut désormais représenter plusieurs événements fusionnés plutôt
-- qu'un seul — ces 3 colonnes portent l'état nécessaire pour reconstruire
-- le texte affiché ("Sarah et 2 autres ont commenté « X »") à chaque fusion.
alter table notifications add column if not exists item_label text;
alter table notifications add column if not exists actor_names text[] default '{}';
alter table notifications add column if not exists count integer default 1;
```

- [ ] **Step 5: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 6: Commit et rappel migration**

```bash
git add app/src/data/notificationStore.ts docs/superpowers/specs/2026-08-01-notifications-grouping-migration.sql
git commit -m "feat(notifs): add itemLabel/actorNames/count fields for notification grouping"
```

⚠️ Rappeler à l'utilisateur d'exécuter le fichier SQL dans Supabase → SQL
Editor avant que la Tâche 2 ne fonctionne en session réelle.

---

### Task 2: Fusionner à l'écriture dans `addNotif()`

**Files:**
- Modify: `app/src/data/notificationStore.ts`

**Interfaces:**
- Produces: `addNotif(notif: Omit<AppNotif, 'id' | 'read'>): void` — signature publique inchangée. Le comportement de fusion s'active automatiquement quand `notif.kind === 'comment'` et que `notif.itemLabel` est fourni (les appelants qui ne passent pas `itemLabel`, càd tout sauf les deux sites de la Tâche 3, continuent de créer une notification individuelle à chaque appel, exactement comme avant — rétrocompatible par construction).

- [ ] **Step 1: Ajouter la logique de recherche + fusion**

Juste avant le corps actuel de `addNotif`, ajouter :

```typescript
// Regroupement : un commentaire sur un item qui a déjà une notification
// 'comment' non lue pour ce même item met à jour cette notification au
// lieu d'en créer une nouvelle — évite le bruit de dix notifications
// séparées pour dix commentaires rapprochés. Les mentions ne sont jamais
// concernées (toujours individuelles, gérées par le chemin normal
// ci-dessous puisque mentionedMembers.length===0 ⇒ kind !== 'comment' ne
// s'applique pas ici, mais kind==='mention' est explicitement exclu par
// la condition). Seuls les appelants qui fournissent `itemLabel`
// participent à ce mécanisme (voir Tâche 3) — sans lui, comportement
// inchangé.
function findGroupableNotif(notif: Omit<AppNotif, 'id' | 'read'>): AppNotif | undefined {
  if (notif.kind !== 'comment' || !notif.itemLabel) return undefined;
  const ctx = notif.taskId ?? notif.resourceId;
  if (!ctx) return undefined;
  return getNotifs().find(n =>
    !n.read &&
    n.kind === 'comment' &&
    (n.taskId ?? n.resourceId) === ctx
  );
}

function groupedText(actorNames: string[], itemLabel: string): string {
  if (actorNames.length <= 1) return `a commenté « ${itemLabel} »`;
  if (actorNames.length === 2) return `et ${actorNames[1]} ont commenté « ${itemLabel} »`;
  return `et ${actorNames.length - 1} autres ont commenté « ${itemLabel} »`;
}
```

- [ ] **Step 2: Brancher la fusion dans `addNotif`**

Remplacer le début de la fonction :

```typescript
export function addNotif(notif: Omit<AppNotif, 'id' | 'read'>): void {
  if (isDemoSession()) {
```

par :

```typescript
export function addNotif(notif: Omit<AppNotif, 'id' | 'read'>): void {
  const existing = findGroupableNotif(notif);
  if (existing) {
    const actorNames = [notif.actor, ...(existing.actorNames ?? [existing.actor]).filter(a => a !== notif.actor)];
    const merged: AppNotif = {
      ...existing,
      actor: notif.actor,
      actorNames,
      count: (existing.count ?? 1) + 1,
      text: groupedText(actorNames, notif.itemLabel!),
      timestamp: notif.timestamp,
      recipientIds: notif.recipientIds,
    };
    if (isDemoSession()) {
      _demoNotifs = _demoNotifs.map(n => n.id === merged.id ? merged : n);
      persistDemo();
      notify();
      return;
    }
    _supabaseNotifs = _supabaseNotifs.map(n => n.id === merged.id ? merged : n);
    notify();
    void addSupabaseNotif(merged); // upsert-style: insert avec le même id échouerait — voir Step 3
    return;
  }

  if (isDemoSession()) {
```

- [ ] **Step 3: `addSupabaseNotif` doit gérer la mise à jour, pas seulement l'insertion**

`addSupabaseNotif` fait actuellement `supabase.from('notifications').insert(...)`
— un appel avec un `id` déjà existant échouerait (contrainte de clé
primaire). Remplacer `.insert(toRow(notif, studioId))` par
`.upsert(toRow(notif, studioId))` dans `addSupabaseNotif` — safe aussi
bien pour une vraie création (id inédit) que pour une fusion (id déjà en
base), sans changer son type de retour ni ses appelants.

- [ ] **Step 4: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/notificationStore.ts
git commit -m "feat(notifs): coalesce repeated comment notifications on the same item into one"
```

---

### Task 3: Passer `itemLabel` depuis les deux émetteurs de commentaires

**Files:**
- Modify: `app/src/data/commentNotify.ts`
- Modify: `app/src/data/financeStore.ts`

**Interfaces:**
- Consumes: le comportement de fusion de la Tâche 2, activé uniquement quand `itemLabel` est fourni à `addNotif`.

- [ ] **Step 1: `commentNotify.ts` — passer `itemLabel` à `addNotif`**

Dans `notifyComment`, l'appel à `addNotif({...})` construit aujourd'hui
`text` directement avec `itemLabel` interpolé dedans. Ajouter le champ
`itemLabel` à cet appel **uniquement pour la branche `kind: 'comment'`**
(pas pour `mention`, qui reste toujours individuelle et n'a pas besoin de
regénération de texte) :

```typescript
  addNotif({
    kind: mentionedMembers.length > 0 ? 'mention' : 'comment',
    actor,
    text: mentionedMembers.length > 0
      ? `vous a mentionné dans « ${itemLabel} »`
      : `${verb} « ${itemLabel} »`,
    timestamp: Date.now(),
    resourceId,
    taskId,
    projectId,
    recipientIds,
    ...(mentionedMembers.length === 0 ? { itemLabel } : {}),
  });
```

(Le `text` initial reste utilisé tel quel pour la toute première
notification d'un groupe — `findGroupableNotif` ne trouvera rien la
première fois, donc `text` passe inchangé ; ce n'est qu'à partir du
deuxième commentaire sur le même item que `groupedText()` prend le relais
et régénère `text`.)

- [ ] **Step 2: `financeStore.ts` — même ajustement dans `addInvoiceComment`**

Repérer l'appel à `addNotif({...})` dans `addInvoiceComment` (ajouté au
chantier précédent — kind `comment`/`mention` selon la présence d'un
`@mention`) et ajouter `itemLabel: inv.title` de la même façon,
uniquement quand `isMention` est faux :

```typescript
  addNotif({
    kind: isMention ? 'mention' : 'comment',
    actor: comment.author,
    text: isMention
      ? `vous a mentionné dans la facture « ${inv.title} »`
      : `a commenté la facture « ${inv.title} »`,
    timestamp: Date.now(),
    projectId: inv.projectId,
    recipientIds,
    ...(isMention ? {} : { itemLabel: inv.title }),
  });
```

Note : les notifications de factures utilisent `projectId` comme seule
clé de contexte (pas de `taskId`/`resourceId` dédié à la facture elle-même
— voir le code existant). `findGroupableNotif` (Tâche 2) ne matche que sur
`taskId ?? resourceId` — une notification de facture n'a ni l'un ni
l'autre, donc **ne se regroupera pas** avec ce mécanisme tel quel. C'est
une limite acceptée pour ce chantier : les commentaires de facture
continueront de créer une notification par commentaire (comme avant),
seuls les commentaires sur tâches et ressources bénéficient du
regroupement. Documenter ce choix dans le commit plutôt que d'étendre la
clé de regroupement aux factures (qui n'ont pas d'id propre stocké sur
`AppNotif` aujourd'hui — hors scope, éviterait une migration
supplémentaire pour ce chantier).

- [ ] **Step 3: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 4: Test manuel**

Serveur de preview : commenter deux fois de suite (comptes démo
différents, sans @mention) sur la même tâche ou ressource. Confirmer
qu'une seule notification apparaît (pas deux), avec le texte
"[Nom1] et [Nom2] ont commenté « X »". Un troisième commentaire doit
donner "[Nom1] et 2 autres ont commenté « X »". Marquer la notification
lue, puis commenter à nouveau : confirmer qu'une **nouvelle** notification
distincte apparaît (le regroupement ne s'applique qu'aux notifications non
lues).

- [ ] **Step 5: Commit**

```bash
git add app/src/data/commentNotify.ts app/src/data/financeStore.ts
git commit -m "feat(notifs): wire itemLabel through comment emitters to enable grouping"
```
