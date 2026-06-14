import { useState } from 'react';
import { SFPill, SFAvatar } from '../components/ui';
import { NOTIFICATIONS } from '../data/mock';
import type { AppNotification } from '../types';

function NotifRow({ notif }: { notif: AppNotification }) {
  return (
    <div style={{
      display: 'flex',
      gap: 12,
      padding: '14px 16px',
      borderRadius: 'var(--radius)',
      background: notif.unread ? 'var(--surface-2)' : 'transparent',
      border: notif.unread ? '1px solid var(--border)' : '1px solid transparent',
      borderLeft: notif.unread ? '2px solid var(--accent)' : '2px solid transparent',
      marginBottom: 8,
    }}>
      {notif.unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--info)', flexShrink: 0, marginTop: 5 }} />}
      {!notif.unread && <div style={{ width: 8, height: 8, flexShrink: 0 }} />}
      <SFAvatar initials={notif.actor.initials} bg={notif.actor.avatarColor} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, lineHeight: 1.4, color: notif.unread ? 'var(--text)' : 'var(--text-2)' }}>
          <strong>{notif.actor.name}</strong>
          {' '}{notif.text}{' '}
          <strong>{notif.bold}</strong>
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <SFPill status={notif.typeStatus} small>{notif.type}</SFPill>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{notif.time}</span>
        </div>
        {notif.action && (
          <button style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
            {notif.action} →
          </button>
        )}
      </div>
    </div>
  );
}

export function Notifications() {
  const [filter, setFilter] = useState<'all' | 'unread' | 'mentions' | 'approvals' | 'comments'>('all');
  const unread = NOTIFICATIONS.filter(n => n.unread).length;

  const FILTERS = [
    { key: 'all' as const, label: `Toutes (${NOTIFICATIONS.length})` },
    { key: 'unread' as const, label: `Non lues (${unread})` },
    { key: 'mentions' as const, label: 'Mentions' },
    { key: 'approvals' as const, label: 'Approbations' },
    { key: 'comments' as const, label: 'Commentaires' },
  ];

  const allNotifs = NOTIFICATIONS.filter(n => {
    if (filter === 'unread') return n.unread;
    if (filter === 'approvals') return n.type === 'APPROBATION';
    if (filter === 'comments') return n.type === 'COMMENTAIRE';
    return true;
  });

  const days = Array.from(new Set(allNotifs.map(n => n.day)));
  const filtered = days.map(day => ({
    day,
    notifications: allNotifs.filter(n => n.day === day),
  }));

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Notifications</h1>
        <button style={{ fontSize: 12, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border-2)', borderRadius: 9, padding: '6px 12px', cursor: 'pointer' }}>
          Tout marquer comme lu
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === f.key ? 'var(--surface-3)' : 'transparent', color: filter === f.key ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.map(group => (
        <div key={group.day}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>
            {group.day}
          </p>
          {group.notifications.map(n => <NotifRow key={n.id} notif={n} />)}
        </div>
      ))}
    </div>
  );
}
