import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFButton } from './ui';
import { addNotif } from '../data/notificationStore';
import { updateResource } from '../data/resourceStore';
import { USERS } from '../data/mock';
import type { Resource, Status } from '../types';

// Demande d'approbation générique pour n'importe quelle ressource.
// → crée une vraie notification persistée (kind 'approval')
// → passe la ressource en statut « En révision »
// L'utilisateur courant (studio) est USERS.lea, cf. Sidebar.
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
  const [sent, setSent] = useState(false);

  const handle = () => {
    addNotif({
      kind: 'approval',
      actor: USERS.lea.name,
      text: `a demandé l'approbation de « ${resource.title} »`,
      timestamp: Date.now(),
      resourceId: resource.id,
      projectId: projectId ?? '',
    });
    if (onStatusChange) onStatusChange('review', 'En révision');
    else updateResource(resource.id, { status: 'review', statusLabel: 'En révision' });
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  };

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
