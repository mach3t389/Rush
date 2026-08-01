# Notifications — corriger les trous restants — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 3 vrais trous identifiés par l'audit post-chantier
"watchers" : le bouton "en-app" des préférences ne fait rien, un cas limite
peut faire perdre des observateurs sur une ressource pas encore chargée, et
les factures n'ont ni détection des @mentions ni interface d'observateurs
(contrairement à toutes les autres entités). Volontairement hors scope :
les 2 notifications "diffusées à tout le monde" (stockage plein,
approbation finale) — confirmé comme un choix voulu, pas un bug.

**Architecture:** (1) Filtrer par préférence "en-app" à la lecture plutôt
qu'à l'écriture — un seul point (`getNotifs()`), s'applique aux deux
sessions. (2) Ajouter le même garde-fou déjà en place côté tâches au
branchement ressource de `resolveWatchers`. (3) Extraire la détection de
mentions de `commentNotify.ts` en un petit helper exporté, réutilisé par
`financeStore.ts` ; ajouter `<WatchersRow>` à l'onglet Commentaires des
factures.

**Tech Stack:** React 19 + TypeScript, Supabase.

## Global Constraints

- Pattern démo/réel existant à respecter partout.
- Ne jamais notifier l'auteur de sa propre action.
- Aucune chaîne d'interface en dur — passer par `t('namespace.key')`.
- Vérification : `npx tsc --noEmit -p app/tsconfig.app.json` (ou la forme
  `node_modules/.bin/tsc` si `npx` échoue à résoudre, workaround déjà
  documenté dans les tâches précédentes de ce chantier) → 0 erreur.

---

### Task 1: Le bouton "en-app" des préférences doit vraiment filtrer

**Files:**
- Modify: `app/src/data/notificationStore.ts`

**Interfaces:**
- Consumes: `loadNotifPrefs()` (déjà exporté par `app/src/data/notifPrefsStore.ts`), `getCurrentUser()` (`app/src/data/authStore.ts`).

- [ ] **Step 1: Filtrer par préférence "en-app" dans `getNotifs()`**

`getNotifs()` est le point de lecture unique consulté par tous les getters
publics (`getUnreadForTask`, `getUnreadForResource`, `getNotifHistory`,
etc.) — un seul filtre ici couvre tout, session démo et réelle. Remplacer :

```typescript
function getNotifs(): AppNotif[] {
  if (isDemoSession()) return _demoNotifs;
  ensureFetchStarted();
  return _supabaseNotifs;
}
```

par :

```typescript
function getNotifs(): AppNotif[] {
  const raw = (() => {
    if (isDemoSession()) return _demoNotifs;
    ensureFetchStarted();
    return _supabaseNotifs;
  })();
  // Le bouton "en-app" des préférences (Paramètres → Notifications) était
  // stocké mais jamais consulté — activer/désactiver ce canal ne changeait
  // rien. Filtrer ici, au point de lecture unique, couvre tous les
  // getters publics d'un coup sans dupliquer le filtre partout.
  const prefs = loadNotifPrefs();
  return raw.filter(n => prefs[n.kind as string]?.inapp !== false);
}
```

Ajouter `import { loadNotifPrefs } from './notifPrefsStore';` en haut du
fichier.

- [ ] **Step 2: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 3: Test manuel**

Serveur de preview : dans Paramètres → Notifications, désactiver "en-app"
pour Commentaires. Faire commenter une tâche depuis un autre compte démo
avec un compte qui vous a comme observateur. Confirmer que la notification
n'apparaît plus dans le flux (cloche/Activité), alors qu'un courriel reste
possible si ce canal-là est encore actif séparément.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/notificationStore.ts
git commit -m "fix(notifs): make the in-app preference toggle actually filter notifications"
```

---

### Task 2: Ne pas perdre d'observateurs sur une ressource pas encore chargée

**Files:**
- Modify: `app/src/data/commentNotify.ts`

**Interfaces:**
- Aucune signature publique changée — `resolveWatchers` reste interne à ce fichier.

- [ ] **Step 1: Ajouter le même garde-fou que la branche tâche, côté ressource**

Le branchement tâche de `resolveWatchers` protège déjà contre le cas où
`getSections(projectId)` renvoie `[]` parce que le fetch n'a pas fini
(pas seulement parce que le projet est vide). Le branchement ressource n'a
pas cette protection : si `getResources()` n'a pas fini de charger, la
ressource visée n'est pas trouvée, `current` vaut `[]` alors que la vraie
liste d'observateurs en base peut être non vide — le commit qui suit
écrase alors les observateurs déjà enregistrés avec seulement l'auteur et
les personnes mentionnées dans CE commentaire.

Remplacer le branchement ressource actuel :

```typescript
  if (resourceId) {
    const resource = getResources().find(r => r.id === resourceId);
    return {
      current: resource?.watchers ?? [],
      commit: next => updateResource(resourceId, { watchers: next }),
    };
  }
```

par :

```typescript
  if (resourceId) {
    const resources = getResources();
    const resource = resources.find(r => r.id === resourceId);
    // Même garde que la branche tâche ci-dessus : resources.length===0 est
    // ambigu entre "aucune ressource" et "le fetch n'a pas fini" — dans le
    // doute, ne pas committer plutôt que d'écraser une liste d'observateurs
    // déjà en base avec une liste tronquée basée sur un cache vide.
    if (resources.length === 0) {
      console.warn('[commentNotify] resolveWatchers: resources not loaded yet, skipping watcher commit to avoid dropping existing watchers', { resourceId });
      return { current: [], commit: () => {} };
    }
    return {
      current: resource?.watchers ?? [],
      commit: next => updateResource(resourceId, { watchers: next }),
    };
  }
```

- [ ] **Step 2: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/commentNotify.ts
git commit -m "fix(notifs): avoid dropping resource watchers when the resource cache hasn't loaded yet"
```

---

### Task 3: Factures — détection des @mentions + observateurs visibles

**Files:**
- Modify: `app/src/data/commentNotify.ts` (exporter un helper de résolution de mentions)
- Modify: `app/src/data/financeStore.ts`
- Modify: `app/src/screens/Finances.tsx`

**Interfaces:**
- Produces (dans `commentNotify.ts`): `export function resolveMentionedMembers(text: string): TeamMemberInfo[]` — extrait la logique de détection déjà présente dans `notifyComment` (actuellement une fonction interne `mentionedNames` + un `.map/.find` inline), pour que `financeStore.ts` puisse détecter les mentions sans dupliquer la regex.
- Consumes (dans `financeStore.ts`): `resolveMentionedMembers` (nouveau), `addWatcher`/`addWatchers` (déjà importés), `TeamMemberInfo` (type déjà utilisé via `getTeamMembers()`).
- Consumes (dans `Finances.tsx`): `WatchersRow` (`app/src/components/WatchersRow.tsx`, déjà utilisé ailleurs dans l'app — même pattern, aucune modification du composant lui-même).

- [ ] **Step 1: Extraire et exporter la résolution de mentions dans `commentNotify.ts`**

Remplacer la fonction interne `mentionedNames` et son usage par une
fonction exportée qui fait le travail complet (regex + résolution contre
`getTeamMembers()`) :

```typescript
export function resolveMentionedMembers(text: string): ReturnType<typeof getTeamMembers> {
  const matches = text.match(/@([A-Za-zÀ-ÿ]+(?:\s[A-Za-zÀ-ÿ]+)?)/g) ?? [];
  const names = matches.map(m => m.slice(1).trim());
  const members = getTeamMembers();
  return names
    .map(name => members.find(m => m.name.toLowerCase() === name.toLowerCase()))
    .filter((m): m is NonNullable<typeof m> => !!m);
}
```

Dans `notifyComment`, remplacer l'appel à l'ancienne `mentionedNames(text)`
+ résolution inline par un appel à `resolveMentionedMembers(text)`, et
garder `mentionNames.length > 0` équivalent à
`mentionedMembers.length > 0` pour décider `kind: 'mention'` vs
`'comment'` (adapter les variables locales en conséquence — lire le fichier
actuel avant d'éditer pour matcher exactement les noms de variables déjà
en place, ne pas deviner).

- [ ] **Step 2: Utiliser la détection de mentions dans `addInvoiceComment` — `financeStore.ts`**

Remplacer :

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
      `<p>${escapeHtml(comment.author)} a commenté la facture « ${escapeHtml(inv.title)} » :</p><p>${escapeHtml(comment.text)}</p>`,
      { eventKey: 'comment', recipientUserId: member.id }
    );
  }
}
```

par :

```typescript
export function addInvoiceComment(invoiceId: string, comment: InvoiceComment, authorId?: string): void {
  const inv = getInvoices().find(i => i.id === invoiceId);
  if (!inv) return;
  const mentionedMembers = resolveMentionedMembers(comment.text);
  const watchers = addWatchers(inv.watchers, [authorId, ...mentionedMembers.map(m => m.id)]);
  updateInvoice(invoiceId, { comments: [...(inv.comments ?? []), comment], watchers });

  const recipientIds = watchers.filter(id => id !== authorId);
  const isMention = mentionedMembers.length > 0;
  addNotif({
    kind: isMention ? 'mention' : 'comment',
    actor: comment.author,
    text: isMention
      ? `vous a mentionné dans la facture « ${inv.title} »`
      : `a commenté la facture « ${inv.title} »`,
    timestamp: Date.now(),
    projectId: inv.projectId,
    recipientIds,
  });

  if (isDemoSession()) return;
  const members = getTeamMembers();
  const eventKey = isMention ? 'mention' : 'comment';
  const subject = isMention
    ? `${comment.author} vous a mentionné dans la facture « ${inv.title} »`
    : `${comment.author} a commenté la facture « ${inv.title} »`;
  for (const id of recipientIds) {
    const member = members.find(m => m.id === id);
    if (!member?.email) continue;
    void sendEmail(
      member.email,
      subject,
      `<p>${escapeHtml(comment.author)} ${isMention ? 'vous a mentionné dans' : 'a commenté'} la facture « ${escapeHtml(inv.title)} » :</p><p>${escapeHtml(comment.text)}</p>`,
      { eventKey, recipientUserId: member.id }
    );
  }
}
```

Ajouter `import { resolveMentionedMembers } from './commentNotify';` en
haut du fichier (vérifier qu'il n'y a pas d'import circulaire —
`commentNotify.ts` n'importe pas `financeStore.ts`, donc c'est sûr).

- [ ] **Step 3: Ajouter `<WatchersRow>` à l'onglet Commentaires — `Finances.tsx`**

Dans le bloc `{tab === 'comments' && (...)}`, juste avant
`{invoice.comments?.map(c => (...))}`, ajouter :

```tsx
<WatchersRow
  watchers={invoice.watchers ?? []}
  onAdd={id => updateInvoice(invoice.id, { watchers: addWatcher(invoice.watchers, id) })}
  onRemove={id => updateInvoice(invoice.id, { watchers: (invoice.watchers ?? []).filter(w => w !== id) })}
/>
```

Importer `WatchersRow` depuis `../components/WatchersRow`, et
`addWatcher` depuis `../data/watchers` (vérifier les imports déjà présents
dans le fichier avant d'ajouter des doublons — `updateInvoice` est déjà
importé pour d'autres usages dans ce fichier, confirmer le nom exact).

- [ ] **Step 4: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle sur les 3
fichiers touchés.

- [ ] **Step 5: Test manuel**

Serveur de preview : ouvrir une facture, onglet Commentaires. Confirmer
que la section Observateurs apparaît au-dessus des commentaires, qu'on
peut y ajouter/retirer quelqu'un manuellement, et que commenter avec
`@Nom` crée bien une notification de type mention (pas juste "a commenté")
pour la personne mentionnée.

- [ ] **Step 6: Commit**

```bash
git add app/src/data/commentNotify.ts app/src/data/financeStore.ts app/src/screens/Finances.tsx
git commit -m "feat(notifs): invoice comments now support @mentions and a visible watchers list"
```
