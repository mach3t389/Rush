// UI fonts (heading/body) — now delegated to studioPreferencesStore.
// This file exists for backward compatibility and to keep the single-concern
// responsibility clear: managing fonts specifically (not general preferences).
//
// Internally delegates to studioPreferencesStore, which handles the per-studio
// storage and synchronization.

import { setUiFonts, getStudioPreferences, subscribeStudioPreferences } from './studioPreferencesStore';

export interface UiFonts { heading: string; body: string }

// Backward-compatible getters/setters that delegate to studioPreferencesStore
export function loadUiFonts(): UiFonts {
  const prefs = getStudioPreferences();
  return prefs.uiFonts;
}

export function saveUiFonts(heading: string, body: string): void {
  setUiFonts(heading, body);
}

// Subscribe to font changes — delegates to studio preferences subscription
export function subscribeUiFonts(fn: () => void): () => void {
  return subscribeStudioPreferences(fn);
}

// For backward compatibility with existing consumers that may call this directly
// (though applyPersistedStudioPreferences in main.tsx is the primary bootstrap)
export function applyPersistedUiFonts(): void {
  const fonts = loadUiFonts();
  document.documentElement.style.setProperty('--ff-display', fonts.heading);
  document.documentElement.style.setProperty('--ff-text', fonts.body);
}
