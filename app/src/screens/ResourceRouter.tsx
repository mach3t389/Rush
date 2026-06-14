import { useParams } from 'react-router-dom';
import { getResources } from '../data/resourceStore';
import { VideoReview } from './VideoReview';
import { ImageReview } from './ImageReview';
import { DocumentReview } from './DocumentReview';
import { ResourceDetail } from './ResourceDetail';

export function ResourceRouter() {
  const { resourceId } = useParams();
  const resource = getResources().find(r => r.id === resourceId);
  if (resource?.type === 'video_review') {
    if (resource.mediaSubtype === 'photo') return <ImageReview />;
    if (resource.mediaSubtype === 'file') return <DocumentReview />;
    return <VideoReview />;
  }
  return <ResourceDetail />;
}
