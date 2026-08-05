// Session notification store.
// Tracks unread counts per task and per resource.
// Components subscribe for reactive updates.
//
// Demo sessions: unchanged localStorage behavior — a single shared list,
// exactly as before this migration.
// Real sessions: notifications are shared studio-wide (everyone sees the
// same feed), but read/unread state is tracked PER USER via the
// `notification_reads` join table — one person marking something read does
// not affect anyone else's unread count.

import { PROJECT_TASKS } from './mock';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { loadNotifPrefs } from './notifPrefsStore';

const STORAGE_KEY = 'sf_notifs';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifKind = 'comment' | 'mention' | 'status' | 'annotation' | 'version' | 'approval' | 'invitation' | 'deliverableApproved' | 'storageLimit' | 'taskCompleted';

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
  commentId?: string;
  recipientIds: string[];
  /** Id de l'auteur de CET appel à addNotif — jamais persisté (voir toRow),
   * utilisé uniquement en mémoire le temps de l'appel pour que mergeNotif
   * puisse exclure l'acteur courant de l'union des destinataires. */
  actorId?: string;
  /** Nom de l'item affiché entre guillemets dans le texte (ex. le titre
   * d'une ressource) — séparé du texte final pour pouvoir régénérer la
   * phrase quand plusieurs événements se fusionnent en une notification. */
  itemLabel?: string;
  /** Noms distincts des personnes impliquées, la plus récente activité
   * en premier — sert à composer "Sarah et 2 autres ont commenté". */
  actorNames?: string[];
  /** Nombre d'événements fusionnés dans cette notification (1 = simple). */
  count?: number;
}

// ── Seed data (demo sessions only) ──────────────────────────────────────────────

function seedNotifs(): AppNotif[] {
  const notifs: AppNotif[] = [];
  let idx = 0;

  // Seed from task activityCount values in mock data
  const allTasks = Object.values(PROJECT_TASKS).flat().flatMap(g => g.tasks);
  const taskMessages: Record<NotifKind, string[]> = {
    comment:    ['a laissé un commentaire', 'a répondu à votre message', 'a posé une question'],
    mention:    ['vous a mentionné', 'a mentionné l\'équipe'],
    status:     ['a changé le statut', 'a mis à jour la priorité'],
    annotation: ['a ajouté une annotation'],
    version:    ['a uploadé une nouvelle version'],
    approval:   ['a demandé une approbation'],
    invitation: [], // jamais généré par ce seed — les notifs d'invitation viennent d'InvitationAccept.tsx
    deliverableApproved: [], // jamais généré par ce seed — vient de Portail.tsx handleApprove
    storageLimit: [], // jamais généré par ce seed — vient de storageStore.checkStorageThreshold
    taskCompleted: [], // jamais généré par ce seed — vient de taskStore.updateTask
  };
  const actors = ['Sarah Martin', 'Thomas Robert', 'Julie Bernard', 'Marc Dufour'];

  for (const task of allTasks) {
    const count = (task as any).activityCount ?? 0;
    for (let i = 0; i < count; i++) {
      const kind: NotifKind = i % 3 === 0 ? 'comment' : i % 3 === 1 ? 'mention' : 'status';
      const msgs = taskMessages[kind];
      notifs.push({
        id: `tn-${idx++}`,
        kind,
        actor: actors[i % actors.length],
        text: msgs[i % msgs.length],
        timestamp: Date.now() - i * 3_600_000,
        read: false,
        taskId: task.id,
        projectId: task.projectId,
        recipientIds: [],
        count: 1,
      });
    }
  }

  // Seed some resource notifications — projectId must match the project the resource belongs to
  const resourceNotifs: { resourceId: string; projectId: string; count: number }[] = [
    { resourceId: 'r2', projectId: 'pj1', count: 3 }, // Rough Cut vidéo → 3 annotations
    { resourceId: 'r1', projectId: 'pj1', count: 2 }, // Scénario → 2 commentaires
    { resourceId: 'r5', projectId: 'pj1', count: 1 }, // Notes tournage J1 → 1 mise à jour
  ];
  for (const { resourceId, projectId, count } of resourceNotifs) {
    for (let i = 0; i < count; i++) {
      const kind: NotifKind = i % 2 === 0 ? 'annotation' : 'comment';
      notifs.push({
        id: `rn-${idx++}`,
        kind,
        actor: actors[i % actors.length],
        text: kind === 'annotation' ? 'a ajouté une annotation' : 'a commenté la ressource',
        timestamp: Date.now() - i * 7_200_000,
        read: false,
        resourceId,
        projectId,
        recipientIds: [],
        count: 1,
      });
    }
  }

  return notifs;
}

// ── Demo-session working set ─────────────────────────────────────────────────
let _demoNotifs: AppNotif[] = loadPersisted(STORAGE_KEY, seedNotifs());
function persistDemo(): void { savePersisted(STORAGE_KEY, _demoNotifs); }

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseNotifs: AppNotif[] = [];
let _supabaseFetchStarted = false;

const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(fn => fn()); }

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

async function fetchSupabaseNotifs(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: notifRows, error: notifError } = await supabase
      .from('notifications')
      .select('id, kind, actor, text, timestamp, task_id, resource_id, project_id, client_id, recipient_ids, item_label, actor_names, count')
      .eq('studio_id', studioId)
      .order('timestamp', { ascending: false });

    if (notifError) { console.error('fetchSupabaseNotifs failed', notifError); return; }

    let readIds = new Set<string>();
    if (user) {
      const { data: readRows, error: readError } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', user.id);
      if (readError) { console.error('fetchSupabaseNotifs (reads) failed', readError); return; }
      readIds = new Set((readRows as { notification_id: string }[]).map(r => r.notification_id));
    }

    _supabaseNotifs = (notifRows as NotificationRow[])
      .filter(row => !user || row.recipient_ids.includes(user.id))
      .map(row => toNotif(row, readIds.has(row.id)));
    notify();
  } catch (err) {
    console.error('fetchSupabaseNotifs failed', err);
  }
}

function ensureFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseNotifs();
}

export function resetNotificationsCache(): void {
  _supabaseNotifs = [];
  _supabaseFetchStarted = false;
}

onLogout(resetNotificationsCache);

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

async function addSupabaseNotif(notif: AppNotif): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('notifications').upsert(toRow(notif, studioId));
  if (error) { console.error('addSupabaseNotif failed', error); return; }
  await fetchSupabaseNotifs();
}

async function markSupabaseRead(ids: string[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('notification_reads').upsert(
    ids.map(id => ({ user_id: user.id, notification_id: id }))
  );
  if (error) { console.error('markSupabaseRead failed', error); return; }
  await fetchSupabaseNotifs();
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function subscribeNotifs(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getUnreadForTask(taskId: string): AppNotif[] {
  return getNotifs().filter(n => n.taskId === taskId && !n.read);
}

export function getUnreadForResource(resourceId: string): AppNotif[] {
  return getNotifs().filter(n => n.resourceId === resourceId && !n.read);
}

export function getUnreadForProject(projectId: string): AppNotif[] {
  return getNotifs().filter(n => n.projectId === projectId && !n.read);
}

export function getUnreadTaskCountForProject(projectId: string): number {
  return getNotifs().filter(n => n.taskId && n.projectId === projectId && !n.read).length;
}

export function getUnreadResourceCountForProject(projectId: string): number {
  return getNotifs().filter(n => n.resourceId && n.projectId === projectId && !n.read).length;
}

export function markTaskRead(taskId: string): void {
  if (isDemoSession()) {
    _demoNotifs = _demoNotifs.map(n => n.taskId === taskId ? { ...n, read: true } : n);
    persistDemo();
    notify();
    return;
  }
  const idsToMark = _supabaseNotifs.filter(n => n.taskId === taskId && !n.read).map(n => n.id);
  if (idsToMark.length === 0) return;
  _supabaseNotifs = _supabaseNotifs.map(n => idsToMark.includes(n.id) ? { ...n, read: true } : n);
  notify();
  void markSupabaseRead(idsToMark);
}

export function markResourceRead(resourceId: string): void {
  if (isDemoSession()) {
    _demoNotifs = _demoNotifs.map(n => n.resourceId === resourceId ? { ...n, read: true } : n);
    persistDemo();
    notify();
    return;
  }
  const idsToMark = _supabaseNotifs.filter(n => n.resourceId === resourceId && !n.read).map(n => n.id);
  if (idsToMark.length === 0) return;
  _supabaseNotifs = _supabaseNotifs.map(n => idsToMark.includes(n.id) ? { ...n, read: true } : n);
  notify();
  void markSupabaseRead(idsToMark);
}

export function markAllProjectRead(projectId: string): void {
  if (isDemoSession()) {
    _demoNotifs = _demoNotifs.map(n => n.projectId === projectId ? { ...n, read: true } : n);
    persistDemo();
    notify();
    return;
  }
  const idsToMark = _supabaseNotifs.filter(n => n.projectId === projectId && !n.read).map(n => n.id);
  if (idsToMark.length === 0) return;
  _supabaseNotifs = _supabaseNotifs.map(n => idsToMark.includes(n.id) ? { ...n, read: true } : n);
  notify();
  void markSupabaseRead(idsToMark);
}

export function markAllRead(): void {
  if (isDemoSession()) {
    _demoNotifs = _demoNotifs.map(n => ({ ...n, read: true }));
    persistDemo();
    notify();
    return;
  }
  const idsToMark = _supabaseNotifs.filter(n => !n.read).map(n => n.id);
  if (idsToMark.length === 0) return;
  _supabaseNotifs = _supabaseNotifs.map(n => ({ ...n, read: true }));
  notify();
  void markSupabaseRead(idsToMark);
}

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
//
// ⚠️ Session démo : on cherche dans `_demoNotifs` BRUT, pas `getNotifs()`.
// `getNotifs()` filtre par préférences "en-app" de l'utilisateur courant —
// un mauvais filtre ici masquerait des lignes pourtant groupables.
//
// Fenêtre de regroupement : un commentaire reste "groupable" tant qu'il a
// été créé il y a moins de GROUP_WINDOW_MS, indépendamment de son état lu
// (voir `findGroupableNotifReal` plus bas pour la raison précise, côté
// session réelle, pour laquelle l'état lu ne peut pas servir de critère —
// le même critère temporel est appliqué aux deux chemins pour rester
// cohérent entre démo et réel).
const GROUP_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 heures

function findGroupableNotifDemo(notif: Omit<AppNotif, 'id' | 'read'>): AppNotif | undefined {
  if (notif.kind !== 'comment' || !notif.itemLabel) return undefined;
  const ctx = notif.taskId ?? notif.resourceId;
  if (!ctx) return undefined;
  return _demoNotifs.find(n =>
    n.kind === 'comment' &&
    (n.taskId ?? n.resourceId) === ctx &&
    Date.now() - n.timestamp < GROUP_WINDOW_MS
  );
}

// Session réelle : `getNotifs()`/`_supabaseNotifs` sont structurellement les
// mauvaises sources ici — l'auteur d'un nouveau commentaire est
// explicitement EXCLU de `recipientIds` (voir commentNotify.ts), donc son
// propre cache local (peuplé en filtrant sur `recipient_ids.includes(user.id)`)
// ne contient jamais la ligne à fusionner pour le cas standard (deux
// personnes différentes qui commentent le même item). On interroge donc
// Supabase directement, sans filtre destinataire ni préférence utilisateur.
//
// Critère de groupage : PAS basé sur `notification_reads`. RLS sur cette
// table est `user_id = auth.uid()` — l'utilisateur qui exécute cette requête
// est l'AUTEUR du commentaire (l'acteur), qui est par construction exclu de
// `recipientIds`. Il ne peut donc jamais voir les lignes `notification_reads`
// des vrais destinataires : la requête serait structurellement vide à chaque
// fois, ce qui ferait toujours passer le critère "non lue" — un vieux
// commentaire déjà entièrement lu serait silencieusement ressuscité. On
// utilise donc une fenêtre temporelle (GROUP_WINDOW_MS) à la place, cohérente
// avec le chemin démo ci-dessus.
async function findGroupableNotifReal(notif: Omit<AppNotif, 'id' | 'read'>): Promise<AppNotif | undefined> {
  if (notif.kind !== 'comment' || !notif.itemLabel) return undefined;
  const taskId = notif.taskId;
  const resourceId = notif.resourceId;
  if (!taskId && !resourceId) return undefined;

  const studioId = await getStudioId();
  let query = supabase
    .from('notifications')
    .select('id, kind, actor, text, timestamp, task_id, resource_id, project_id, client_id, recipient_ids, item_label, actor_names, count')
    .eq('studio_id', studioId)
    .eq('kind', 'comment')
    .order('timestamp', { ascending: false })
    .limit(5);
  query = taskId ? query.eq('task_id', taskId) : query.eq('resource_id', resourceId!);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return undefined;
  const rows = data as NotificationRow[];

  for (const row of rows) {
    if (Date.now() - row.timestamp < GROUP_WINDOW_MS) return toNotif(row, false);
  }
  return undefined;
}

function groupedText(actorNames: string[], itemLabel: string): string {
  if (actorNames.length <= 1) return `a commenté « ${itemLabel} »`;
  if (actorNames.length === 2) return `et ${actorNames[1]} ont commenté « ${itemLabel} »`;
  return `et ${actorNames.length - 1} autres ont commenté « ${itemLabel} »`;
}

function mergeNotif(existing: AppNotif, notif: Omit<AppNotif, 'id' | 'read'>): AppNotif {
  const actorNames = [notif.actor, ...(existing.actorNames ?? [existing.actor]).filter(a => a !== notif.actor)];
  return {
    ...existing,
    actor: notif.actor,
    actorNames,
    count: (existing.count ?? 1) + 1,
    text: groupedText(actorNames, notif.itemLabel!),
    timestamp: notif.timestamp,
    commentId: notif.commentId ?? existing.commentId,
    // Union, jamais un remplacement : si le set de destinataires a changé
    // entre deux commentaires, on garde tout le monde plutôt que de perdre
    // silencieusement quelqu'un déjà notifié. On retire ensuite l'auteur de
    // CE commentaire (notif.actorId) : sans ça, fusionner le commentaire de
    // Bob dans la notification de commentaire d'Alice réintroduit Bob comme
    // destinataire (il était présent dans `existing.recipientIds` en tant
    // que destinataire du commentaire d'Alice), et Bob se retrouve notifié
    // de son propre commentaire.
    recipientIds: [...new Set([...(existing.recipientIds ?? []), ...notif.recipientIds])]
      .filter(id => id !== notif.actorId),
    // Fusionner un nouvel événement dans une notification déjà lue doit la
    // refaire apparaître comme non lue — sinon le prochain commentaire
    // atterrit silencieusement dans une ligne déjà consommée, sans jamais
    // rallumer le badge. C'est la promesse centrale de la fonctionnalité
    // ("dès que tu la lis, le compteur repart à zéro"). Pour les sessions
    // démo, ce `read: false` suffit (champ unique partagé). Pour les
    // sessions réelles, l'état lu vit dans `notification_reads` (par
    // destinataire) — ce champ local ne fait que refléter l'optimistic
    // update ; voir `resolveRealAddNotif` pour la réinitialisation serveur
    // via la fonction `reset_notification_reads`.
    read: false,
  };
}

export function addNotif(notif: Omit<AppNotif, 'id' | 'read'>): void {
  if (isDemoSession()) {
    const existing = findGroupableNotifDemo(notif);
    if (existing) {
      const merged = mergeNotif(existing, notif);
      // Re-hoister en tête de liste plutôt que remplacer en place : `_demoNotifs`
      // est traité comme "plus récent en premier" partout où il est affiché,
      // et le chemin session réelle (resolveRealAddNotif) fait déjà remonter la
      // ligne fusionnée en tête — garder les deux chemins cohérents.
      _demoNotifs = [merged, ..._demoNotifs.filter(n => n.id !== merged.id)];
      persistDemo();
      notify();
      return;
    }
    const id = `user-${Date.now()}-${_demoNotifs.length}`;
    _demoNotifs = [{ ...notif, id, read: false }, ..._demoNotifs];
    persistDemo();
    notify();
    return;
  }

  // Session réelle : la décision fusion/nouvelle ligne dépend d'une requête
  // Supabase fraîche (findGroupableNotifReal, async) — addNotif() reste
  // synchrone pour tous les appelants existants, donc on insère d'abord une
  // ligne optimiste localement (comportement inchangé côté UI immédiate),
  // puis on résout la vraie décision en arrière-plan. Si une fusion est
  // trouvée, la ligne optimiste est retirée du cache local et remplacée par
  // la ligne fusionnée AVANT toute écriture Supabase — donc on n'insère
  // jamais la ligne optimiste orpheline en base. Le prochain
  // `fetchSupabaseNotifs()` (déclenché par `addSupabaseNotif`) fait
  // converger le cache local vers l'état serveur.
  const id = `user-${Date.now()}-${_supabaseNotifs.length}`;
  const optimistic: AppNotif = { ...notif, id, read: false };
  _supabaseNotifs = [optimistic, ..._supabaseNotifs];
  notify();

  // Sérialise la résolution par clé de regroupement (task/resource + kind)
  // pour éviter que deux commentaires rapprochés sur le même item ne
  // requêtent tous les deux "existe-t-il une ligne groupable ?" avant que
  // l'un des deux ait fini d'écrire — même pattern que `_writeQueues` /
  // `enqueueWrite` dans taskStore.ts.
  const groupKey = `${notif.taskId ?? notif.resourceId ?? optimistic.id}:${notif.kind}`;
  const previous = _resolveQueues[groupKey] ?? Promise.resolve();
  const run = () => resolveRealAddNotif(notif, optimistic);
  _resolveQueues[groupKey] = previous.then(run, run);
}

const _resolveQueues: Record<string, Promise<void>> = {};

async function resolveRealAddNotif(notif: Omit<AppNotif, 'id' | 'read'>, optimistic: AppNotif): Promise<void> {
  try {
    const existing = await findGroupableNotifReal(notif);
    if (existing) {
      const merged = mergeNotif(existing, notif);
      _supabaseNotifs = _supabaseNotifs
        .filter(n => n.id !== optimistic.id)
        .map(n => n.id === merged.id ? merged : n);
      if (!_supabaseNotifs.some(n => n.id === merged.id)) {
        _supabaseNotifs = [merged, ..._supabaseNotifs];
      }
      notify();
      await addSupabaseNotif(merged); // upsert sur existing.id
      // `merged` porte déjà `read: false` localement, mais l'état lu réel
      // vit dans `notification_reads` (une ligne par destinataire). RLS sur
      // cette table est `user_id = auth.uid()` : un appel client normal ne
      // peut jamais effacer la ligne de lecture d'UN AUTRE utilisateur, donc
      // impossible de "dé-lire" pour les autres destinataires depuis ici.
      // `reset_notification_reads` est une fonction Postgres SECURITY
      // DEFINER (voir migration) qui fait exactement ça, avec vérification
      // que l'appelant appartient au studio propriétaire. Best-effort : un
      // échec ici ne doit jamais faire perdre le contenu déjà sauvegardé.
      try {
        const { error: resetError } = await supabase.rpc('reset_notification_reads', { notif_id: existing.id });
        if (resetError) console.error('reset_notification_reads failed', resetError);
      } catch (resetErr) {
        console.error('reset_notification_reads failed', resetErr);
      }
      return;
    }
    await addSupabaseNotif(optimistic);
  } catch (err) {
    // Toute erreur (getStudioId, requête réseau, etc.) ne doit jamais faire
    // disparaître silencieusement la notification : on retombe sur l'insert
    // simple de la ligne optimiste plutôt que de perdre l'événement.
    console.error('resolveRealAddNotif failed, falling back to plain insert', err);
    void addSupabaseNotif(optimistic);
  }
}

export function getNotifHistory(taskId?: string, resourceId?: string): AppNotif[] {
  return getNotifs().filter(n =>
    (taskId ? n.taskId === taskId : true) &&
    (resourceId ? n.resourceId === resourceId : true)
  ).sort((a, b) => b.timestamp - a.timestamp);
}

// Every real notification for a single project, newest first — backs the
// real (non-demo) "Activité récente" feed (see activityAdapter.ts), which
// used to return an empty array for every real account.
export function getNotifHistoryForProject(projectId: string): AppNotif[] {
  return getNotifs().filter(n => n.projectId === projectId).sort((a, b) => b.timestamp - a.timestamp);
}
