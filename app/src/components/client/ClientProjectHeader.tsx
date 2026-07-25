import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../ui';
import { getMyClientProjects, type ClientProject } from '../../data/clientSessionStore';

export function ClientProjectHeader({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [project, setProject] = useState<ClientProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getMyClientProjects();
      if (!cancelled) setProject(list.find(p => p.id === projectId) ?? null);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const tabs = [
    { label: t('clientProject.tabOverview'), path: `/mon-espace/projets/${projectId}`,             end: true },
    { label: t('clientProject.tabFiles'),    path: `/mon-espace/projets/${projectId}/fichiers`,     end: false },
    { label: t('clientProject.tabCalendar'), path: `/mon-espace/projets/${projectId}/calendrier`,   end: false },
    { label: t('clientProject.tabFinance'),  path: `/mon-espace/projets/${projectId}/finances`,     end: false },
  ];

  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <button
        onClick={() => navigate('/mon-espace')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10, fontFamily: 'var(--ff-text)' }}
      >
        <SFIcon name="chevron-left" size={13} color="var(--text-3)" />
        {t('clientProject.back')}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {project && <div style={{ width: 10, height: 10, borderRadius: '50%', background: project.clientColor, flexShrink: 0 }} />}
        <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--ff-display)', color: 'var(--text)' }}>
          {project?.name ?? '…'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
        {tabs.map(tab => (
          <NavLink key={tab.path} to={tab.path} end={tab.end} style={({ isActive }) => ({
            fontSize: 13, fontWeight: 500,
            color: isActive ? 'var(--text)' : 'var(--text-2)',
            textDecoration: 'none', paddingBottom: 6,
            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
          })}>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
