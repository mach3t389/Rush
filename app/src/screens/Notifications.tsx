import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SFPill, SFAvatar } from '../components/ui';
import type { AppNotif, NotifKind } from '../data/notificationStore';
import {
  subscribeNotifs,
  getNotifHistory,
  markAllRead,
} from '../data/notificationStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'À l\'instant';
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  if (hours < 48) return 'Hier';
  const days = Math.floor(hours / 24);
  return `Il y a ${days} jours`;
}

function dayLabel(ts: number): string {
  const diff = Date.now() - ts;
  const h = diff / 3600000;
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

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── NotifRow ──────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'unread' | 'mentions' | 'comments';

function NotifRow({ notif, navigate }: { notif: AppNotif; navigate: (to: string) => void }) {
  const unread = !notif.read;
  const color  = ACTOR_COLOR[notif.actor] ?? '#5c3d8f';

  const handleAction = () => {
    if (notif.taskId)          navigate(`/projets/${notif.projectId}`);
    else if (notif.resourceId) navigate(`/projets/${notif.projectId}/ressources`);
  };

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
            onClick={handleAction}
            style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
          >
            {notif.taskId ? 'Voir la tâche →' : 'Voir la ressource →'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function Notifications() {
  const navigate = useNavigate();
  const [filter, setFilter]   = useState<FilterKey>('all');
  const [notifs, setNotifs]   = useState<AppNotif[]>(() => getNotifHistory());

  useEffect(() => subscribeNotifs(() => setNotifs(getNotifHistory())), []);

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Notifications</h1>
        <button
          onClick={() => markAllRead()}
          style={{ fontSize: 12, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border-2)', borderRadius: 9, padding: '6px 12px', cursor: 'pointer' }}
        >
          Tout marquer comme lu
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === f.key ? 'var(--surface-3)' : 'transparent', color: filter === f.key ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', gap: 8 }}>
          <p style={{ fontSize: 14 }}>Aucune notification</p>
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
    </div>
  );
}
