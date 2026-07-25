import { useParams } from 'react-router-dom';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { ProjetCalendrier } from '../ProjetCalendrier';

export function ClientProjectCalendrier() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ProjetCalendrier embedded projectIds={[projectId]} readOnly />
      </div>
    </div>
  );
}
