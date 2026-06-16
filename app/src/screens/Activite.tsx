import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SFPill, SFAvatar } from '../components/ui';
import { ACTIVITY } from '../data/mock';
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

function dayLabel(ts: number): string {
  const h = (Date.now() - ts) / 3600000;
  if (h < 24)  return "Aujourd'hui";
  if (h < 48)  return 'Hier';
  if (h < 168) return 'Cette semaine';
  return 'Plus tôt';
}

const KIND_LABEL: Record<NotifKind, string> = {
  comment:    'COMMENTAIRE',
  mention:    'MENTION',
  status:     'STATUT',
  annotation: 'ANNOTATION',
  version:    'NOUVELLE VERSION',
};

import type { Status } from '../types';
const KIND_STATUS: Record<NotifKind, Status> = {
  comment:    'review',
  mention:    'info',
  status:     'warn',
  annotation: 'info',
  version:    'info',
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
  };
  const verb = verbMap[kind];
  if (actors.length === 1) return `${actors[0]} ${verb}`;
  if (actors.length === 2) return `${actors[0]} et ${actors[1]} ${verb}`;
  return `${actors[0]}, ${actors[1]} +${actors.length - 2} ${verb}`;
}

// ── Notification group row ────────────────────────────────────────────────────

function NotifGroupRow({ group, navigate }: { group: NotifGroup; navigate: (to: string) => void }) {
  const { unread, actors, kind, count, latestTimestamp, taskId, resourceId, projectId } = group;

  const handleClick = () => {
    if (taskId)     navigate(`/projets/${projectId}`);
    else if (resourceId) navigate(`/projets/${projectId}/ressources`);
  };

  return (
    <div
      onClick={taskId || resourceId ? handleClick : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px',
        borderRadius: 9,
        background: unread ? 'var(--surface-2)' : 'transparent',
        borderLeft: unread ? '2px solid var(--accent)' : '2px solid transparent',
        cursor: taskId || resourceId ? 'pointer' : 'default',
        marginBottom: 2,
      }}
    >
      {unread
        ? <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }} />
        : <div style={{ width: 6, flexShrink: 0 }} />
      }

      {/* Stacked avatars if multiple actors */}
      <div style={{ position: 'relative', width: 24, height: 24, flexShrink: 0 }}>
        <SFAvatar initials={initials(actors[0])} bg={ACTOR_COLOR[actors[0]] ?? '#5c3d8f'} size={24} />
        {actors.length > 1 && (
          <div style={{
            position: 'absolute', bottom: -3, right: -5,
            width: 16, height: 16, borderRadius: '50%',
            background: ACTOR_COLOR[actors[1]] ?? '#3b4f8f',
            border: '1px solid var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 700, color: '#fff',
          }}>{initials(actors[1])}</div>
        )}
      </div>

      <p style={{ flex: 1, fontSize: 12, lineHeight: 1.3, color: unread ? 'var(--text)' : 'var(--text-2)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {actorSummary(actors, count, kind)}
      </p>

      {count > 1 && (
        <span style={{
          fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)',
          background: 'var(--surface-3)', borderRadius: 5, padding: '1px 5px', flexShrink: 0,
        }}>{count}</span>
      )}
      <SFPill status={KIND_STATUS[kind]} small>{KIND_LABEL[kind]}</SFPill>
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{timeAgo(latestTimestamp)}</span>
    </div>
  );
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ item, isLast }: { item: typeof ACTIVITY[number]; isLast: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: isLast ? 'none' : '1px solid var(--border)', marginBottom: 0 }}>
      <SFAvatar initials={item.actor.initials} bg={item.actor.avatarColor} size={24} />
      <p style={{ flex: 1, fontSize: 12, lineHeight: 1.3, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <strong>{item.actor.name}</strong>{' '}{item.action}{' '}
        <span style={{ color: 'var(--text-2)' }}>{item.target}</span>
        {item.detail && <span style={{ color: 'var(--text-3)' }}> — {item.detail}</span>}
      </p>
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{item.time}</span>
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

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Activité</h1>
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
        <>
          <div style={{ display: 'flex', gap: 4 }}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === f.key ? 'var(--surface-3)' : 'transparent', color: filter === f.key ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {groups.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              Aucune notification
            </div>
          )}

          {grouped.map(({ day, groups: dayGroups }) => (
            <div key={day}>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
                {day}
              </p>
              {dayGroups.map(g => (
                <NotifGroupRow key={g.key} group={g} navigate={navigate} />
              ))}
            </div>
          ))}
        </>
      )}

      {/* Tab: Studio */}
      {tab === 'studio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {ACTIVITY.map((item, i) => (
            <ActivityRow key={item.id} item={item} isLast={i === ACTIVITY.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
