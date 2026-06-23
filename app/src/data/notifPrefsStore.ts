// Préférences de notification (par type d'événement × canal).
// Persistées en localStorage. Sans backend, le canal "email" est déclaratif ;
// le canal "in-app" pourra plus tard piloter le filtrage du notificationStore.

import { loadPersisted, savePersisted } from './persist';

const STORAGE_KEY = 'sf_notif_prefs';

export interface ChannelPrefs { inapp: boolean; email: boolean }
export type NotifPrefs = Record<string, ChannelPrefs>;

export const NOTIF_EVENTS: { key: string; label: string; desc: string; icon: string }[] = [
  { key: 'comment',  label: 'Commentaires',            desc: "Quand quelqu'un commente une ressource ou une tâche", icon: 'message-square' },
  { key: 'mention',  label: 'Mentions',                desc: 'Quand on vous mentionne directement',                 icon: 'at-sign' },
  { key: 'approval', label: "Demandes d'approbation",  desc: "Quand une approbation vous est demandée",              icon: 'shield-check' },
  { key: 'version',  label: 'Nouvelles versions',      desc: "Quand une nouvelle version d'une ressource est ajoutée", icon: 'git-branch' },
  { key: 'status',   label: 'Changements de statut',   desc: "Quand le statut d'une tâche ou ressource change",      icon: 'refresh-cw' },
  { key: 'deadline', label: 'Échéances',               desc: 'Rappels avant les dates de livraison',                 icon: 'calendar-clock' },
];

// Défauts : tout en in-app ; email seulement pour mentions + approbations.
const DEFAULTS: NotifPrefs = Object.fromEntries(
  NOTIF_EVENTS.map(e => [e.key, { inapp: true, email: e.key === 'mention' || e.key === 'approval' }])
);

export function loadNotifPrefs(): NotifPrefs {
  const saved = loadPersisted<NotifPrefs | null>(STORAGE_KEY, null);
  // Fusion avec les défauts pour rester robuste si de nouveaux types apparaissent.
  return { ...DEFAULTS, ...(saved ?? {}) };
}

export function saveNotifPrefs(prefs: NotifPrefs): void {
  savePersisted(STORAGE_KEY, prefs);
}
