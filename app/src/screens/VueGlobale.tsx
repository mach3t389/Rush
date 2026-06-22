import { useState } from 'react';
import { FileBrowser, StatsView } from './FichiersGlobal';
import { CalendrierGlobal } from './CalendrierGlobal';
import { SFIcon } from '../components/ui/SFIcon';
import { getFiles } from '../data/fileStore';
import { getProjects } from '../data/projectStore';
import { getClients } from '../data/clientStore';
import type { NavLocation } from './FichiersGlobal';

const TABS = [
  { id: 'fichiers'      as const, label: 'Fichiers',       icon: 'hard-drive' },
  { id: 'calendrier'   as const, label: 'Calendrier',     icon: 'calendar'   },
  { id: 'statistiques' as const, label: 'Statistiques',   icon: 'bar-chart-2'},
];

export function VueGlobale() {
  const [tab, setTab] = useState<'fichiers' | 'calendrier' | 'statistiques'>('fichiers');
  const [statsNav, setStatsNav] = useState<NavLocation | null>(null);

  const handleStatsNavigate = (loc: NavLocation) => {
    setStatsNav(loc);
    setTab('fichiers');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
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

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'fichiers'      && <FileBrowser initialNav={statsNav ?? undefined} key={statsNav ? JSON.stringify(statsNav) : 'default'} />}
        {tab === 'calendrier'    && <CalendrierGlobal />}
        {tab === 'statistiques'  && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24, height: '100%', boxSizing: 'border-box' }}>
            <StatsView
              files={getFiles()}
              projects={getProjects()}
              clients={getClients()}
              onNavigate={handleStatsNavigate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
