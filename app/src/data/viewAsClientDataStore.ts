// app/src/data/viewAsClientDataStore.ts
//
// Admin-preview counterpart to clientSessionStore.ts's read models. Never
// imported by clientSessionStore.ts or vice versa — that file assumes the
// current Supabase user is a client contact (RLS-scoped via auth.uid()),
// this one assumes the current user is a studio member with full,
// already-legitimate access to their own studio's data. Every function
// here returns EXACTLY the same field shape as its clientSessionStore.ts
// counterpart, built by filtering/remapping the already-in-memory studio
// stores instead of querying Supabase directly — no network round trip,
// no RLS dependency, safe to call from an admin session with zero risk of
// leaking another studio's data (getProjectsByClient etc. are already
// scoped to the current studio by the underlying stores).

import { getProjectsByClient } from './projectStore';
import { getDeliverables, updateTask } from './taskStore';
import { getEvents } from './eventStore';
import { getEventTypes } from './eventTypeStore';
import { getFolders, getFiles } from './fileStore';
import { getInvoicesByProject } from './financeStore';
import { addNotif } from './notificationStore';
import type {
  ClientProject, ClientDeliverable, ClientCalEvent,
  ClientFileFolder, ClientFileItem, ClientInvoice,
} from './clientSessionStore';

export async function getPreviewClientProjects(clientId: string): Promise<ClientProject[]> {
  return getProjectsByClient(clientId).map(p => ({
    id: p.id,
    name: p.name,
    clientColor: p.clientColor,
    progress: p.progress,
    status: p.status,
    statusLabel: p.statusLabel,
    phase: p.phase,
    phaseLabel: p.phaseLabel,
    deliveryDate: p.deliveryDate,
  }));
}

export async function getPreviewClientDeliverables(projectId: string): Promise<ClientDeliverable[]> {
  return getDeliverables(projectId)
    .filter(t => t.sharedWithClient !== false)
    .map(t => ({
      id: t.id,
      title: t.title,
      deliverable: t.deliverable ?? true,
      sharedWithClient: t.sharedWithClient,
      dueDate: t.dueDate,
      status: t.status,
      correctionsRequested: t.correctionsRequested,
    }));
}

export async function getPreviewClientEvents(projectIds: string[]): Promise<ClientCalEvent[]> {
  const types = getEventTypes();
  const colorFor = (eventTypeId: string) => types.find(t => t.id === eventTypeId)?.color ?? '#888';
  return getEvents()
    .filter(e => e.projectId && projectIds.includes(e.projectId))
    .map(e => ({
      id: e.id,
      title: e.title,
      startDate: e.start,
      endDate: e.end,
      allDay: e.allDay ?? false,
      eventTypeColor: colorFor(e.eventTypeId),
      projectId: e.projectId!,
    }));
}

export async function getPreviewClientFolders(projectId: string): Promise<ClientFileFolder[]> {
  return getFolders()
    .filter(f => f.projectId === projectId && !f.state)
    .map(f => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      state: f.state ?? null,
    }));
}

export async function getPreviewClientFiles(projectId: string): Promise<ClientFileItem[]> {
  return getFiles()
    .filter(f => f.projectId === projectId && !f.state)
    .map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      ext: f.ext,
      size: f.size ?? null,
      parentFolderId: f.parentFolderId,
      projectId: f.projectId!,
      resourceId: f.resourceId ?? null,
      resourceType: f.resourceType ?? null,
      state: f.state ?? null,
      createdAt: f.createdAt,
    }));
}

export async function getPreviewClientInvoices(projectId: string): Promise<ClientInvoice[]> {
  return getInvoicesByProject(projectId).map(i => ({
    id: i.id,
    number: i.number,
    title: i.title,
    amount: i.amount,
    total: i.total,
    currency: i.currency,
    status: i.status,
    issuedDate: i.issuedDate,
    dueDate: i.dueDate,
  }));
}

// Preview-path equivalent of clientSessionStore.ts's approve/corrections —
// the acting user here is the studio member themselves (admin using "Voir
// en tant que"), with full existing write access to their own studio's
// tasks, so this writes directly through taskStore.ts instead of an RPC.
export async function approvePreviewClientDeliverable(projectId: string, taskId: string, deliverableTitle: string): Promise<{ ok: boolean }> {
  updateTask(projectId, taskId, { status: 'ok', correctionsRequested: false });
  addNotif({
    kind: 'deliverableApproved',
    actor: 'Le client',
    text: `a approuvé le livrable "${deliverableTitle}"`,
    taskId,
    timestamp: Date.now(),
    projectId,
  });
  return { ok: true };
}

export async function requestPreviewClientDeliverableCorrections(projectId: string, taskId: string, deliverableTitle: string): Promise<{ ok: boolean }> {
  updateTask(projectId, taskId, { correctionsRequested: true });
  addNotif({
    kind: 'comment',
    actor: 'Le client',
    text: `a demandé des corrections sur "${deliverableTitle}"`,
    taskId,
    timestamp: Date.now(),
    projectId,
  });
  return { ok: true };
}
