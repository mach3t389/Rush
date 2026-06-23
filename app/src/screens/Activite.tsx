import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SFPill, SFAvatar, SFIcon } from '../components/ui';
import { ACTIVITY } from '../data/mock';
import { ActivityFeed } from '../components/ActivityFeed';
import type { AppNotif, NotifKind } from '../data/notificationStore';
import { subscribeNotifs, getNotifHistory, markAllRead } from '../data/notificationStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "À l'instant";
  if (mins < 60)  return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  if (hours < 48) return 'Hier';
  return `Il y a ${Math.floor(hours / 24)} jours`;
}

const KIND_LABEL: Record<NotifKind, string> = {
  comment:    'COMMENTAIRE',
  mention:    'MENTION',
  status:     'STATUT',
  annotation: 'ANNOTATION',
  version:    'NOUVELLE VERSION',
  approval:   'APPROBATION',
};

import type { Status } from '../types';
const KIND_STATUS: Record<NotifKind, Status> = {
  comment:    'review',
  mention:    'info',
  status:     'warn',
  annotation: 'info',
  version:    'info',
  approval:   'review',
};

const ACTOR_COLOR: Record<string, string> = {
  'Sarah Martin':  '#3b4f8f',
  'Thomas Robert': '#5c3d8f',
  'Julie Bernard': '#1a6b4a',
  'Marc Dufour':   '#7d4e57',
};

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Grouping ──────────────────────────────────────────────────────────────────

interface NotifGroup {
  key: string;
  kind: NotifKind;
  actors: string[];       // unique, most-recent first
  count: number;
  latestTimestamp: number;
  unread: boolean;
  taskId?: string;
  resourceId?: string;
  projectId: string;
}

function groupNotifs(notifs: AppNotif[]): NotifGroup[] {
  const map = new Map<string, AppNotif[]>();

  for (const n of notifs) {
    const ctx = n.taskId ?? n.resourceId ?? 'global';
    // Mentions stay individual — they're always personal
    const k = n.kind === 'mention' ? `mention-${n.id}` : `${ctx}-${n.kind}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(n);
  }

  return Array.from(map.entries()).map(([, items]) => {
    const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
    const uniqueActors = [...new Set(sorted.map(n => n.actor))];
    return {
      key: sorted[0].id,
      kind: sorted[0].kind,
      actors: uniqueActors,
      count: items.length,
      latestTimestamp: sorted[0].timestamp,
      unread: items.some(n => !n.read),
      taskId: sorted[0].taskId,
      resourceId: sorted[0].resourceId,
      projectId: sorted[0].projectId,
    };
  }).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

function groupDayLabel(ts: number): string {
  const h = (Date.now() - ts) / 3600000;
  if (h < 24)  return "Aujourd'hui";
  if (h < 48)  return 'Hier';
  if (h < 168) return 'Cette semaine';
  return 'Plus tôt';
}

function actorSummary(actors: string[], count: number, kind: NotifKind): string {
  const verbMap: Record<NotifKind, string> = {
    comment:    count > 1 ? `ont laissé ${count} commentaires` : 'a commenté',
    mention:    'vous a mentionné',
    status:     'a mis à jour le statut',
    annotation: count > 1 ? `ont ajouté ${count} annotations` : 'a annoté',
    version:    'a uploadé une nouvelle version',
    approval:   'a demandé une approbation',
  };
  const verb = verbMap[kind];
  if (actors.length === 1) return `${actors[0]} ${verb}`;
  if (actors.length === 2) return `${actors[0]} et ${actors[1]} ${verb}`;
  return `${actors[0]}, ${actors[1]} +${actors.length - 2} ${verb}`;
}

// ── Notification group row ────────────────────────────────────────────────────

// Icône + couleurs par type de notification — même langage visuel que le flux d'activité (cartes).
const NOTIF_ICON: Record<NotifKind, { icon: string; color: string; bg: string }> = {
  comment:    { icon: 'message-circle', color: '#5c3d8f', bg: 'rgba(92,61,143,0.15)' },
  mention:    { icon: 'at-sign',        color: '#3b4f8f', bg: 'rgba(59,79,143,0.15)' },
  status:     { icon: 'flag',           color: '#a85f3e', bg: 'rgba(168,95,62,0.15)' },
  annotation: { icon: 'pen-line',       color: '#3b4f8f', bg: 'rgba(59,79,143,0.15)' },
  version:    { icon: 'cloud-upload',   color: '#1a6b4a', bg: 'rgba(26,107,74,0.15)' },
  approval:   { icon: 'shield-check',   color: '#5c3d8f', bg: 'rgba(92,61,143,0.15)' },
};

function NotifGroupRow({ group, navigate }: { group: NotifGroup; navigate: (to: string) => void }) {
  const { unread, actors, kind, count, latestTimestamp, taskId, resourceId, projectId } = group;
  const meta = NOTIF_ICON[kind] ?? NOTIF_ICON.comment;
  const clickable = !!(taskId || resourceId);

  const handleClick = () => {
    if (taskId)          navigate(`/projets/${projectId}?openTask=${taskId}&focus=comments`);
    else if (resourceId) navigate(`/projets/${projectId}/ressources/${resourceId}?focus=comments`);
  };

  return (
    <div
      onClick={clickable ? handleClick : undefined}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', borderRadius: 10,
        background: unread ? 'var(--surface-2)' : 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: unread ? '2px solid var(--accent)' : '1px solid var(--border)',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      {/* Icône type */}
      <div style={{ width: 30, height: 30, borderRadius: 8, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
        <SFIcon name={meta.icon} size={14} color={meta.color} />
      </div>
      {/* Contenu */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <SFAvatar initials={initials(actors[0])} bg={ACTOR_COLOR[actors[0]] ?? '#5c3d8f'} size={18} />
          <span style={{ fontSize: 12, color: unread ? 'var(--text)' : 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {actorSummary(actors, count, kind)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <SFPill status={KIND_STATUS[kind]} small>{KIND_LABEL[kind]}</SFPill>
          {count > 1 && (
            <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{count}×</span>
          )}
        </div>
      </div>
      {/* Temps */}
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }}>{timeAgo(latestTimestamp)}</span>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

type Tab = 'personal' | 'studio';
type FilterKey = 'all' | 'unread' | 'mentions' | 'comments';

export function Activite() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(tabParam === 'studio' ? 'studio' : 'personal');

  const [notifs, setNotifs] = useState<AppNotif[]>(() => getNotifHistory());
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => subscribeNotifs(() => setNotifs(getNotifHistory())), []);

  const switchTab = (t: Tab) => {
    setTab(t);
    setSearchParams(t === 'studio' ? { tab: 'studio' } : {}, { replace: true });
  };

  const unreadCount = notifs.filter(n => !n.read).length;

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',      label: `Toutes` },
    { key: 'unread',   label: `Non lues (${unreadCount})` },
    { key: 'mentions', label: 'Mentions' },
    { key: 'comments', label: 'Commentaires' },
  ];

  const filtered = notifs.filter(n => {
    if (filter === 'unread')   return !n.read;
    if (filter === 'mentions') return n.kind === 'mention';
    if (filter === 'comments') return n.kind === 'comment';
    return true;
  });

  // Group by context (task or resource) + kind, then split by day
  const groups = groupNotifs(filtered);
  const days = Array.from(new Set(groups.map(g => groupDayLabel(g.latestTimestamp))));
  const grouped = days.map(day => ({
    day,
    groups: groups.filter(g => groupDayLabel(g.latestTimestamp) === day),
  }));

  // Stats for the sidebar panel
  const kindCounts = notifs.reduce((acc, n) => {
    acc[n.kind] = (acc[n.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<NotifKind, number>);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Notifications</h1>
            {tab === 'personal' && unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                style={{ fontSize: 12, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border-2)', borderRadius: 9, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {([
              { key: 'personal' as Tab, label: 'Pour toi', badge: unreadCount },
              { key: 'studio'   as Tab, label: 'Studio',   badge: 0 },
            ]).map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                style={{
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
                  color: tab === key ? 'var(--text)' : 'var(--text-2)',
                  fontSize: 13, fontWeight: tab === key ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--ff-text)',
                  marginBottom: -1,
                }}
              >
                {label}
                {badge > 0 && (
                  <span style={{
                    background: 'var(--accent)', color: 'var(--on-accent)',
                    borderRadius: 999, fontSize: 9, fontWeight: 700,
                    padding: '1px 5px', fontFamily: 'var(--ff-mono)',
                  }}>{badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab: Pour toi */}
          {tab === 'personal' && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              {/* Colonne flux */}
              <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {FILTERS.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      style={{ padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filter === f.key ? 'var(--accent)' : 'var(--surface-2)', color: filter === f.key ? 'var(--on-accent)' : 'var(--text-2)', fontFamily: 'var(--ff-text)' }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {groups.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, paddingTop: 48 }}>
                    Aucune notification
                  </div>
                )}

                {grouped.map(({ day, groups: dayGroups }) => (
                  <div key={day} style={{ marginBottom: 8 }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
                      {day}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {dayGroups.map(g => (
                        <NotifGroupRow key={g.key} group={g} navigate={navigate} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Panneau latéral (notifications) — même position que celui de Studio */}
              <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 12 }}>Résumé</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--ff-display)', fontSize: 32, fontWeight: 700, color: unreadCount > 0 ? 'var(--accent)' : 'var(--text-3)', lineHeight: 1 }}>{unreadCount}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>non {unreadCount === 1 ? 'lue' : 'lues'}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{notifs.length} au total</p>
                </div>

                {notifs.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 12 }}>Par type</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(Object.entries(KIND_LABEL) as [NotifKind, string][]).filter(([k]) => kindCounts[k]).map(([k, label]) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label.charAt(0) + label.slice(1).toLowerCase()}</span>
                          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-3)', borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>{kindCounts[k]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Studio — même flux riche que la fiche client */}
          {tab === 'studio' && (
            <ActivityFeed activities={ACTIVITY.map(a => ({
              id: a.id,
              day: a.day,
              type: a.type ?? 'comment',
              actorName: a.actor.name,
              actorInitials: a.actor.initials,
              actorColor: a.actor.avatarColor,
              action: a.action,
              target: a.target,
              detail: a.detail,
              time: a.time,
            }))} />
          )}

      </div>
    </div>
  );
}
