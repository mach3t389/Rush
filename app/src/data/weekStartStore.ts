// Préférence UI locale : premier jour de la semaine dans le calendrier.
// 0 = dimanche (défaut), 1 = lundi. Stockée en localStorage comme les autres
// préférences d'interface (couleur d'accent, polices). Pas de backend.

import { loadPersisted, savePersisted } from './persist';

export type WeekStart = 0 | 1; // 0 = dimanche, 1 = lundi

const KEY = 'sf_week_start';

let current: WeekStart = loadPersisted<WeekStart>(KEY, 0);

const listeners: (() => void)[] = [];

export function getWeekStart(): WeekStart {
  return current;
}

export function setWeekStart(v: WeekStart): void {
  current = v;
  savePersisted(KEY, v);
  listeners.forEach(l => l());
}

export function subscribeWeekStart(fn: () => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
