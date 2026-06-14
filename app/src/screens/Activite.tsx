import { SFAvatar } from '../components/ui';
import { ACTIVITY } from '../data/mock';

const TYPE_ICON: Record<string, string> = {
  comment: '💬',
  upload: '⬆️',
  task: '✓',
  approve: '✅',
  client: '👤',
};

export function Activite() {
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Activité</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {ACTIVITY.map((item, i) => (
          <div key={item.id} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              <SFAvatar initials={item.actor.initials} bg={item.actor.avatarColor} size={32} />
              {i < ACTIVITY.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 6 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 8 }}>
              <p style={{ fontSize: 13, lineHeight: 1.4 }}>
                <strong>{item.actor.name}</strong> {item.action} <span style={{ color: 'var(--text-2)' }}>{item.target}</span>
              </p>
              {item.detail && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{item.detail}</p>}
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
