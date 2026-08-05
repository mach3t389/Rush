// Per-user "last viewed" timestamp per task — powers the task comment
// badge's unread state (Travail.tsx/Taches.tsx/TravailBoard.tsx). Follows
// the same demo-vs-real-session split as notifPrefsStore.ts/pinnedStore.ts:
// personal preference data, scoped by the authenticated user's own id.

import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { supabase } from './supabaseClient';
import type { TaskComment } from '../types';

const STORAGE_KEY = 'sf_task_comment_reads';

// ── Demo-session state ──────────────────────────────────────────────────────
let _reads: Record<string, number> = loadPersisted<Record<string, number>>(STORAGE_KEY, {});

// ── Real-session in-memory cache ────────────────────────────────────────────
let _realReads: Record<string, number> = {};
let _fetchStarted = false;

async function fetchTaskCommentReads(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('task_comment_reads')
    .select('task_id, last_viewed_at')
    .eq('user_id', user.id);

  if (error) { console.error('fetchTaskCommentReads failed', error); return; }

  _realReads = Object.fromEntries((data ?? []).map(row => [row.task_id as string, new Date(row.last_viewed_at as string).getTime()]));
  notify();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchTaskCommentReads();
}

async function saveTaskCommentRead(taskId: string, viewedAt: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('task_comment_reads').upsert({
    user_id: user.id,
    task_id: taskId,
    last_viewed_at: new Date(viewedAt).toISOString(),
  });
  if (error) console.error('saveTaskCommentRead failed', error);
}

function resetTaskCommentReadsCache(): void {
  _realReads = {};
  _fetchStarted = false;
}
onLogout(resetTaskCommentReadsCache);

const _listeners = new Set<() => void>();
const notify = () => _listeners.forEach(fn => fn());

export function getLastViewed(taskId: string): number {
  if (isDemoSession()) return _reads[taskId] ?? 0;
  ensureFetchStarted();
  return _realReads[taskId] ?? 0;
}

export function markTaskViewed(taskId: string): void {
  const now = Date.now();
  if (isDemoSession()) {
    _reads = { ..._reads, [taskId]: now };
    savePersisted(STORAGE_KEY, _reads);
    notify();
    return;
  }
  _realReads = { ..._realReads, [taskId]: now };
  notify();
  void saveTaskCommentRead(taskId, now);
}

export function subscribeTaskCommentReads(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Unread computation ──────────────────────────────────────────────────────
// A comment/reply with no createdAt (pre-existing data from before comments
// tracked timestamps) is never counted as unread — there's no way to know
// when it was written, so treating it as unread would show a false badge on
// every old task the first time this ships.

export function countTotalComments(comments: TaskComment[] | undefined): number {
  if (!comments) return 0;
  return comments.length + comments.reduce((sum, c) => sum + c.replies.length, 0);
}

export function countUnreadComments(comments: TaskComment[] | undefined, lastViewed: number): number {
  if (!comments) return 0;
  let count = 0;
  for (const c of comments) {
    if (c.createdAt && c.createdAt > lastViewed) count++;
    for (const r of c.replies) {
      if (r.createdAt && r.createdAt > lastViewed) count++;
    }
  }
  return count;
}
