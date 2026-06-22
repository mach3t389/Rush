import { useState } from 'react';
import { FileBrowser } from './FichiersGlobal';
import { CalendrierGlobal } from './CalendrierGlobal';
import { SFIcon } from '../components/ui/SFIcon';

const TABS = [
  { id: 'fichiers'    as const, label: 'Fichiers',   icon: 'hard-drive' },
  { id: 'calendrier' as const, label: 'Calendrier', icon: 'calendar'   },
];

export function VueGlobale() {
  const [tab, setTab] = useState<'fichiers' | 'calendrier'>('fichiers');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, display: 'flex', gap: 0, padding: '0 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '12px 18px',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-3)',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              cursor: 'pointer', fontFamily: 'var(--ff-text)',
              transition: 'color 0.12s',
            }}
          >
            <SFIcon name={t.icon} size={14} color={tab === t.id ? 'var(--text)' : 'var(--text-3)'} />
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'fichiers'    && <FileBrowser />}
        {tab === 'calendrier'  && <CalendrierGlobal />}
      </div>
    </div>
  );
}
