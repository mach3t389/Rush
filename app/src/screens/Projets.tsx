import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectsListView } from '../components/ProjectsListView';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { usePlan } from '../data/planStore';
import { canCreateNewProject } from '../data/upgradePromptStore';
import { PageHeader, SFButton } from '../components/ui';

export function Projets() {
  const { t } = useTranslation();
  const plan = usePlan();
  const [projects, setProjects] = useState(getProjects);
  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);
  const [autoOpen, setAutoOpen] = useState(false);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.countsSummary', {
          total: projects.length,
          active: projects.filter(p => p.status !== 'ok' && p.status !== 'neutral').length,
          late: projects.filter(p => p.status === 'danger').length,
        })}
        actions={<SFButton variant="primary" icon="plus" onClick={() => { if (canCreateNewProject(plan)) setAutoOpen(true); }}>{t('projects.newProject')}</SFButton>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <ProjectsListView showHeader={false} autoOpen={autoOpen} onModalClose={() => setAutoOpen(false)} />
      </div>
    </div>
  );
}
