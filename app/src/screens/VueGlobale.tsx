import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileBrowser } from './FichiersGlobal';
import { CalendrierGlobal } from './CalendrierGlobal';
import { Finances } from './Finances';
import { SFIcon } from '../components/ui/SFIcon';

const TABS = [
  { id: 'fichiers'   as const, labelKey: 'global.files',    icon: 'hard-drive' },
  { id: 'calendrier' as const, labelKey: 'global.calendar', icon: 'calendar'   },
  { id: 'finances'   as const, labelKey: 'global.finances', icon: 'receipt'    },
];

export function VueGlobale() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'fichiers' | 'calendrier' | 'finances'>('fichiers');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, display: 'flex', gap: 0, padding: '0 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {TABS.map(tabItem => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '12px 18px',
              border: 'none',
              borderBottom: tab === tabItem.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              color: tab === tabItem.id ? 'var(--text)' : 'var(--text-3)',
              fontSize: 13, fontWeight: tab === tabItem.id ? 600 : 400,
              cursor: 'pointer', fontFamily: 'var(--ff-text)',
              transition: 'color 0.12s',
            }}
          >
            <SFIcon name={tabItem.icon} size={14} color={tab === tabItem.id ? 'var(--text)' : 'var(--text-3)'} />
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'fichiers'   && <FileBrowser />}
        {tab === 'calendrier' && <CalendrierGlobal />}
        {tab === 'finances'   && <Finances />}
      </div>
    </div>
  );
}
