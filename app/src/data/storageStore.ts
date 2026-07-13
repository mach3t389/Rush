// app/src/data/storageStore.ts
// Aggregates real disk/bucket usage across every storage pool in the app —
// currently fileStore (Fichiers/R2, the vast majority of real bytes) and
// resourceContentStore (document bodies, review comments, checklists, etc.).
// Single place to extend if a new storage pool is ever added, so the sidebar
// bar and the billing page's bar never drift apart.

import { getStorageUsedBytes, subscribeFileStore } from './fileStore';
import { getResourceContentSizeBytes, subscribeResourceContent } from './resourceContentStore';

export function getTotalStorageUsedBytes(): number {
  return getStorageUsedBytes() + getResourceContentSizeBytes();
}

export function subscribeStorageUsage(fn: () => void): () => void {
  const unsubFiles = subscribeFileStore(fn);
  const unsubContent = subscribeResourceContent(fn);
  return () => { unsubFiles(); unsubContent(); };
}
