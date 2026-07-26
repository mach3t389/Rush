import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../ui';
import { getMyClientProjects, type ClientProject } from '../../data/clientSessionStore';
import { getPreviewClientProjects } from '../../data/viewAsClientDataStore';
import { getViewAsUser } from '../../data/viewAsStore';

export function ClientProjectHeader({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [project, setProject] = useState<ClientProject | null>(null);
  const viewAs = getViewAsUser();
  const isPreview = viewAs?.type === 'external';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = isPreview
        ? await getPreviewClientProjects(viewAs!.clientId!)
        : await getMyClientProjects();
      if (!cancelled) setProject(list.find(p => p.id === projectId) ?? null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isPreview]);

  const base = isPreview ? `/apercu-client/${viewAs!.clientId}/projets/${projectId}` : `/mon-espace/projets/${projectId}`;
  const backTarget = isPreview ? `/apercu-client/${viewAs!.clientId}` : '/mon-espace';

  const tabs = [
    { label: t('clientProject.tabOverview'), path: base,                 end: true },
    { label: t('clientProject.tabFiles'),    path: `${base}/fichiers`,   end: false },
    { label: t('clientProject.tabCalendar'), path: `${base}/calendrier`, end: false },
    { label: t('clientProject.tabFinance'),  path: `${base}/finances`,   end: false },
  ];

  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <button
        onClick={() => navigate(backTarget)}
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
