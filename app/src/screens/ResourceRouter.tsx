import { useParams } from 'react-router-dom';
import { getResources } from '../data/resourceStore';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { VideoReview } from './VideoReview';
import { ImageReview } from './ImageReview';
import { DocumentReview } from './DocumentReview';
import { WebReview } from './WebReview';
import { ResourceDetail } from './ResourceDetail';

export function ResourceRouter() {
  const { projectId, resourceId } = useParams();
  const resource = getResources().find(r => r.id === resourceId);

  let detail: React.ReactElement;
  if (resource?.type === 'video_review') {
    if (resource.mediaSubtype === 'photo') detail = <ImageReview />;
    else if (resource.mediaSubtype === 'file') detail = <DocumentReview />;
    else detail = <VideoReview />;
  } else if (resource?.type === 'web_review') {
    detail = <WebReview />;
  } else {
    detail = <ResourceDetail />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ProjectHeaderBar projectId={projectId ?? ''} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {detail}
      </div>
    </div>
  );
}
