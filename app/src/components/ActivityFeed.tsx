import { useState } from 'react';
import { SFAvatar, SFIcon } from './ui';

// Flux d'activité réutilisable — même interface pour le global ("Studio") et la fiche client.
// La seule différence est la liste fournie (déjà filtrée par le contexte).

export interface FeedActivity {
  id: string;
  day: string;
  type: string;
  actorName: string;
  actorInitials: string;
  actorColor: string;
  action: string;
  target: string;
  detail?: string;
  time: string;
  projectName?: string;
  projectColor?: string;
}

const ACTIVITY_ICON: Record<string, { icon: string; color: string; bg: string }> = {
  task:    { icon: 'check-circle',   color: '#1a6b4a', bg: 'rgba(26,107,74,0.15)'  },
  upload:  { icon: 'cloud-upload',   color: '#3b4f8f', bg: 'rgba(59,79,143,0.15)'  },
  comment: { icon: 'message-circle', color: '#5c3d8f', bg: 'rgba(92,61,143,0.15)'  },
  approve: { icon: 'check-circle',   color: '#1a6b4a', bg: 'rgba(26,107,74,0.15)'  },
  client:  { icon: 'user',           color: '#7d4e57', bg: 'rgba(125,78,87,0.15)'  },
  invoice: { icon: 'file-text',      color: '#a85f3e', bg: 'rgba(168,95,62,0.15)'  },
  member:  { icon: 'user-plus',      color: '#2a7a8a', bg: 'rgba(42,122,138,0.15)' },
};
const FALLBACK_META = { icon: 'activity', color: 'var(--text-3)', bg: 'var(--surface-3)' };

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  task: 'Tâches', upload: 'Fichiers', comment: 'Commentaires', approve: 'Approbations',
  client: 'Portail', invoice: 'Facturation', member: 'Équipe',
};

// Ordre canonique des filtres ; on n'affiche que les types présents dans les données.
const TYPE_ORDER = ['task', 'upload', 'comment', 'approve', 'invoice', 'client', 'member'];
const WEEK_DAYS = ["Aujourd'hui", 'Hier', 'Il y a 3 j'];

export function ActivityFeed({ activities }: { activities: FeedActivity[] }) {
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? activities : activities.filter(a => a.type === filter);

  const weekCount = activities.filter(a => WEEK_DAYS.includes(a.day)).length;
  const typeCounts = activities.reduce<Record<string, number>>((acc, a) => { acc[a.type] = (acc[a.type] ?? 0) + 1; return acc; }, {});
  const maxTypeCount = Math.max(1, ...Object.values(typeCounts));
  const contributors = Object.values(
    activities.reduce<Record<string, { name: string; initials: string; color: string; count: number }>>((acc, a) => {
      acc[a.actorName] = acc[a.actorName] ?? { name: a.actorName, initials: a.actorInitials, color: a.actorColor, count: 0 };
      acc[a.actorName].count += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count).slice(0, 5);

  const byDay = filtered.reduce<Record<string, FeedActivity[]>>((acc, a) => {
    (acc[a.day] = acc[a.day] ?? []).push(a);
    return acc;
  }, {});
  const days = Object.keys(byDay);

  const presentTypes = TYPE_ORDER.filter(t => typeCounts[t]);
  const filterOptions: { key: string; label: string }[] = [
    { key: 'all', label: 'Tout' },
    ...presentTypes.map(t => ({ key: t, label: ACTIVITY_TYPE_LABEL[t] ?? t })),
  ];

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Left: feed */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
          {filterOptions.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: filter === f.key ? 'var(--accent)' : 'var(--surface-2)',
              color: filter === f.key ? 'var(--on-accent)' : 'var(--text-2)', fontFamily: 'var(--ff-text)',
            }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Activity feed */}
        {days.length === 0 && (
          <p style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>Aucune activité pour ce filtre.</p>
        )}
        {days.map(day => (
          <div key={day} style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>{day}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {byDay[day].map(item => {
                const meta = ACTIVITY_ICON[item.type] ?? FALLBACK_META;
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <SFIcon name={meta.icon} size={14} color={meta.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <SFAvatar name={item.actorName} initials={item.actorInitials} color={item.actorColor} size={18} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.actorName}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.action}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{item.target}</span>
                      </div>
                      {(item.detail || item.projectName) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          {item.projectName && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                              <i style={{ width: 6, height: 6, borderRadius: '50%', background: item.projectColor, display: 'block' }} />
                              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{item.projectName}</span>
                            </span>
                          )}
                          {item.detail && (
                            <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{item.detail}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }}>{item.time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Right: summary panel */}
      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
        {/* Activity volume */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Résumé d'activité</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 9, background: 'var(--surface-2)' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{weekCount}</p>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 5 }}>Cette semaine</p>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 9, background: 'var(--surface-2)' }}>
              <p style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{activities.length}</p>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 5 }}>Total</p>
            </div>
          </div>
        </div>

        {/* Breakdown by type */}
        {presentTypes.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Répartition</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {presentTypes
                .sort((a, b) => typeCounts[b] - typeCounts[a])
                .map(type => {
                  const meta = ACTIVITY_ICON[type] ?? FALLBACK_META;
                  return (
                    <button key={type} onClick={() => setFilter(f => f === type ? 'all' : type)}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%', opacity: filter === 'all' || filter === type ? 1 : 0.4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0, display: 'block' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-2)', width: 88, flexShrink: 0 }}>{ACTIVITY_TYPE_LABEL[type] ?? type}</span>
                      <span style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-3)', position: 'relative', overflow: 'hidden' }}>
                        <span style={{ position: 'absolute', inset: 0, width: `${(typeCounts[type] / maxTypeCount) * 100}%`, background: meta.color, borderRadius: 3 }} />
                      </span>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', width: 14, textAlign: 'right', flexShrink: 0 }}>{typeCounts[type]}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Top contributors */}
        {contributors.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Contributeurs</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contributors.map(c => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SFAvatar name={c.name} initials={c.initials} color={c.color} size={26} />
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text)' }}>{c.name}</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 5 }}>{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
