// ── Status types ──────────────────────────────────────────────────────────────
export type Status = 'ok' | 'warn' | 'info' | 'danger' | 'review' | 'neutral' | 'accent';
export type Priority = 'high' | 'normal' | 'low' | 'none';
export type Phase = 'preproduction' | 'production' | 'postproduction' | 'livraison';

// ── User / Team ───────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  role: string;
}

// ── Client ────────────────────────────────────────────────────────────────────
export interface Client {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  sector: string;
  city: string;
  activeProjects: number;
  pendingDeliverables: number;
  since: string;
  progress: number;
  status: Status;
  statusLabel: string;
  lastActivity: string;
}

// ── Project ───────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  clientColor: string;
  phase: Phase;
  phaseLabel: string;
  progress: number;
  taskCount: number;
  deliverableCount: number;
  members: User[];
  deliveryDate: string;
  status: Status;
  statusLabel: string;
  modifiedAt: string;
}

// ── Task ──────────────────────────────────────────────────────────────────────
export type DeliverableFormat = '16:9' | '9:16' | '1:1' | '4:3' | '2.35:1' | 'custom';
export type DeliverableType = 'video' | 'photo' | 'audio' | 'graphique' | 'document';

export interface Task {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  assignee: User;
  status: Status;
  statusLabel: string;
  priority: Priority;
  priorityLabel: string;
  dueDate: string;        // date de début (ou date unique)
  endDate?: string;       // date de fin optionnelle (plage multi-jours)
  startTime?: string;
  endTime?: string;
  dueDateRed?: boolean;
  checked: boolean;
  subtasks?: Task[];
  phase?: Phase;
  activityCount?: number;
  deliverable?: boolean;
  deliverableType?: DeliverableType;
  format?: DeliverableFormat;
  customWidth?: number;
  customHeight?: number;
  linkedResources?: string[];
  sectionLabel?: string;
}

// ── Resource ──────────────────────────────────────────────────────────────────
export type ResourceType = 'screenplay' | 'video_review' | 'moodboard' | 'document' | 'checklist' | 'inspirations' | 'file' | 'form' | 'web_review';

export interface Resource {
  id: string;
  type: ResourceType;
  eyebrow: string;
  title: string;
  description?: string;
  status: Status;
  statusLabel: string;
  meta: string;
  version?: string;
  progress?: number;
  avatars?: { initials: string; bg: string }[];
  colors?: string[];
  mediaSubtype?: 'video' | 'photo' | 'file';
  webUrl?: string;
}

// ── Video Review ──────────────────────────────────────────────────────────────
export interface VideoComment {
  id: string;
  author: User;
  timeSeconds: number;
  timeLabel: string;
  text: string;
  resolved: boolean;
}

export interface VideoCorrection {
  id: string;
  num: string;
  label: string;
  status: Status;
  statusLabel: string;
}

export interface VideoVersion {
  v: string;
  status: Status;
  label: string;
  active?: boolean;
}

// ── Notification ─────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  day: string;
  unread: boolean;
  actor: User;
  text: string;
  bold: string;
  time: string;
  type: string;
  typeStatus: Status;
  action?: string;
}

// ── Section ───────────────────────────────────────────────────────────────────
export interface SectionData {
  label: string;
  tasks: Task[];
  completed?: boolean;
}

// ── Activity ──────────────────────────────────────────────────────────────────
export interface ActivityItem {
  id: string;
  day: string;
  type: 'comment' | 'upload' | 'task' | 'approve' | 'client';
  actor: User;
  action: string;
  target: string;
  detail: string;
  time: string;
}
