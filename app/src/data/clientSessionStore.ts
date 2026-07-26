// Resolves whether the CURRENT authenticated Supabase user is a client
// contact (has a client_contacts row with user_id = auth.uid()) rather than
// a studio member. This must be checked before any studio-scoped store
// (anything that calls getStudioId()) is touched — a client-authenticated
// user has no studio_members row, and getStudioId() does not treat that as
// an error: it silently auto-provisions a brand-new empty studio instead
// (see studioStore.ts's resolveStudioId, step 3). Demo sessions never reach
// this module's real logic — client accounts don't exist as a concept in
// demo mode, so isClientSession() short-circuits to false for them.

import { supabase } from './supabaseClient';
import { isDemoSession, onLogout } from './authStore';

interface ClientIdentity {
  contactId: string;
  clientId: string;
}

let _cached: ClientIdentity | null | undefined; // undefined = not resolved yet, null = resolved to "not a client"
let _inFlight: Promise<ClientIdentity | null> | null = null;

async function resolveClientIdentity(): Promise<ClientIdentity | null> {
  if (isDemoSession()) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('client_contacts')
    .select('id, client_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('resolveClientIdentity failed', error); return null; }
  if (!data) return null;

  return { contactId: data.id, clientId: data.client_id };
}

async function getClientIdentity(): Promise<ClientIdentity | null> {
  if (_cached !== undefined) return _cached;
  if (!_inFlight) {
    _inFlight = resolveClientIdentity().then(result => {
      _cached = result;
      _inFlight = null;
      return result;
    });
  }
  return _inFlight;
}

export function resetClientSessionCache(): void {
  _cached = undefined;
  _inFlight = null;
}

onLogout(resetClientSessionCache);

export async function isClientSession(): Promise<boolean> {
  return (await getClientIdentity()) !== null;
}

export async function getMyClientContactId(): Promise<string | null> {
  const identity = await getClientIdentity();
  return identity?.contactId ?? null;
}

// The list of project ids this client contact can read — sourced from
// project_client_access (the RLS-backing table, see the Step B migration),
// filtered down for THIS user by that table's own RLS policy (a client
// contact has no direct SELECT grant on project_client_access itself; this
// query relies on is_client_contact_for_project() being usable indirectly
// via the projects table's own new client-access policy instead — see the
// implementation note in Task 5's Step 2 below for why this queries
// `projects`, not `project_client_access`, directly).
export async function getMyClientProjectIds(): Promise<string[]> {
  const { data, error } = await supabase.from('projects').select('id');
  if (error) { console.error('getMyClientProjectIds failed', error); return []; }
  return (data ?? []).map(row => row.id as string);
}

// ── Client dashboard read models ────────────────────────────────────────────
// These mirror the studio-side Project/Task/CalendarEvent shapes (see
// projectStore.ts, taskStore.ts, eventStore.ts) but are trimmed to only what
// the client portal needs, and rely on the same client-access RLS policies
// as getMyClientProjectIds above (no new grants needed).

export interface ClientProject {
  id: string;
  name: string;
  clientColor: string;
  progress: number;
  status: string;
  statusLabel: string;
  phase: string;
  phaseLabel: string;
  deliveryDate: string;
}

export async function getMyClientProjects(): Promise<ClientProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, client_color, progress, status, status_label, phase, phase_label, delivery_date');
  if (error) { console.error('getMyClientProjects failed', error); return []; }
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    clientColor: row.client_color,
    progress: row.progress,
    status: row.status,
    statusLabel: row.status_label,
    phase: row.phase,
    phaseLabel: row.phase_label,
    deliveryDate: row.delivery_date,
  }));
}

export interface ClientDeliverable {
  id: string;
  title: string;
  deliverable: boolean;
  sharedWithClient?: boolean;
  dueDate?: string;
  status?: string;
}

// tasks.data is a jsonb column storing the full serialized Task object (see
// TaskRow in taskStore.ts) — no join against sections is needed for a flat
// deliverables list, and this relies on the tasks_select_client_access RLS
// policy already granted in Step B.
export async function getMyClientDeliverables(projectId: string): Promise<ClientDeliverable[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('data')
    .eq('project_id', projectId);
  if (error) { console.error('getMyClientDeliverables failed', error); return []; }
  return (data ?? [])
    .map(row => row.data as ClientDeliverable)
    .filter(t => t.deliverable && t.sharedWithClient !== false);
}

export interface ClientCalEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  eventTypeColor: string;
  projectId: string;
}

// Real `events` columns are `start`/`end`/`all_day`/`event_type_id`
// (confirmed against eventStore.ts's EventRow/toEvent — the brief's
// placeholders `start_date`/`end_date`/`event_type_color` do not exist).
// There is no color column on `events` itself: color lives on
// `event_types.color` (see eventTypeStore.ts's EventTypeRow), so it must be
// resolved via a join through event_type_id.
export async function getMyClientEvents(projectIds: string[]): Promise<ClientCalEvent[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from('events')
    .select('id, title, start, end, all_day, project_id, event_types(color)')
    .in('project_id', projectIds);
  if (error) { console.error('getMyClientEvents failed', error); return []; }
  return (data ?? []).map(row => {
    const eventType = row.event_types as unknown as { color?: string } | { color?: string }[] | null;
    const color = Array.isArray(eventType) ? eventType[0]?.color : eventType?.color;
    return {
      id: row.id,
      title: row.title,
      startDate: row.start,
      endDate: row.end,
      allDay: row.all_day ?? false,
      eventTypeColor: color ?? '#888',
      projectId: row.project_id,
    };
  });
}

export interface ClientFileFolder {
  id: string;
  name: string;
  parentId: string | null;
  state: string | null;
}

// Only active (state null) folders are ever fetched — archived/trashed
// folders are intentionally out of scope for the client portal, mirroring
// the DB-level filter rather than a client-side hide.
export async function getMyClientFolders(projectId: string): Promise<ClientFileFolder[]> {
  const { data, error } = await supabase
    .from('file_folders')
    .select('id, name, parent_id, state')
    .eq('project_id', projectId)
    .is('state', null);
  if (error) { console.error('getMyClientFolders failed', error); return []; }
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    state: row.state,
  }));
}

export interface ClientFileItem {
  id: string;
  name: string;
  type: string;
  ext: string;
  size: number | null;
  parentFolderId: string | null;
  projectId: string;
  resourceId: string | null;
  resourceType: string | null;
  state: string | null;
  createdAt: string;
}

export async function getMyClientFiles(projectId: string): Promise<ClientFileItem[]> {
  const { data, error } = await supabase
    .from('file_items')
    .select('id, name, type, ext, size, parent_folder_id, project_id, resource_id, resource_type, state, created_at')
    .eq('project_id', projectId)
    .is('state', null);
  if (error) { console.error('getMyClientFiles failed', error); return []; }
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    ext: row.ext,
    size: row.size,
    parentFolderId: row.parent_folder_id,
    projectId: row.project_id,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    state: row.state,
    createdAt: row.created_at,
  }));
}

export interface ClientInvoice {
  id: string;
  number: string;
  title: string;
  amount: number;
  total: number;
  currency: string;
  status: string;
  issuedDate: string;
  dueDate: string;
}

export async function getMyClientInvoices(projectId: string): Promise<ClientInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, number, title, amount, total, currency, status, issued_date, due_date')
    .eq('project_id', projectId);
  if (error) { console.error('getMyClientInvoices failed', error); return []; }
  return (data ?? []).map(row => ({
    id: row.id,
    number: row.number,
    title: row.title,
    amount: row.amount,
    total: row.total,
    currency: row.currency,
    status: row.status,
    issuedDate: row.issued_date,
    dueDate: row.due_date,
  }));
}
