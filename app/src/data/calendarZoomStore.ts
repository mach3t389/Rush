// Préférence UI locale : hauteur d'une heure (en px) dans la grille horaire
// du calendrier (vues Semaine/Jour). Stockée en localStorage comme les
// autres préférences d'interface (premier jour de la semaine, couleur
// d'accent). Pas de backend.

import { loadPersisted, savePersisted } from './persist';

const KEY = 'sf_calendar_hour_height';

export const DEFAULT_HOUR_HEIGHT = 64;
export const MIN_HOUR_HEIGHT = 28;
export const MAX_HOUR_HEIGHT = 112;
const STEP = 12;

let current: number = loadPersisted<number>(KEY, DEFAULT_HOUR_HEIGHT);

const listeners: (() => void)[] = [];

function clamp(v: number): number {
  return Math.max(MIN_HOUR_HEIGHT, Math.min(MAX_HOUR_HEIGHT, v));
}

export function getHourHeight(): number {
  return current;
}

export function setHourHeight(v: number): void {
  current = clamp(v);
  savePersisted(KEY, current);
  listeners.forEach(l => l());
}

export function zoomIn(): void { setHourHeight(current + STEP); }
export function zoomOut(): void { setHourHeight(current - STEP); }

export function subscribeHourHeight(fn: () => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
