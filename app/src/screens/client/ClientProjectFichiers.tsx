import { useParams } from 'react-router-dom';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { FileBrowser } from '../FichiersGlobal';

export function ClientProjectFichiers() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FileBrowser
          initialNav={{ scope: 'project', scopeId: projectId, folderId: null }}
          locked
          readOnly
          key={projectId}
        />
      </div>
    </div>
  );
}
