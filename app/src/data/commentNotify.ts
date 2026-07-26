// Real notifications for comment activity — shared by every comment surface
// (RevisionCommentSidebar-backed editors and TaskPanel) so "someone
// commented/replied/@mentioned you" behaves identically everywhere instead
// of each screen inventing its own (or, until now, no) notification.

import { addNotif } from './notificationStore';
import { getCurrentUser } from './authStore';
import { USERS } from './mock';

function actorName(): string {
  return getCurrentUser()?.name ?? USERS.lea.name;
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

// Fires a 'mention' notification when the comment text contains at least
// one @mention, otherwise a generic 'comment' notification — mirrors how
// most comment tools notify (mentioned people get a targeted ping;
// otherwise it's just an activity signal). Notifications in this app
// aren't per-recipient filtered (shared studio-wide feed, see
// notificationStore.ts), so one notification per comment is enough even
// when several people are mentioned at once.
export function notifyComment({ kind, text, itemLabel, resourceId, taskId, projectId }: NotifyCommentOpts): void {
  const actor = actorName();
  const verb = kind === 'reply' ? 'a répondu sur' : 'a commenté';
  const mentions = mentionedNames(text);

  addNotif({
    kind: mentions.length > 0 ? 'mention' : 'comment',
    actor,
    text: mentions.length > 0
      ? `vous a mentionné dans « ${itemLabel} »`
      : `${verb} « ${itemLabel} »`,
    timestamp: Date.now(),
    resourceId,
    taskId,
    projectId,
  });
}
