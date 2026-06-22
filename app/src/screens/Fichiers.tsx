import { useParams } from 'react-router-dom';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { FileBrowser } from './FichiersGlobal';

export function Fichiers() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0 }}>
        <ProjectHeaderBar projectId={projectId} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FileBrowser
          initialNav={{ scope: 'project', scopeId: projectId, folderId: null }}
          locked
          key={projectId}
        />
      </div>
    </div>
  );
}
