// Shared status→display mapping for deliverables (Task with deliverable: true).
// Used by both TravailOverview.tsx (studio) and Portail.tsx (client) so the
// two views never show different colors/labels for the same underlying state.

import type { Task } from '../types';

export interface DeliverableDisplay {
  color: string;
  icon: string;
  labelKey: string;
}

// Same status vocabulary as a regular task (tasks.todo/inProgress/...) —
// a deliverable is a task, so its status shouldn't invent its own words.
const DELIVERABLE_STATUS: Record<string, DeliverableDisplay> = {
  warn:   { labelKey: 'tasks.todo',       color: 'var(--warn)',   icon: 'clock' },
  info:   { labelKey: 'tasks.inProgress', color: 'var(--info)',   icon: 'loader' },
  ok:     { labelKey: 'tasks.completed',  color: 'var(--ok)',     icon: 'check-circle' },
  review: { labelKey: 'tasks.inReview',   color: 'var(--review)', icon: 'eye' },
  danger: { labelKey: 'tasks.overdue',    color: 'var(--danger)', icon: 'circle-alert' },
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

// For the status-change dropdown — same source as getDeliverableDisplay, so
// every option shown is guaranteed to match what the badge actually renders.
export const DELIVERABLE_STATUS_OPTIONS: (DeliverableDisplay & { value: string })[] =
  Object.entries(DELIVERABLE_STATUS).map(([value, display]) => ({ value, ...display }));
