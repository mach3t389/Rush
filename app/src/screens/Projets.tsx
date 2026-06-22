import { ProjectsListView } from '../components/ProjectsListView';

export function Projets() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <ProjectsListView />
      </div>
    </div>
  );
}
