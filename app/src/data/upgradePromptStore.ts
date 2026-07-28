// app/src/data/upgradePromptStore.ts
// Singleton "show the upgrade modal" state, same pattern as toastStore.ts.

import { PLAN_LIMITS, getStorageLimitGB, type GatedFeature, type PlanKey } from './planFeatures';
import { getProjects } from './projectStore';
import { getTotalStorageUsedBytes, isStorageOverLimit } from './storageStore';
import { getCurrentPlan, getCurrentStorageTier } from './planStore';

export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' } | { reason: 'projects' } | { reason: 'membersGratuit' } | { reason: 'storage' };

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

export function canUploadFile(): boolean {
  const usedBytes = getTotalStorageUsedBytes();
  const limitGB = getStorageLimitGB(getCurrentPlan(), getCurrentStorageTier());
  if (isStorageOverLimit(usedBytes, limitGB)) {
    requestUpgrade({ reason: 'storage' });
    return false;
  }
  return true;
}

// Shared plan-limit gate for "Nouveau projet" — used both by ProjectsListView's
// own button and by Projets.tsx's header button, so the check only lives in
// one place instead of being duplicated between the standalone /projets page
// and this component embedded in a client's Projets tab.
export function canCreateNewProject(plan: PlanKey): boolean {
  const maxProjects = PLAN_LIMITS[plan].maxProjects;
  const activeCount = getProjects().filter(p => !p.archived).length;
  if (maxProjects !== null && activeCount >= maxProjects) {
    requestUpgrade({ reason: 'projects' });
    return false;
  }
  return true;
}
