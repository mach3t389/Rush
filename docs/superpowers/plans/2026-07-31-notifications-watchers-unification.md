# Notifications — modèle d'observateurs et uniformisation — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le flux de notifications partagé (tout le studio voit
tout) par un modèle d'observateurs ciblé, et uniformiser la couverture
notification/courriel sur tous les types d'entité (tâches, ressources,
factures, approbations, actions du portail client).

**Architecture:** Chaque tâche/ressource/facture gagne un champ
`watchers: string[]` (ids utilisateur), auto-rempli (créateur, assigné,
commentateur, personne mentionnée) et éditable manuellement près des
commentaires. `notificationStore.ts` cible désormais chaque notification
aux observateurs de l'entité (nouvelle colonne `recipient_ids` sur
`notifications`) au lieu de tout le studio. `commentNotify.ts` devient le
point central : il lit les observateurs actuels de l'entité, y ajoute
l'auteur et les personnes mentionnées, crée la notification ciblée, et
envoie un courriel à chaque observateur (sauf l'auteur) filtré par ses
propres préférences.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS), Resend
(courriel via `app/api/send-email.ts`), i18next.

## Global Constraints

- Toute nouvelle colonne Supabase est ajoutée par une migration SQL dans
  `docs/superpowers/specs/` — son exécution réelle dans Supabase → SQL
  Editor reste **manuelle**, comme documenté dans CLAUDE.md. Chaque tâche
  qui ajoute une colonne doit se terminer par un rappel explicite à
  l'utilisateur.
- Pattern démo/réel existant à respecter partout : `isDemoSession()` garde
  le comportement localStorage inchangé ; seul le chemin Supabase change.
- Ne jamais notifier l'auteur de sa propre action (exclure son id de la
  liste des destinataires courriel/notification).
- `sendEmail()` reste fire-and-forget (jamais de blocage/rollback de
  l'action déclenchante en cas d'échec), comme partout ailleurs dans ce
  fichier.
- Le fichier `app/src/i18n/` et les fichiers `app/src/locales/fr.json` /
  `en.json` : toute nouvelle chaîne visible à l'utilisateur passe par
  `t('namespace.key')`, ajoutée dans les deux fichiers de locale — jamais
  de texte en dur.
- Constat vérifié directement sur `origin/master` (pas une copie locale
  potentiellement en retard) : à ce jour, `emailStore.ts`/
  `app/api/send-email.ts` n'ont **aucun** mécanisme `eventKey`/
  `recipientUserId` — la Tâche 1 le construit from scratch, ce n'est pas
  une simple réactivation.

---

### Task 1: Gating des courriels par préférence (`eventKey`/`recipientUserId`)

**Files:**
- Modify: `app/src/data/emailStore.ts`
- Modify: `app/api/send-email.ts`

**Interfaces:**
- Produces: `sendEmail(to: string, subject: string, html: string, opts?: { eventKey?: string; recipientUserId?: string }): Promise<void>` — signature élargie, rétrocompatible (tout appel existant sans `opts` continue de fonctionner exactement pareil).

- [ ] **Step 1: Élargir `sendEmail()` dans `app/src/data/emailStore.ts`**

Remplacer le corps actuel par :

```typescript
import { supabase } from './supabaseClient';

interface SendEmailOpts {
  // Quand les deux sont fournis, l'API vérifie les notif_prefs du
  // destinataire pour cette clé d'événement et saute l'envoi en silence
  // s'il a désactivé ce courriel — voir NOTIF_EVENTS dans notifPrefsStore.ts.
  eventKey?: string;
  recipientUserId?: string;
}

// Fire-and-forget, comme pushToGoogleCalendar dans eventStore.ts — un
// échec de courriel ne doit jamais bloquer ni annuler l'action Rush qui
// l'a déclenché.
export async function sendEmail(to: string, subject: string, html: string, opts?: SendEmailOpts): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ to, subject, html, eventKey: opts?.eventKey, recipientUserId: opts?.recipientUserId }),
    });
    if (!res.ok) console.error('sendEmail failed', await res.text());
  } catch (err) {
    console.error('sendEmail failed', err);
  }
}
```

- [ ] **Step 2: Gater l'envoi côté serveur dans `app/api/send-email.ts`**

Ajouter `eventKey`/`recipientUserId` au type du body et consulter
`notif_prefs` via le client service-role (déjà créé plus bas dans le
fichier pour vérifier le token) avant l'envoi Resend :

```typescript
interface SendEmailBody {
  to: string;
  subject: string;
  html: string;
  eventKey?: string;
  recipientUserId?: string;
}
```

Juste après la résolution de `user` (authentification de l'appelant) et
avant l'appel à Resend, insérer :

```typescript
  const { eventKey, recipientUserId } = req.body as SendEmailBody;
  if (eventKey && recipientUserId) {
    const { data: prefsRow } = await supabaseAdmin
      .from('notif_prefs')
      .select('prefs')
      .eq('user_id', recipientUserId)
      .maybeSingle();
    const prefs = (prefsRow?.prefs as Record<string, { email?: boolean }> | undefined) ?? {};
    // Absence de préférence = comportement par défaut (voir DEFAULTS dans
    // notifPrefsStore.ts) — seule une valeur explicite `false` bloque l'envoi.
    if (prefs[eventKey]?.email === false) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }
  }
```

- [ ] **Step 3: Vérifier**

Aucun test automatisé dans ce projet. Vérification : `npx tsc --noEmit -p app/tsconfig.app.json` doit rester à 0 erreur sur ces deux fichiers. Test manuel différé à la Tâche 4 (premier vrai appelant avec `eventKey`).

- [ ] **Step 4: Commit**

```bash
git add app/src/data/emailStore.ts app/api/send-email.ts
git commit -m "feat(notifs): gate transactional emails by recipient notif_prefs"
```

---

### Task 2: Colonnes `watchers` + `recipient_ids` (types + migration)

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/data/financeStore.ts` (type `Invoice`)
- Create: `app/src/data/watchers.ts`
- Create: `docs/superpowers/specs/2026-07-31-watchers-migration.sql`

**Interfaces:**
- Produces: `Task.watchers?: string[]`, `Resource.watchers?: string[]`, `Invoice.watchers?: string[]`.
- Produces: `addWatcher(current: string[] | undefined, userId: string | undefined | null): string[]` — dans `watchers.ts`, dédoublonne et ignore les ids vides/nuls.
- Produces: `notifications.recipient_ids text[]` (colonne Postgres).

- [ ] **Step 1: Ajouter le champ `watchers` aux types**

Dans `app/src/types/index.ts`, sur `Task` (juste après `comments?: TaskComment[];`) et sur `Resource` (juste après `templateOrigin?: ...`) :

```typescript
  /** Personnes notifiées des futurs commentaires/activités sur cet item — auto-rempli (créateur, assigné, commentateur, mentionné), éditable manuellement. */
  watchers?: string[];
```

Dans `app/src/data/financeStore.ts`, sur `Invoice` (après `sortOrder?: number;`), le même champ avec le même commentaire.

- [ ] **Step 2: Créer le helper partagé `app/src/data/watchers.ts`**

```typescript
// Petit utilitaire partagé pour maintenir la liste d'observateurs
// (watchers) d'une tâche/ressource/facture — dédoublonne, ignore les ids
// vides, ne fait jamais de retrait implicite (le retrait est toujours une
// action manuelle explicite dans l'UI).
export function addWatcher(current: string[] | undefined, userId: string | undefined | null): string[] {
  const list = current ?? [];
  if (!userId || list.includes(userId)) return list;
  return [...list, userId];
}

export function addWatchers(current: string[] | undefined, userIds: (string | undefined | null)[]): string[] {
  return userIds.reduce((acc, id) => addWatcher(acc, id), current ?? []);
}
```

- [ ] **Step 3: Écrire la migration SQL**

`docs/superpowers/specs/2026-07-31-watchers-migration.sql` :

```sql
-- Colonne de ciblage des notifications — remplace le flux partagé
-- studio-wide par une livraison par observateur. NULL/tableau vide =
-- aucun destinataire ciblé (ne devrait plus arriver une fois la Tâche 4
-- en place, mais reste lisible sans erreur en attendant).
alter table notifications add column if not exists recipient_ids text[] default '{}';

-- Index GIN pour accélérer le filtre "recipient_ids @> ARRAY[mon_id]"
-- utilisé à chaque lecture du flux de notifications par utilisateur.
create index if not exists notifications_recipient_ids_idx on notifications using gin (recipient_ids);
```

- [ ] **Step 4: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur.

- [ ] **Step 5: Commit et rappel migration**

```bash
git add app/src/types/index.ts app/src/data/financeStore.ts app/src/data/watchers.ts docs/superpowers/specs/2026-07-31-watchers-migration.sql
git commit -m "feat(notifs): add watchers field to Task/Resource/Invoice + recipient_ids migration"
```

⚠️ Rappeler à l'utilisateur d'exécuter `2026-07-31-watchers-migration.sql` dans Supabase → SQL Editor avant que la Tâche 3 ne soit utile en session réelle.

---

### Task 3: Livraison ciblée dans `notificationStore.ts`

**Files:**
- Modify: `app/src/data/notificationStore.ts`

**Interfaces:**
- Consumes: `addWatcher`/`addWatchers` (Task 2, non utilisé directement ici mais par les appelants de la Tâche 4).
- Produces: `addNotif(notif: Omit<AppNotif, 'id' | 'read'> & { recipientIds: string[] }): void` — signature élargie avec un champ obligatoire `recipientIds`. **Breaking change interne assumé** : chaque appelant existant (`RequestApprovalButton.tsx`, `Portail.tsx`, `InvitationAccept.tsx`, `storageStore.ts`, `taskStore.ts`) doit être mis à jour pour fournir `recipientIds` — traité tâche par tâche (Tâches 5, 7, 8) ; ceux non couverts par ce plan (`storageLimit`, `taskCompleted`, `invitation`) passent temporairement `recipientIds: []` avec un commentaire `// TODO(notifs): cibler les vrais destinataires` pour ne pas casser le build, hors scope de ce chantier.

- [ ] **Step 1: Étendre `AppNotif`, `NotificationRow`, `toNotif`/`toRow`**

```typescript
export interface AppNotif {
  id: string;
  kind: NotifKind;
  actor: string;
  text: string;
  timestamp: number;
  read: boolean;
  taskId?: string;
  resourceId?: string;
  projectId?: string;
  clientId?: string;
  recipientIds: string[];
}
```

`NotificationRow` gagne `recipient_ids: string[];`. `toNotif`/`toRow` mappent `recipientIds` ↔ `recipient_ids` (comme les autres champs optionnels, avec `?? []` côté lecture).

- [ ] **Step 2: Filtrer les lectures par destinataire courant (session réelle)**

Dans `fetchSupabaseNotifs()`, après avoir résolu `user`, ajouter au `.select(...)` la colonne `recipient_ids`, puis filtrer côté client (Postgres `text[]` — pas besoin d'un `.contains()` serveur pour ce volume, cohérent avec le reste du fichier qui filtre déjà côté client) :

```typescript
    _supabaseNotifs = (notifRows as NotificationRow[])
      .filter(row => !user || row.recipient_ids.includes(user.id))
      .map(row => toNotif(row, readIds.has(row.id)));
```

Session démo : inchangé (pas de notion de destinataire ciblé en démo — garder le flux partagé tel quel, `recipientIds` toujours vide côté démo et ignoré à la lecture).

- [ ] **Step 3: Propager `recipientIds` dans `addNotif`, `addSupabaseNotif`, et les seeds démo**

`addNotif(notif: Omit<AppNotif, 'id' | 'read'>)` — la signature ne change pas structurellement (elle prend déjà tout `AppNotif` sauf `id`/`read`, donc `recipientIds` devient automatiquement un champ requis de l'objet passé une fois l'interface étendue à l'étape 1 — pas de changement de code dans `addNotif` lui-même). `seedNotifs()` (démo) : ajouter `recipientIds: []` sur chaque entrée générée (champ ignoré en lecture démo mais requis par le type).

- [ ] **Step 4: Corriger temporairement les appelants existants non couverts par ce plan**

Dans `storageStore.ts` (kind `storageLimit`) et `InvitationAccept.tsx` (kind `invitation`) : ajouter `recipientIds: []` avec le commentaire `// TODO(notifs): cibler les vrais destinataires` mentionné plus haut. Dans `taskStore.ts` (kind `taskCompleted`, si présent) : même traitement.

- [ ] **Step 5: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur nouvelle (les erreurs pré-existantes sans rapport restent acceptables, mais toute erreur sur les fichiers touchés ici doit être résolue).

- [ ] **Step 6: Commit**

```bash
git add app/src/data/notificationStore.ts app/src/data/storageStore.ts app/src/screens/TeamInvitationAccept.tsx
git commit -m "feat(notifs): target notification delivery by recipient instead of studio-wide broadcast"
```

---

### Task 4: `commentNotify.ts` — auto-ajout des observateurs + courriel à chacun

**Files:**
- Modify: `app/src/data/commentNotify.ts`

**Interfaces:**
- Consumes: `addWatcher`/`addWatchers` (Task 2), `sendEmail(..., {eventKey, recipientUserId})` (Task 1), `addNotif` avec `recipientIds` (Task 3), `getTeamMembers()` (teamStore.ts), `getSections`/`updateTask` (taskStore.ts), `getResources`/`updateResource` (resourceStore.ts).
- Produces: `notifyComment(opts: NotifyCommentOpts): void` — même signature publique, comportement interne entièrement revu. Les 15 appelants existants (Task 5 les liste) n'ont **aucun changement à faire** — c'est tout l'intérêt de centraliser ici.

- [ ] **Step 1: Réécrire `notifyComment`**

```typescript
import { addNotif } from './notificationStore';
import { getCurrentUser } from './authStore';
import { getTeamMembers } from './teamStore';
import { sendEmail } from './emailStore';
import { isDemoSession } from './authStore';
import { addWatcher, addWatchers } from './watchers';
import { getSections, updateTask as updateTaskStore } from './taskStore';
import { getResources, updateResource } from './resourceStore';
import { USERS } from './mock';

function actorName(): string {
  return getCurrentUser()?.name ?? USERS.lea.name;
}

function actorId(): string | undefined {
  return getCurrentUser()?.id;
}

function mentionedNames(text: string): string[] {
  const matches = text.match(/@([A-Za-zÀ-ÿ]+(?:\s[A-Za-zÀ-ÿ]+)?)/g) ?? [];
  return matches.map(m => m.slice(1).trim());
}

interface NotifyCommentOpts {
  kind: 'add' | 'reply';
  text: string;
  itemLabel: string;
  resourceId?: string;
  taskId?: string;
  projectId?: string;
}

// Résout la liste actuelle d'observateurs d'une tâche ou d'une ressource,
// et la fonction pour la réécrire — les deux stores ont une forme de
// mutation différente (setSections fait un remplacement complet par
// projet, updateResource prend un patch direct), d'où ce petit bout de
// branchement plutôt qu'une interface commune artificielle.
function resolveWatchers(taskId?: string, resourceId?: string, projectId?: string): { current: string[]; commit: (next: string[]) => void } {
  if (taskId && projectId) {
    const sections = getSections(projectId);
    const task = sections.flatMap(s => s.tasks).find(t => t.id === taskId);
    return {
      current: task?.watchers ?? [],
      commit: next => updateTaskStore(projectId, taskId, { watchers: next }),
    };
  }
  if (resourceId) {
    const resource = getResources().find(r => r.id === resourceId);
    return {
      current: resource?.watchers ?? [],
      commit: next => updateResource(resourceId, { watchers: next }),
    };
  }
  return { current: [], commit: () => {} };
}

export function notifyComment({ kind, text, itemLabel, resourceId, taskId, projectId }: NotifyCommentOpts): void {
  const actor = actorName();
  const myId = actorId();
  const verb = kind === 'reply' ? 'a répondu sur' : 'a commenté';
  const mentionNames = mentionedNames(text);
  const members = getTeamMembers();
  const mentionedMembers = mentionNames
    .map(name => members.find(m => m.name.toLowerCase() === name.toLowerCase()))
    .filter((m): m is NonNullable<typeof m> => !!m);

  // Auto-ajout : l'auteur du commentaire et les personnes mentionnées
  // deviennent observateurs, s'ils ne l'étaient pas déjà.
  const { current, commit } = resolveWatchers(taskId, resourceId, projectId);
  const nextWatchers = addWatchers(current, [myId, ...mentionedMembers.map(m => m.id)]);
  if (nextWatchers.length !== current.length) commit(nextWatchers);

  const recipientIds = nextWatchers.filter(id => id !== myId);

  addNotif({
    kind: mentionNames.length > 0 ? 'mention' : 'comment',
    actor,
    text: mentionNames.length > 0
      ? `vous a mentionné dans « ${itemLabel} »`
      : `${verb} « ${itemLabel} »`,
    timestamp: Date.now(),
    resourceId,
    taskId,
    projectId,
    recipientIds,
  });

  if (isDemoSession()) return;

  const eventKey = mentionNames.length > 0 ? 'mention' : 'comment';
  const subject = mentionNames.length > 0
    ? `${actor} vous a mentionné dans « ${itemLabel} »`
    : `${actor} a commenté « ${itemLabel} »`;
  const html = `<p>${actor} ${mentionNames.length > 0 ? 'vous a mentionné dans' : verb} « ${itemLabel} » :</p><p>${text}</p>`;

  for (const id of recipientIds) {
    const member = members.find(m => m.id === id);
    if (!member?.email) continue;
    void sendEmail(member.email, subject, html, { eventKey, recipientUserId: member.id });
  }
}
```

Note : le comportement change subtilement pour les commentaires *sans*
mention — auparavant aucun courriel n'était jamais envoyé pour un simple
commentaire ; désormais chaque observateur reçoit un courriel de type
`comment`, filtré par sa préférence (par défaut désactivée pour ce type,
voir `notifPrefsStore.ts` `DEFAULTS` — donc silence par défaut tant que
l'utilisateur n'active pas explicitement ce canal, comportement de départ
sûr).

- [ ] **Step 2: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur nouvelle sur `commentNotify.ts`. Import circulaire à surveiller : `taskStore.ts`/`resourceStore.ts` n'importent pas `commentNotify.ts` aujourd'hui (vérifié par grep avant implémentation) — si une tâche future en crée un, le casser explicitement en sortant `resolveWatchers` dans son propre petit module.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/commentNotify.ts
git commit -m "feat(notifs): notifyComment now targets watchers and emails each per their prefs"
```

---

### Task 5: Observateurs initiaux à la création (assigné + créateur)

**Files:**
- Modify: `app/src/data/taskStore.ts` (`updateTask`)
- Modify: `app/src/screens/Travail.tsx` (création de tâche/livrable inline)
- Modify: `app/src/screens/Taches.tsx` (création de tâche inline)
- Modify: `app/src/screens/TravailOverview.tsx` (création de livrable — vu dans une session précédente de ce projet, section "Livrables client")
- Modify: `app/src/components/RequestApprovalButton.tsx` (création du livrable lié à une demande d'approbation)

**Interfaces:**
- Consumes: `addWatchers` (Task 2), `getCurrentUser()` (authStore.ts).

- [ ] **Step 1: Élargir automatiquement les observateurs quand `assignees` change — `taskStore.ts`**

Dans `updateTask(projectId, taskId, patch)`, avant le `setSections(projectId, next)` final, si `patch.assignees` est présent, fusionner leurs ids dans `watchers` du patch effectif :

```typescript
export function updateTask(projectId: string, taskId: string, patch: Partial<Task>): void {
  const sections = getSections(projectId);
  const next = sections.map(s => ({
    ...s,
    tasks: s.tasks.map(t => {
      if (t.id !== taskId) return t;
      const resolvedPatch = (patch.status !== undefined && patch.correctionsRequested === undefined)
        ? { ...patch, correctionsRequested: false }
        : patch;
      const watchers = resolvedPatch.assignees
        ? addWatchers(t.watchers, resolvedPatch.assignees.map(a => a.id))
        : t.watchers;
      return { ...t, ...resolvedPatch, watchers };
    }),
  }));
  setSections(projectId, next);
}
```

(Ajouter `import { addWatchers } from './watchers';` en haut du fichier.)

- [ ] **Step 2: Initialiser `watchers` à la création — chaque site de construction de `Task`**

Dans `Travail.tsx`, `Taches.tsx`, `TravailOverview.tsx` et
`RequestApprovalButton.tsx`, repérer chaque endroit qui construit un objet
`Task` littéral pour l'ajouter au store (`setSections`/`addDeliverable`).
Sur chacun, ajouter :

```typescript
      watchers: addWatchers([], [getCurrentUser()?.id, ...assignees.map(a => a.id)]),
```

où `assignees` est le tableau déjà utilisé pour le champ `assignees:` de ce
même objet littéral (import `getCurrentUser` depuis `../data/authStore` et
`addWatchers` depuis `../data/watchers` dans chaque fichier qui n'a pas
déjà l'un ou l'autre).

- [ ] **Step 3: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur nouvelle sur les 5 fichiers touchés.

- [ ] **Step 4: Test manuel (pas de suite automatisée dans ce projet)**

Serveur de preview : créer une tâche assignée à un autre membre démo (ex.
Thomas Robert), ouvrir son panneau de détail, confirmer via
`console.log`/inspection que `task.watchers` contient l'id du créateur et
celui de l'assigné dès la création (avant tout commentaire).

- [ ] **Step 5: Commit**

```bash
git add app/src/data/taskStore.ts app/src/screens/Travail.tsx app/src/screens/Taches.tsx app/src/screens/TravailOverview.tsx app/src/components/RequestApprovalButton.tsx
git commit -m "feat(notifs): auto-add creator and assignees as watchers at task creation"
```

---

### Task 6: Factures — commentaires notifiés + observateurs

**Files:**
- Modify: `app/src/data/financeStore.ts`
- Modify: `app/src/screens/Finances.tsx` (ou `ProjetFinances.tsx` selon où vit l'appel à `addInvoiceComment` — grep `addInvoiceComment(` avant d'éditer, les deux écrans partagent `financeStore.ts`)

**Interfaces:**
- Consumes: `addNotif` avec `recipientIds` (Task 3), `sendEmail` (Task 1), `addWatchers` (Task 2), `getProjects()`/`Project.members` (projectStore.ts).
- Produces: `addInvoiceComment(invoiceId: string, comment: InvoiceComment, authorId?: string): void` — signature élargie d'un paramètre optionnel (rétrocompatible).

- [ ] **Step 1: Initialiser `watchers` à la création d'une facture**

Repérer la construction de l'objet `Invoice` (probablement dans
`Finances.tsx`, formulaire "Ajouter une facture" déjà touché dans une
session précédente pour l'intitulé/format PDF). Ajouter :

```typescript
      watchers: addWatchers([], [getCurrentUser()?.id, ...(project?.members.map(m => m.id) ?? [])]),
```

où `project` est le `Project` déjà résolu via `projectId` sur ce même
écran pour afficher le nom du projet.

- [ ] **Step 2: Notifier + emailer sur un nouveau commentaire de facture — `financeStore.ts`**

```typescript
export function addInvoiceComment(invoiceId: string, comment: InvoiceComment, authorId?: string): void {
  const inv = getInvoices().find(i => i.id === invoiceId);
  if (!inv) return;
  const watchers = addWatcher(inv.watchers, authorId);
  updateInvoice(invoiceId, { comments: [...(inv.comments ?? []), comment], watchers });

  const recipientIds = watchers.filter(id => id !== authorId);
  addNotif({
    kind: 'comment',
    actor: comment.author,
    text: `a commenté la facture « ${inv.title} »`,
    timestamp: Date.now(),
    projectId: inv.projectId,
    recipientIds,
  });

  if (isDemoSession()) return;
  const members = getTeamMembers();
  for (const id of recipientIds) {
    const member = members.find(m => m.id === id);
    if (!member?.email) continue;
    void sendEmail(
      member.email,
      `${comment.author} a commenté la facture « ${inv.title} »`,
      `<p>${comment.author} a commenté la facture « ${inv.title} » :</p><p>${comment.text}</p>`,
      { eventKey: 'comment', recipientUserId: member.id }
    );
  }
}
```

(Imports à ajouter en haut de `financeStore.ts` : `addNotif` depuis
`./notificationStore`, `sendEmail` depuis `./emailStore`, `getTeamMembers`
depuis `./teamStore`, `addWatcher` depuis `./watchers`, `isDemoSession`
depuis `./authStore` — vérifier lesquels sont déjà importés avant
d'ajouter des doublons.)

- [ ] **Step 3: Passer `authorId` depuis l'appelant**

Sur l'écran qui appelle `addInvoiceComment(...)`, ajouter l'argument
`getCurrentUser()?.id`.

- [ ] **Step 4: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/financeStore.ts app/src/screens/Finances.tsx
git commit -m "feat(notifs): invoices now notify watchers on new comments (previously silent)"
```

---

### Task 7: `RequestApprovalButton` — courriel gaté + acteur réel

**Files:**
- Modify: `app/src/components/RequestApprovalButton.tsx`

**Interfaces:**
- Consumes: `sendEmail` avec `eventKey: 'approval'` (Task 1), `getCurrentUser()`, `getClientExternalTeam(clientId)` (clientTeamStore.ts).

- [ ] **Step 1: Remplacer l'acteur codé en dur et cibler `recipientIds`**

Dans `handle()` et `handleRelaunch()`, remplacer `actor: USERS.lea.name`
par `actor: getCurrentUser()?.name ?? USERS.lea.name`, et ajouter
`recipientIds: task.watchers ?? []` à chaque `addNotif({ kind: 'approval', ... })` (le livrable venant d'être créé avec ses `watchers` initiaux via la Tâche 5).

- [ ] **Step 2: Envoyer un courriel gaté à chaque contact client**

Après `addDeliverable(projectId, task)` dans `handle()` (et de façon
symétrique dans `handleRelaunch()`), ajouter :

```typescript
    if (!isDemoSession()) {
      const contacts = getClientExternalTeam(project?.clientId ?? '');
      for (const contact of contacts) {
        if (!contact.email) continue;
        void sendEmail(
          contact.email,
          `Approbation demandée : « ${resource.title} »`,
          `<p>${actorName} a demandé votre approbation pour « ${resource.title} ».</p>`,
          contact.userId ? { eventKey: 'approval', recipientUserId: contact.userId } : undefined
        );
      }
    }
```

(`contact.userId` : présent seulement si ce contact a accepté une
invitation portail et a un compte — sinon le courriel part sans filtre,
comme avant l'introduction du gating, cohérent avec la Tâche 1 : pas de
`recipientUserId` = pas de vérification possible. Vérifier le nom exact du
champ sur `ClientContact` — `user_id` en base, probablement `userId` côté
client après mapping dans `clientTeamStore.ts`, à confirmer en lisant le
fichier avant d'écrire ce code.)

Imports à ajouter : `sendEmail` depuis `../data/emailStore`,
`getClientExternalTeam` depuis `../data/clientTeamStore`, `isDemoSession`
et `getCurrentUser` depuis `../data/authStore`.

- [ ] **Step 3: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/RequestApprovalButton.tsx
git commit -m "fix(notifs): approval-request emails now gated by recipient prefs, real actor"
```

---

### Task 8: Actions du portail client — courriel aux observateurs

**Files:**
- Modify: `app/src/screens/Portail.tsx`

**Interfaces:**
- Consumes: `sendEmail` (Task 1), `addNotif` avec `recipientIds` (Task 3).

- [ ] **Step 1: Cibler et emailer les 3 `addNotif` existants**

Pour chacun des 3 appels (`MessageModal.send`, l'approbation de livrable,
la demande de correction — lignes ~35, ~123, ~135 sur `origin/master`
actuel, à re-confirmer à l'implémentation), résoudre les observateurs du
projet/livrable concerné (via `getSections`/le `Task` livrable déjà
manipulé sur cet écran), passer `recipientIds`, et ajouter l'envoi
`sendEmail` correspondant à chaque observateur avec :
- `eventKey: 'comment'` pour le message et la demande de correction,
- `eventKey: 'approval'` pour l'approbation d'un livrable (kind
  `deliverableApproved`).

Suivre exactement le même pattern que la Tâche 6 (résoudre `watchers`,
exclure l'acteur, boucler `getTeamMembers()` pour retrouver l'email de
chaque id, `sendEmail(..., {eventKey, recipientUserId})`).

- [ ] **Step 2: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/Portail.tsx
git commit -m "feat(notifs): client-portal actions now email project watchers, not just in-app"
```

---

### Task 9: Section observateurs — composant partagé + intégration

**Files:**
- Create: `app/src/components/WatchersRow.tsx`
- Modify: `app/src/components/TaskPanel.tsx`
- Modify: `app/src/screens/DocumentReview.tsx`
- Modify: `app/src/screens/ImageReview.tsx`
- Modify: `app/src/screens/WebReview.tsx`
- Modify: `app/src/screens/ResourceDetail.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Produces: `<WatchersRow watchers={string[]} onAdd={(userId: string) => void} onRemove={(userId: string) => void} />` — composant purement présentationnel, chaque écran fournit ses propres callbacks (`updateTask`/`updateResource` selon le contexte, cohérent avec le pattern déjà établi partout ailleurs dans ce fichier — pas de store partagé pour l'écriture).

- [ ] **Step 1: Composant `WatchersRow.tsx`**

```tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SFAvatar, SFIcon } from './ui';
import { getTeamMembers } from '../data/teamStore';

export function WatchersRow({ watchers, onAdd, onRemove }: {
  watchers: string[];
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const members = getTeamMembers();
  const watcherMembers = members.filter(m => watchers.includes(m.id));
  const available = members.filter(m => !watchers.includes(m.id));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {t('watchers.label')}
      </span>
      {watcherMembers.map(m => (
        <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 6px 2px 2px', borderRadius: 20, background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
          <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} />
          <span style={{ fontSize: 11 }}>{m.name}</span>
          <button onClick={() => onRemove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 1 }}>
            <SFIcon name="x" size={11} />
          </button>
        </span>
      ))}
      <button onClick={e => { setAnchor(e.currentTarget.getBoundingClientRect()); setPickerOpen(o => !o); }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer' }}>
        <SFIcon name="plus" size={11} /> {t('watchers.add')}
      </button>
      {pickerOpen && anchor && createPortal(
        <>
          <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
          <div style={{ position: 'fixed', top: anchor.bottom + 4, left: anchor.left, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 5, boxShadow: '0 10px 32px rgba(0,0,0,0.5)', minWidth: 180, maxHeight: 260, overflowY: 'auto' }}>
            {available.length === 0 && <p style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-3)' }}>{t('watchers.none')}</p>}
            {available.map(m => (
              <button key={m.id} onClick={() => { onAdd(m.id); setPickerOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 9px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} />
                <span style={{ fontSize: 12 }}>{m.name}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
```

- [ ] **Step 2: Clés de traduction**

Ajouter dans `fr.json` et `en.json` (namespace `watchers`) :
```json
"watchers": {
  "label": "Observateurs",
  "add": "Ajouter",
  "none": "Tout le monde suit déjà"
}
```
(`"watchers": { "label": "Watchers", "add": "Add", "none": "Everyone is already watching" }` côté `en.json`.)

- [ ] **Step 3: Intégrer dans chaque écran, près des commentaires**

Dans `TaskPanel.tsx`, `DocumentReview.tsx`, `ImageReview.tsx`,
`WebReview.tsx`, `ResourceDetail.tsx` (sections comments — `ScriptCommentSidebar`/`DocumentView` incluses) : juste au-dessus de la liste
des commentaires, insérer :

```tsx
<WatchersRow
  watchers={task.watchers ?? []}  // ou resource.watchers selon l'écran
  onAdd={id => updateTask(projectId, task.id, { watchers: addWatcher(task.watchers, id) })}
  onRemove={id => updateTask(projectId, task.id, { watchers: (task.watchers ?? []).filter(w => w !== id) })}
/>
```

(Adapter `updateTask`/`task` en `updateResource`/`resource` selon l'écran
— `TaskPanel.tsx` seul manipule des `Task`, les 4 autres manipulent des
`Resource`.)

- [ ] **Step 4: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur nouvelle sur les 6 fichiers touchés.

- [ ] **Step 5: Test manuel**

Serveur de preview : ouvrir une tâche, confirmer que la section
observateurs affiche déjà le créateur/assigné (Tâche 5), ajouter un
commentaire depuis un autre compte démo et confirmer qu'il apparaît
automatiquement dans la liste, retirer quelqu'un manuellement et confirmer
que ça persiste après rechargement.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/WatchersRow.tsx app/src/components/TaskPanel.tsx app/src/screens/DocumentReview.tsx app/src/screens/ImageReview.tsx app/src/screens/WebReview.tsx app/src/screens/ResourceDetail.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(notifs): visible, editable watchers section near comments on every surface"
```

---

### Task 10: Nettoyage Paramètres → Notifications

**Files:**
- Modify: `app/src/data/notifPrefsStore.ts`

**Interfaces:**
- Produces: `NOTIF_EVENTS` réduit à 3 entrées (`comment`, `mention`, `approval`) — les 3 seules réellement câblées après ce chantier.

- [ ] **Step 1: Retirer les catégories mortes**

Dans `NOTIF_EVENTS`, retirer les entrées `version`, `status`, `deadline` —
aucun code ne produit ces types de notification à ce jour (vérifié par
grep avant ce chantier), leurs cases à cocher dans Paramètres sont
inertes et donnent une fausse impression de contrôle. `DEFAULTS` reste
correct automatiquement (dérivé de `NOTIF_EVENTS` par `Object.fromEntries`).

- [ ] **Step 2: Vérifier**

`npx tsc --noEmit -p app/tsconfig.app.json` → 0 erreur nouvelle. Vérifier
visuellement Paramètres → Notifications : seulement 3 lignes désormais.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/notifPrefsStore.ts
git commit -m "chore(notifs): remove dead notification-preference categories (version/status/deadline)"
```

---

## Vérification finale de bout en bout

Après la Tâche 10, avec deux comptes démo (ex. Léa Marchand et Thomas
Robert) dans deux onglets :
1. Léa crée une tâche assignée à Thomas → Thomas voit apparaître une
   notification, Léa non.
2. Thomas commente sans mention → Léa reçoit une notification (elle est
   observatrice par l'assignation... non, elle est la créatrice donc déjà
   observatrice) ; un troisième compte démo non lié ne voit rien.
3. Thomas mentionne Léa avec `@Léa` → Léa reçoit notification + (en
   session réelle uniquement) courriel, selon ses préférences.
4. Ajouter un commentaire sur une facture → les membres du projet lié
   reçoivent une notification (nouveau comportement, absent avant ce
   chantier).
5. Retirer Thomas de la liste d'observateurs sur cette tâche → son
   prochain commentaire ne notifie plus personne d'autre que les
   observateurs restants.
