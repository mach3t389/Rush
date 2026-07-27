import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFButton } from './ui';
import { addNotif } from '../data/notificationStore';
import { updateResource } from '../data/resourceStore';
import { USERS } from '../data/mock';
import type { Resource, Status } from '../types';
import { findProject } from '../data/projectStore';
import { getClientExternalTeam } from '../data/clientTeamStore';
import { getStudioInfo } from '../data/studioStore';
import { isDemoSession } from '../data/authStore';
import { sendEmail } from '../data/emailStore';

// Fire-and-forget — notifies every client contact on the project's client
// team that a deliverable needs their approval. Demo sessions skip entirely
// (no real recipient address to send to).
function sendApprovalRequestEmail(projectId: string | undefined, resourceTitle: string): void {
  if (isDemoSession() || !projectId) return;
  const project = findProject(projectId);
  if (!project) return;
  const studioName = getStudioInfo().name || 'Rush';
  const link = `${window.location.origin}/projets/${projectId}/overview`;
  const contacts = getClientExternalTeam(project.clientId).filter(c => c.email);
  for (const contact of contacts) {
    void sendEmail(
      contact.email,
      `${studioName} vous demande d'approuver « ${resourceTitle} »`,
      `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <p>Bonjour ${contact.name || ''},</p>
        <p><strong>${studioName}</strong> vous demande d'approuver <strong>${resourceTitle}</strong>.</p>
        <p><a href="${link}" style="display: inline-block; padding: 10px 20px; background: #f9ff00; color: #14140a; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir et approuver</a></p>
        <p style="color: #888; font-size: 13px;">Si le bouton ne fonctionne pas, copiez ce lien : ${link}</p>
      </div>`
    );
  }
}

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
    sendApprovalRequestEmail(projectId, resource.title);
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
