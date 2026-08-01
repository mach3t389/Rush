// Real notifications for comment activity — shared by every comment surface
// (RevisionCommentSidebar-backed editors and TaskPanel) so "someone
// commented/replied/@mentioned you" behaves identically everywhere instead
// of each screen inventing its own (or, until now, no) notification.
//
// The comment's author and any @mentioned team members are auto-added as
// watchers of the task/resource being commented on; the notification and
// the follow-up emails then target that watcher list (minus the author),
// each email gated by the recipient's own notif_prefs.

import { addNotif } from './notificationStore';
import { getCurrentUser } from './authStore';
import { getTeamMembers } from './teamStore';
import { sendEmail } from './emailStore';
import { isDemoSession } from './authStore';
import { addWatchers } from './watchers';
import { getSections, updateTask as updateTaskStore } from './taskStore';
import { getResources, updateResource } from './resourceStore';
import { USERS } from './mock';
import { escapeHtml } from './htmlEscape';

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
  itemLabel: string; // e.g. resource title or task title, shown in the notification text
  resourceId?: string;
  taskId?: string;
  projectId?: string;
}

// Résout la liste actuelle d'observateurs d'une tâche ou d'une ressource,
// et la fonction pour la réécrire — les deux stores ont une forme de
// mutation différente (updateTask prend project+task id, updateResource
// prend un patch direct), d'où ce petit bout de branchement plutôt qu'une
// interface commune artificielle.
function resolveWatchers(taskId?: string, resourceId?: string, projectId?: string): { current: string[]; commit: (next: string[]) => void } {
  if (taskId && projectId) {
    const sections = getSections(projectId);
    const task = sections.flatMap(s => s.tasks).find(t => t.id === taskId);
    // Guard against a data-loss race: getSections() returns [] synchronously
    // both when the project genuinely has no sections AND when the
    // background fetch hasn't resolved yet. updateTaskStore()/setSections()
    // does a full delete-then-reinsert of the project's sections+tasks, so
    // committing a watcher change while sections===[] would silently wipe
    // every real section/task for this project the moment the fetch had
    // simply not landed yet. Skip the commit in that case — the watcher
    // change is lost for this one comment, but nothing gets destroyed.
    if (sections.length === 0) {
      console.warn('[commentNotify] resolveWatchers: sections not loaded yet for project, skipping watcher commit to avoid clobbering', { projectId, taskId });
      return { current: task?.watchers ?? [], commit: () => {} };
    }
    return {
      current: task?.watchers ?? [],
      commit: next => updateTaskStore(projectId, taskId, { watchers: next }),
    };
  }
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
  if (taskId || resourceId) {
    console.warn('[commentNotify] resolveWatchers: no target matched (taskId without projectId?), watchers will not be resolved', { taskId, resourceId, projectId });
  }
  return { current: [], commit: () => {} };
}

// Fires a 'mention' notification when the comment text contains at least
// one @mention, otherwise a generic 'comment' notification — mirrors how
// most comment tools notify (mentioned people get a targeted ping;
// otherwise it's just an activity signal). The notification and any
// follow-up emails target the item's watchers (auto-including the author
// and any newly-mentioned members), not the whole studio.
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
  const html = `<p>${escapeHtml(actor)} ${mentionNames.length > 0 ? 'vous a mentionné dans' : verb} « ${escapeHtml(itemLabel)} » :</p><p>${escapeHtml(text)}</p>`;

  for (const id of recipientIds) {
    const member = members.find(m => m.id === id);
    if (!member?.email) continue;
    void sendEmail(member.email, subject, html, { eventKey, recipientUserId: member.id });
  }
}
