import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFButton, SFPill } from './ui';
import { addNotif } from '../data/notificationStore';
import { updateResource } from '../data/resourceStore';
import { addDeliverable, findLinkedDeliverable, subscribeStore, isSectionsLoading, updateTask } from '../data/taskStore';
import { getProjects } from '../data/projectStore';
import { USERS } from '../data/mock';
import { showToast } from '../data/toastStore';
import type { Resource, Status, DeliverableType, Task } from '../types';

function inferDeliverableType(resource: Resource): DeliverableType {
  if (resource.type === 'video_review') {
    if (resource.mediaSubtype === 'photo') return 'photo';
    if (resource.mediaSubtype === 'file') return 'document';
    if (resource.mediaSubtype === 'audio') return 'audio';
    return 'video';
  }
  if (resource.type === 'web_review') return 'web';
  if (resource.type === 'moodboard') return 'graphique';
  if (resource.type === 'document') return 'document';
  return 'autre';
}

// Demande d'approbation générique pour n'importe quelle ressource.
// → trouve ou crée le livrable (Task deliverable:true) lié à cette
//   ressource — c'est CE livrable que le client voit et approuve dans
//   son espace client (ClientProjectApercu.tsx, routes /mon-espace/projets/:id
//   et /apercu-client/:clientId/projets/:id ; ne lit jamais Resource.status directement).
// → une fois un livrable lié trouvé, le bouton devient un badge de
//   statut vivant plutôt qu'une action répétable — pas de état
//   "double-clic" à gérer, la deuxième visite affiche juste le badge.
export function RequestApprovalButton({
  resource,
  projectId,
  onStatusChange,
  size = 'sm',
}: {
  resource: Resource;
  projectId?: string;
  onStatusChange?: (status: Status, label: string) => void;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [linked, setLinked] = useState<Task | null>(
    () => (projectId ? findLinkedDeliverable(projectId, resource.id) : null)
  );

  useEffect(() => {
    if (!projectId) return;
    setLinked(findLinkedDeliverable(projectId, resource.id));
    return subscribeStore(() => setLinked(findLinkedDeliverable(projectId, resource.id)));
  }, [projectId, resource.id]);

  const handle = () => {
    if (!projectId || isSectionsLoading(projectId)) return;
    const project = getProjects().find(p => p.id === projectId);
    const task: Task = {
      id: `dl-${Date.now()}`,
      title: resource.title,
      projectId,
      projectName: project?.name ?? '',
      projectColor: project?.clientColor ?? '#888',
      assignee: USERS.lea,
      status: 'review',
      statusLabel: 'En révision',
      priority: 'normal',
      priorityLabel: 'Moyenne',
      dueDate: '—',
      dueDateRed: false,
      checked: false,
      subtasks: [],
      deliverable: true,
      deliverableType: inferDeliverableType(resource),
      linkedResources: [resource.id],
      sharedWithClient: true,
    };
    addDeliverable(projectId, task);
    addNotif({
      kind: 'approval',
      actor: USERS.lea.name,
      text: `a demandé l'approbation de « ${resource.title} »`,
      timestamp: Date.now(),
      resourceId: resource.id,
      taskId: task.id,
      projectId,
    });
    if (onStatusChange) onStatusChange('review', 'En révision');
    else updateResource(resource.id, { status: 'review', statusLabel: 'En révision' });
    showToast({ type: 'task', message: t('approval.livrableCreatedToast') });
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  };

  const handleRelaunch = () => {
    if (!projectId || !linked) return;
    updateTask(projectId, linked.id, { status: 'review', correctionsRequested: false });
    addNotif({
      kind: 'approval',
      actor: USERS.lea.name,
      text: `a demandé l'approbation de « ${resource.title} »`,
      timestamp: Date.now(),
      resourceId: resource.id,
      taskId: linked.id,
      projectId,
    });
    showToast({ type: 'task', message: t('approval.relaunchedToast') });
  };

  if (linked) {
    if (linked.correctionsRequested) {
      return (
        <SFButton
          variant="primary"
          size={size}
          icon="refresh-cw"
          onClick={handleRelaunch}
          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {t('approval.relaunchApproval')}
        </SFButton>
      );
    }
    const label = linked.status === 'ok' ? t('approval.statusApproved') : t('approval.statusPending');
    const pillStatus: Status = linked.status;
    return (
      <button
        onClick={() => navigate(`/projets/${projectId}/overview`)}
        title={t('approval.viewLivrable')}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
      >
        <SFPill status={pillStatus} small={size === 'sm'}>{label}</SFPill>
      </button>
    );
  }

  return (
    <SFButton
      variant="primary"
      size={size}
      icon={sent ? 'check' : 'shield-check'}
      onClick={handle}
      style={{ flexShrink: 0, whiteSpace: 'nowrap', ...(sent ? { background: 'var(--ok)', borderColor: 'var(--ok)', color: '#fff' } : {}) }}
    >
      {sent ? t('approval.requestSent') : t('approval.requestApproval')}
    </SFButton>
  );
}
