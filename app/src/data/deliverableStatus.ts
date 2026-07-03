// Shared status→display mapping for deliverables (Task with deliverable: true).
// Used by both TravailOverview.tsx (studio) and Portail.tsx (client) so the
// two views never show different colors/labels for the same underlying state.

import type { Task } from '../types';

export interface DeliverableDisplay {
  color: string;
  icon: string;
  labelKey: string;
}

const DELIVERABLE_STATUS: Record<string, DeliverableDisplay> = {
  warn:   { labelKey: 'overview.deliverableToDeliver',  color: 'var(--text-3)', icon: 'clock' },
  info:   { labelKey: 'overview.deliverableInProgress', color: 'var(--info)',   icon: 'loader' },
  ok:     { labelKey: 'overview.deliverableApproved',   color: 'var(--ok)',     icon: 'check-circle' },
  review: { labelKey: 'overview.deliverableInReview',   color: 'var(--review)', icon: 'eye' },
  danger: { labelKey: 'overview.deliverableOverdue',    color: 'var(--danger)', icon: 'alert-circle' },
};

const CORRECTIONS_REQUESTED: DeliverableDisplay = {
  labelKey: 'overview.deliverableCorrectionsRequested',
  color: '#a85f3e',
  icon: 'alert-triangle',
};

export function getDeliverableDisplay(task: Task): DeliverableDisplay {
  if (task.correctionsRequested) return CORRECTIONS_REQUESTED;
  return DELIVERABLE_STATUS[task.status] ?? DELIVERABLE_STATUS['warn'];
}
