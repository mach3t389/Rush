import { loadPersisted, savePersisted } from './persist';

// Tracks unread comment counts per resourceId
type CommentCounts = Record<string, number>;

let counts: CommentCounts = loadPersisted<CommentCounts>('sf_comment_counts', {});

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export function incrementCommentCount(resourceId: string) {
  counts = { ...counts, [resourceId]: (counts[resourceId] ?? 0) + 1 };
  savePersisted('sf_comment_counts', counts);
  notify();
}

export function resetCommentCount(resourceId: string) {
  if (!counts[resourceId]) return;
  const { [resourceId]: _, ...rest } = counts;
  counts = rest;
  savePersisted('sf_comment_counts', counts);
  notify();
}

export function getCommentCount(resourceId: string): number {
  return counts[resourceId] ?? 0;
}

export function getAllCommentCounts(): CommentCounts {
  return counts;
}

export function subscribeCommentCounts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
