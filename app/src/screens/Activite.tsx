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

// ── Notification row ──────────────────────────────────────────────────────────

function NotifRow({ notif, navigate }: { notif: AppNotif; navigate: (to: string) => void }) {
  const unread = !notif.read;
  const color  = ACTOR_COLOR[notif.actor] ?? '#5c3d8f';

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '14px 16px',
      borderRadius: 'var(--radius)',
      background: unread ? 'var(--surface-2)' : 'transparent',
      border: unread ? '1px solid var(--border)' : '1px solid transparent',
      borderLeft: unread ? '2px solid var(--accent)' : '2px solid transparent',
      marginBottom: 8,
    }}>
      {unread
        ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--info)', flexShrink: 0, marginTop: 5 }} />
        : <div style={{ width: 8, flexShrink: 0 }} />
      }
      <SFAvatar initials={initials(notif.actor)} bg={color} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, lineHeight: 1.4, color: unread ? 'var(--text)' : 'var(--text-2)' }}>
          <strong>{notif.actor}</strong>{' '}{notif.text}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <SFPill status={KIND_STATUS[notif.kind]} small>{KIND_LABEL[notif.kind]}</SFPill>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{timeAgo(notif.timestamp)}</span>
        </div>
        {(notif.taskId || notif.resourceId) && (
          <button
            onClick={() => notif.taskId ? navigate(`/projets/${notif.projectId}`) : navigate(`/projets/${notif.projectId}/ressources`)}
            style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
          >
            {notif.taskId ? 'Voir la tâche →' : 'Voir la ressource →'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ item, isLast }: { item: typeof ACTIVITY[number]; isLast: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <SFAvatar initials={item.actor.initials} bg={item.actor.avatarColor} size={32} />
        {!isLast && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 6 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 8 }}>
        <p style={{ fontSize: 13, lineHeight: 1.4 }}>
          <strong>{item.actor.name}</strong>{' '}{item.action}{' '}
          <span style={{ color: 'var(--text-2)' }}>{item.target}</span>
        </p>
        {item.detail && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{item.detail}</p>}
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{item.time}</p>
      </div>
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
    { key: 'all',      label: `Toutes (${notifs.length})` },
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

  const days    = Array.from(new Set(filtered.map(n => dayLabel(n.timestamp))));
  const grouped = days.map(day => ({
    day,
    notifications: filtered.filter(n => dayLabel(n.timestamp) === day),
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

          {filtered.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              Aucune notification
            </div>
          )}

          {grouped.map(group => (
            <div key={group.day}>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>
                {group.day}
              </p>
              {group.notifications.map(n => (
                <NotifRow key={n.id} notif={n} navigate={navigate} />
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
