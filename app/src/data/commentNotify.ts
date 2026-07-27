// Real notifications for comment activity — shared by every comment surface
// (RevisionCommentSidebar-backed editors and TaskPanel) so "someone
// commented/replied/@mentioned you" behaves identically everywhere.

import { addNotif } from './notificationStore';
import { getCurrentUser, isDemoSession } from './authStore';
import { USERS } from './mock';
import { getTeamMembers } from './teamStore';
import { getStudioInfo } from './studioStore';
import { sendEmail } from './emailStore';

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

// Fires a 'mention' notification when the comment text contains at least one
// @mention, otherwise a generic 'comment' notification, and emails whichever
// team members were actually @mentioned (best-effort name match — skipped
// entirely in demo sessions since there's no real recipient address).
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

  if (isDemoSession() || mentions.length === 0) return;
  const members = getTeamMembers();
  const studioName = getStudioInfo().name || 'Rush';
  const link = projectId && resourceId
    ? `${window.location.origin}/projets/${projectId}/ressources/${resourceId}?focus=comments`
    : window.location.href;
  for (const mention of mentions) {
    const member = members.find(m => m.name.toLowerCase() === mention.toLowerCase());
    if (!member?.email) continue;
    void sendEmail(
      member.email,
      `${actor} vous a mentionné dans « ${itemLabel} »`,
      `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <p><strong>${actor}</strong> vous a mentionné sur <strong>${studioName}</strong> :</p>
        <p style="color: #555; font-style: italic;">« ${text} »</p>
        <p><a href="${link}" style="display: inline-block; padding: 10px 20px; background: #f9ff00; color: #14140a; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le commentaire</a></p>
      </div>`,
      { eventKey: 'mention', recipientUserId: member.id }
    );
  }
}
