// Préférences de notification (par type d'événement × canal).
//
// Demo sessions: unchanged localStorage behavior, exactly as before this migration.
// Real sessions: backed by the `notif_prefs` table, scoped by the authenticated
// user's own id (auth.uid()) — the first table in this project scoped per-user
// rather than per-studio, since notification preferences are inherently personal.

import { isDemoSession } from './authStore';
import { supabase } from './supabaseClient';
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

// ── Real-session in-memory cache ────────────────────────────────────────────
let _prefs: NotifPrefs | null = null;
let _fetchStarted = false;

async function fetchSupabasePrefs(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('notif_prefs')
    .select('prefs')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('fetchSupabasePrefs failed', error); return; }

  _prefs = { ...DEFAULTS, ...((data?.prefs as NotifPrefs) ?? {}) };
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchSupabasePrefs();
}

async function saveSupabasePrefs(prefs: NotifPrefs): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('notif_prefs').upsert({ user_id: user.id, prefs, updated_at: new Date().toISOString() });
  if (error) console.error('saveSupabasePrefs failed', error);
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function loadNotifPrefs(): NotifPrefs {
  if (isDemoSession()) {
    const saved = loadPersisted<NotifPrefs | null>(STORAGE_KEY, null);
    return { ...DEFAULTS, ...(saved ?? {}) };
  }
  ensureFetchStarted();
  return _prefs ?? DEFAULTS;
}

export function saveNotifPrefs(prefs: NotifPrefs): void {
  if (isDemoSession()) {
    savePersisted(STORAGE_KEY, prefs);
    return;
  }
  _prefs = { ...DEFAULTS, ...prefs };
  void saveSupabasePrefs(prefs);
}
