// Turns real notifications (notificationStore.ts) into the FeedActivity shape
// ActivityFeed.tsx already knows how to render — used by both ProjectActivite.tsx
// (project-scoped) and Activite.tsx (studio-wide) so real accounts get an
// actual activity feed instead of an empty state.

import type { AppNotif, NotifKind } from './notificationStore';
import type { FeedActivity } from '../components/ActivityFeed';
import { getTeamMembers } from './teamStore';
import { findProject } from './projectStore';
import { isDemoSession } from './authStore';
import { USERS } from './mock';

// Maps the notification's own kind to the feed's coarser type buckets (used
// for the filter pills / breakdown chart) — see ACTIVITY_ICON in ActivityFeed.tsx.
const KIND_TO_TYPE: Record<NotifKind, string> = {
  comment: 'comment',
  mention: 'comment',
  annotation: 'comment',
  status: 'task',
  version: 'upload',
  approval: 'approve',
  deliverableApproved: 'approve',
  invitation: 'member',
  storageLimit: 'client',
  taskCompleted: 'task',
};

const AVATAR_COLORS = ['#3b4f8f', '#5c3d8f', '#1a6b4a', '#7d4e57', '#a85f3e', '#2a7a8a'];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

// Notification actors are just a free-text name (studio member, "Studio X",
// a client contact…) — best-effort match against the real team roster (or
// the demo USERS in demo sessions) for a consistent avatar; anyone else gets
// initials derived from their name with a stable (hashed) color.
function actorAvatar(actorName: string): { initials: string; color: string } {
  const team = isDemoSession() ? Object.values(USERS) : getTeamMembers();
  const match = team.find(m => m.name === actorName);
  if (match) return { initials: match.initials, color: match.avatarColor };
  return { initials: initialsOf(actorName), color: hashColor(actorName) };
}

function dayLabel(ts: number, t: (key: string) => string): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return t('activity.today');
  if (diffDays === 1) return t('activity.yesterday');
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function timeLabel(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('activity.now');
  if (mins < 60) return t('activity.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('activity.hoursAgo', { count: hours });
  const d = new Date(ts);
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
}

// AppNotif.text is a single free-text sentence (e.g. `vous a mentionné dans
// « Rough Cut »`) rather than FeedActivity's separate action/target — split
// on the guillemets the notif texts already consistently use so the target
// still renders with its own emphasis; falls back to the whole text as
// `action` with an empty target when there's no quoted part.
function splitActionTarget(text: string): { action: string; target: string } {
  const m = text.match(/^(.*?)«\s*(.+?)\s*»(.*)$/);
  if (!m) return { action: text, target: '' };
  return { action: (m[1] + m[3]).trim(), target: m[2] };
}

export function notifToFeedActivity(n: AppNotif, t: (key: string, opts?: Record<string, unknown>) => string): FeedActivity {
  const { initials, color } = actorAvatar(n.actor);
  const { action, target } = splitActionTarget(n.text);
  const project = n.projectId ? findProject(n.projectId) : undefined;
  return {
    id: n.id,
    day: dayLabel(n.timestamp, t),
    type: KIND_TO_TYPE[n.kind] ?? 'comment',
    actorName: n.actor,
    actorInitials: initials,
    actorColor: color,
    action,
    target,
    time: timeLabel(n.timestamp, t),
    projectName: project?.name,
    projectColor: project?.clientColor,
  };
}
