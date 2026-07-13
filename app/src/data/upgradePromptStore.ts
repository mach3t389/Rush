// app/src/data/upgradePromptStore.ts
// Singleton "show the upgrade modal" state, same pattern as toastStore.ts.

import type { GatedFeature } from './planFeatures';

export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' } | { reason: 'projects' };

let current: UpgradeReason | null = null;
const listeners: (() => void)[] = [];
function notify() { listeners.forEach(l => l()); }

export function requestUpgrade(reason: UpgradeReason): void {
  current = reason;
  notify();
}

export function dismissUpgradePrompt(): void {
  current = null;
  notify();
}

export function getUpgradePrompt(): UpgradeReason | null {
  return current;
}

export function subscribeUpgradePrompt(fn: () => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
