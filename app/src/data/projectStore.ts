// Reactive project store.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage-overrides behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio (see
// studioStore.ts). getProjects() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern authStore.ts uses for
// getCurrentUser() via onAuthStateChange, so no consuming screen needs to
// change to handle a Promise.

import { PROJECTS } from './mock';
import type { Project } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { setSections } from './taskStore';
import { deleteEventsForProject } from './eventStore';
import { deleteAllFilesForProject, archiveAllFilesForProject, getFiles } from './fileStore';
import { getInvoicesByProject, removeInvoice } from './financeStore';
import { removeResource } from './resourceStore';
import { createLoadingFlag } from './loadingFlag';
import { showToast } from './toastStore';
import { getClientExternalTeam } from './clientTeamStore';
import { confirmDialog } from './confirmStore';
import { syncProjectClientAccess } from './projectClientAccessStore';
import { renameProjectGoogleCalendarNow } from './googleCalendarStore';
import i18n from '../i18n/i18n';

const STORAGE_KEY = 'sf_added_projects';
const OVERRIDES_KEY = 'sf_project_overrides';

let _added: Project[] = loadPersisted<Project[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Project>> = loadPersisted<Record<string, Partial<Project>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

// In-memory only (tab lifetime, not persisted): draft template project id →
// the id of the single draft Resource created for it (Modeles.tsx
// openTemplateDraft / openNewTemplateDraft). removeProject() consults this
// FIRST, before falling back to scanning file_items, because in a real
// (Supabase) session file_items' synchronous cache is only refreshed after
// an async round-trip completes — if the user leaves the draft (triggering
// cleanup) before that refresh lands, the file_items scan finds nothing and
// the draft's Resource/resource_content rows leak. Populated synchronously
// at draft-resource-creation time, so it has no such lag.
const _draftResourceByProject: Record<string, string> = {};

/** Called right after a draft resource is created for a template-draft project. */
export function registerDraftResource(projectId: string, resourceId: string): void {
  _draftResourceByProject[projectId] = resourceId;
}

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

// ── Real (Supabase-backed) session state ──────────────────────────────────
let _supabaseProjects: Project[] = [];
let _supabaseFetchStarted = false;
const _loading = createLoadingFlag();

interface ProjectRow {
  id: string;
  studio_id: string;
  name: string;
  client_id: string | null;
  client_name: string | null;
  client_color: string | null;
  calendar_enabled: boolean;
  files_enabled: boolean;
  finance_enabled: boolean;
  phase: string;
  phase_label: string;
  progress: number;
  task_count: number;
  deliverable_count: number;
  delivery_date: string;
  status: string;
  status_label: string;
  modified_at: string;
  budget: number | null;
  description: string | null;
  folder_structure_template_id: string | null;
  overview_template_id: string | null;
  members: Project['members'];
  archived: boolean;
  completed: boolean;
  is_template_draft: boolean | null;
  draft_origin_template_id: string | null;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id ?? undefined,
    clientName: row.client_name ?? undefined,
    clientColor: row.client_color ?? undefined,
    calendarEnabled: row.calendar_enabled ?? true,
    filesEnabled: row.files_enabled ?? true,
    financeEnabled: row.finance_enabled ?? true,
    phase: row.phase as Project['phase'],
    phaseLabel: row.phase_label,
    progress: row.progress,
    taskCount: row.task_count,
    deliverableCount: row.deliverable_count,
    members: row.members ?? [],
    deliveryDate: row.delivery_date,
    status: row.status as Project['status'],
    statusLabel: row.status_label,
    modifiedAt: row.modified_at,
    budget: row.budget ?? undefined,
    description: row.description ?? undefined,
    folderStructureTemplateId: row.folder_structure_template_id ?? undefined,
    overviewTemplateId: row.overview_template_id ?? undefined,
    archived: row.archived,
    completed: row.completed,
    isTemplateDraft: row.is_template_draft ?? undefined,
    draftOriginTemplateId: row.draft_origin_template_id ?? undefined,
  };
}

function toRow(p: Project, studioId: string): ProjectRow {
  return {
    id: p.id,
    studio_id: studioId,
    name: p.name,
    client_id: p.clientId ?? null,
    client_name: p.clientName ?? null,
    client_color: p.clientColor ?? null,
    calendar_enabled: p.calendarEnabled,
    files_enabled: p.filesEnabled,
    finance_enabled: p.financeEnabled,
    phase: p.phase,
    phase_label: p.phaseLabel,
    progress: p.progress,
    task_count: p.taskCount,
    deliverable_count: p.deliverableCount,
    delivery_date: p.deliveryDate,
    status: p.status,
    status_label: p.statusLabel,
    modified_at: p.modifiedAt,
    budget: p.budget ?? null,
    description: p.description ?? null,
    folder_structure_template_id: p.folderStructureTemplateId ?? null,
    overview_template_id: p.overviewTemplateId ?? null,
    members: p.members,
    archived: p.archived ?? false,
    completed: p.completed ?? false,
    is_template_draft: p.isTemplateDraft ?? false,
    draft_origin_template_id: p.draftOriginTemplateId ?? null,
  };
}

async function fetchSupabaseProjects(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false });

  if (error) { console.error('fetchSupabaseProjects failed', error); _loading.markLoaded(); notify(); return; }

  _supabaseProjects = (data as ProjectRow[]).map(toProject);
  _loading.markLoaded();
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseProjects();
}

export function isProjectsLoading(): boolean {
  if (isDemoSession()) return false;
  ensureSupabaseFetchStarted();
  return _loading.isLoading();
}

export function resetProjectsCache(): void {
  _supabaseProjects = [];
  _supabaseFetchStarted = false;
  _loading.reset();
}

onLogout(resetProjectsCache);

async function addSupabaseProject(p: Project): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('projects').insert(toRow(p, studioId));
  if (error) {
    console.error('addSupabaseProject failed', error);
    showToast({ type: 'section', message: "Le projet n'a pas pu être créé", subMessage: 'Veuillez réessayer.' });
    // Reject rather than silently resolving: callers (e.g. createTemplateDraft)
    // rely on the promise settling to know whether the row actually exists
    // server-side before navigating to it.
    throw error;
  }
  await fetchSupabaseProjects();
}

// Maps only the provided fields to their column names — unlike toRow(),
// this never requires a full Project object, so it can't silently no-op
// when the local cache hasn't populated yet (e.g. an edit fired right
// after route entry, before the background fetch resolved) and it can't
// clobber unrelated columns with a stale cached copy of the rest of the
// row (the "stale cache upsert clobber" bug this codebase has hit before).
function toRowPatch(updates: Partial<Project>): Partial<ProjectRow> {
  const patch: Partial<ProjectRow> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.clientId !== undefined) patch.client_id = updates.clientId ?? null;
  if (updates.clientName !== undefined) patch.client_name = updates.clientName ?? null;
  if (updates.clientColor !== undefined) patch.client_color = updates.clientColor ?? null;
  if (updates.calendarEnabled !== undefined) patch.calendar_enabled = updates.calendarEnabled;
  if (updates.filesEnabled !== undefined) patch.files_enabled = updates.filesEnabled;
  if (updates.financeEnabled !== undefined) patch.finance_enabled = updates.financeEnabled;
  if (updates.phase !== undefined) patch.phase = updates.phase;
  if (updates.phaseLabel !== undefined) patch.phase_label = updates.phaseLabel;
  if (updates.progress !== undefined) patch.progress = updates.progress;
  if (updates.taskCount !== undefined) patch.task_count = updates.taskCount;
  if (updates.deliverableCount !== undefined) patch.deliverable_count = updates.deliverableCount;
  if (updates.deliveryDate !== undefined) patch.delivery_date = updates.deliveryDate;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.statusLabel !== undefined) patch.status_label = updates.statusLabel;
  if (updates.modifiedAt !== undefined) patch.modified_at = updates.modifiedAt;
  if (updates.budget !== undefined) patch.budget = updates.budget ?? null;
  if (updates.description !== undefined) patch.description = updates.description ?? null;
  if (updates.folderStructureTemplateId !== undefined) patch.folder_structure_template_id = updates.folderStructureTemplateId ?? null;
  if (updates.overviewTemplateId !== undefined) patch.overview_template_id = updates.overviewTemplateId ?? null;
  if (updates.members !== undefined) patch.members = updates.members;
  if (updates.archived !== undefined) patch.archived = updates.archived;
  if (updates.completed !== undefined) patch.completed = updates.completed;
  return patch;
}

async function updateSupabaseProject(id: string, updates: Partial<Project>): Promise<void> {
  const { error } = await supabase.from('projects').update(toRowPatch(updates)).eq('id', id);
  if (error) {
    console.error('updateSupabaseProject failed', error);
    showToast({ type: 'section', message: "La modification n'a pas pu être enregistrée", subMessage: 'Veuillez réessayer.' });
    return;
  }
  await fetchSupabaseProjects();
}

// ── Public API (unchanged signatures) ─────────────────────────────────────

function getAllProjectsUnfiltered(): Project[] {
  if (isDemoSession()) {
    return [...PROJECTS, ..._added].map(p =>
      _overrides[p.id] ? { ...p, ..._overrides[p.id] } : p
    );
  }
  ensureSupabaseFetchStarted();
  return _supabaseProjects;
}

export function getProjects(): Project[] {
  return getAllProjectsUnfiltered().filter(p => !p.isTemplateDraft);
}

export function getProjectsByClient(clientId: string): Project[] {
  return getProjects().filter(p => p.clientId === clientId);
}

export function findProject(id: string): Project | undefined {
  return getAllProjectsUnfiltered().find(p => p.id === id);
}

// Renvoie une promesse résolue quand la ligne projet existe réellement côté
// serveur — les appelants qui écrivent ensuite dans une table référençant
// `projects(id)` (ex. `project_content`) doivent l'attendre. Les autres peuvent
// l'ignorer (fire-and-forget, comportement inchangé).
export function addProject(p: Project): Promise<void> {
  if (isDemoSession()) {
    _added = [p, ..._added];
    persist();
    notify();
    return Promise.resolve();
  }
  return addSupabaseProject(p);
}

// Note: the returned promise rejects if the underlying insert fails (see
// addSupabaseProject) — callers MUST await/catch this before navigating to
// the draft's route, otherwise they can navigate to a project id that was
// never actually created server-side (e.g. if the is_template_draft /
// draft_origin_template_id migration hasn't been applied yet and Postgres
// rejects the insert on unknown columns).
export function createTemplateDraft(name: string, originTemplateId?: string): Promise<string> {
  const id = `draft-${Date.now()}`;
  const draft: Project = {
    id,
    name,
    clientId: '',
    clientName: '',
    clientColor: '#6b7280',
    // Drafts are only ever opened via Fichiers/Tâches/Aperçu (see isTemplateDraft
    // comment in types/index.ts) — Calendrier and Finance are never shown, and
    // Finance also requires a real client (clientId is '' above).
    calendarEnabled: false,
    filesEnabled: true,
    financeEnabled: false,
    phase: 'production',
    phaseLabel: '',
    progress: 0,
    taskCount: 0,
    deliverableCount: 0,
    members: [],
    deliveryDate: '',
    status: 'info',
    statusLabel: '',
    modifiedAt: new Date().toISOString(),
    isTemplateDraft: true,
    draftOriginTemplateId: originTemplateId,
  };
  return addProject(draft).then(() => id);
}

export function updateProject(id: string, updates: Partial<Project>): void {
  // Stamp a real timestamp on every edit — modifiedAt is read as a plain
  // ISO string and formatted live (see utils/timeAgo.ts), so this is what
  // makes the "Il y a Xh" badge actually reflect reality instead of being
  // frozen at whatever value the record was created with.
  const stamped: Partial<Project> = { ...updates, modifiedAt: new Date().toISOString() };
  // Finance requires a client to bill — never let a write leave the two
  // fields in an inconsistent state (see design doc's Finance ↔ Client rule).
  // Triggers whenever this call explicitly clears clientId (null/empty
  // string), not when clientId is simply absent from the patch.
  if ('clientId' in updates && !updates.clientId) {
    stamped.financeEnabled = false;
  }
  if (isDemoSession()) {
    _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...stamped } };
    persistOverrides();
    notify();
    return;
  }
  void updateSupabaseProject(id, stamped);
}

/**
 * Changes a project's client, handling the fallout for members who only had
 * access because they belonged to the OLD client's contact list. Without
 * this, those contacts kept sitting in `project.members` after the transfer
 * — visually still "on" the project, and (per project_client_access sync)
 * still holding real portal access to it.
 *
 * All three "Changer de client" pickers (ProjectHeaderBar, ProjectCard,
 * ProjectsListView) route through this single function instead of each
 * doing its own bare updateProject() call.
 */
export async function changeProjectClient(
  project: Project,
  newClientId: string | null,
  newClientName?: string,
  newClientColor?: string
): Promise<void> {
  // Explicitly clear clientName to '' when unassigning — passing `undefined`
  // here would make toRowPatch() skip the column entirely (its "only write
  // what's explicitly provided" guard treats undefined as "don't touch"),
  // leaving the old client's name stuck in place forever after removal.
  // Confirmed bug: "Rush" project showed "Partager avec Projets personnels"
  // in the calendar share button long after its client was removed, because
  // clientName never actually got cleared. Empty string, not null: the
  // projects table's client_name column rejected a literal null write
  // (never exercised before this fix, since the old code always skipped
  // writing it) — confirmed live via a persistent "modification n'a pas pu
  // être enregistrée" failure the moment this started actually attempting
  // to write null.
  //
  // clientColor is deliberately NOT cleared here (undefined = untouched):
  // it doubles as the project's own display color (the sidebar/breadcrumb
  // dot — see Sidebar.tsx's `p.clientColor ?? 'var(--text-3)'`), picked
  // independently of any client via NewProjectModal's color swatches, not
  // something that belongs to "the client" and should vanish with it.
  // Clearing it (confirmed live) made every unassigned project's dot go
  // blank instead of falling back to the neutral gray, because '' isn't
  // nullish — `'' ?? 'var(--text-3)'` still evaluates to '', not the
  // fallback — so the dot rendered with an empty, invisible background.
  const basePatch: Partial<Project> = newClientId === null
    ? { clientId: null, clientName: '' }
    : { clientId: newClientId, clientName: newClientName, clientColor: newClientColor };

  // Fire-and-forget, real sessions only — a project's active Google Calendar
  // (if any) needs to know right away that its "Client — Projet" title
  // changed, rather than waiting for the next throttled/cron pull to
  // eventually notice (confirmed live: a client removal wasn't reflected
  // in Google Calendar until a page reload 2+ minutes later). No-op
  // server-side if the project has no active calendar.
  const syncCalendarName = () => { if (!isDemoSession()) renameProjectGoogleCalendarNow(project.id); };

  if (!project.clientId) {
    updateProject(project.id, basePatch);
    syncCalendarName();
    return;
  }

  const oldClientContactIds = new Set(getClientExternalTeam(project.clientId).map(c => c.id));
  const affectedIds = new Set((project.members ?? []).filter(m => oldClientContactIds.has(m.id)).map(m => m.id));

  if (affectedIds.size === 0) {
    updateProject(project.id, basePatch);
    syncCalendarName();
    return;
  }

  const removeAccess = await confirmDialog(
    i18n.t('projects.transferMembersPrompt', { count: affectedIds.size }),
    {
      confirmLabel: i18n.t('projects.transferMembersRemove'),
      cancelLabel: i18n.t('projects.transferMembersKeep'),
    }
  );

  if (removeAccess) {
    const updatedMembers = (project.members ?? []).filter(m => !affectedIds.has(m.id));
    updateProject(project.id, { ...basePatch, members: updatedMembers });
    // updateProject() only writes projects.members — it does NOT touch
    // project_client_access (the RLS-backing table), so the removed
    // contacts would otherwise keep real portal access to this project.
    // Re-sync against the OLD client (whose contacts we just filtered out)
    // so its pool is what's diffed against — syncing against the new
    // client would filter against an unrelated (and usually not-yet-
    // fetched, so falsely-empty) contact pool and revoke nothing.
    syncProjectClientAccess(project.id, project.clientId, updatedMembers);
  } else {
    updateProject(project.id, basePatch);
  }
  syncCalendarName();
}

async function updateSupabaseProjectsForClient(clientId: string, patch: ClientIdentityPatch): Promise<void> {
  const row: Record<string, string> = {};
  if (patch.clientName !== undefined) row.client_name = patch.clientName;
  if (patch.clientColor !== undefined) row.client_color = patch.clientColor;
  // Single statement rather than one update per project: a client with many
  // projects would otherwise fire a burst of round-trips on every rename.
  const { error } = await supabase.from('projects').update(row).eq('client_id', clientId);
  if (error) {
    console.error('updateSupabaseProjectsForClient failed', error);
    showToast({ type: 'section', message: "Les projets du client n'ont pas pu être mis à jour", subMessage: 'Veuillez réessayer.' });
    return;
  }
  await fetchSupabaseProjects();
}

export interface ClientIdentityPatch { clientName?: string; clientColor?: string }

/**
 * Propagates a client's name/colour onto every project that belongs to it.
 *
 * Projects store a denormalized copy of both fields, so without this a rename
 * only appeared on the few screens that re-resolve the client from its own
 * store — every project list kept showing the old name indefinitely.
 *
 * Deliberately NOT routed through updateProject(): that stamps modifiedAt, and
 * renaming a client must not make all of its projects look freshly edited.
 */
export function syncClientOnProjects(clientId: string, patch: ClientIdentityPatch): void {
  if (patch.clientName === undefined && patch.clientColor === undefined) return;
  if (isDemoSession()) {
    const affected = getProjects().filter(p => p.clientId === clientId);
    if (affected.length === 0) return;
    const next = { ..._overrides };
    affected.forEach(p => { next[p.id] = { ...(next[p.id] ?? {}), ...patch }; });
    _overrides = next;
    persistOverrides();
    notify();
    return;
  }
  void updateSupabaseProjectsForClient(clientId, patch);
}

export function subscribeProjects(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function archiveProject(id: string): void {
  updateProject(id, { archived: true });
  archiveAllFilesForProject(id);
}

export function unarchiveProject(id: string): void {
  updateProject(id, { archived: false });
}

async function removeSupabaseProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) { console.error('removeSupabaseProject failed', error); return; }
  await fetchSupabaseProjects();
}

export function removeProject(id: string): void {
  setSections(id, []);
  deleteEventsForProject(id);
  // Doit tourner AVANT deleteAllFilesForProject : on a besoin des FileItem
  // (type 'resource') encore en place pour retrouver les resourceId à
  // nettoyer — deleteAllFilesForProject les supprime juste après.
  const resourceIdsToClean = new Set<string>();
  const registeredDraftResourceId = _draftResourceByProject[id];
  if (registeredDraftResourceId) resourceIdsToClean.add(registeredDraftResourceId);
  getFiles()
    .filter(f => f.projectId === id && f.type === 'resource' && f.resourceId)
    .forEach(f => resourceIdsToClean.add(f.resourceId!));
  resourceIdsToClean.forEach(resId => removeResource(resId));
  delete _draftResourceByProject[id];
  deleteAllFilesForProject(id);
  getInvoicesByProject(id).forEach(inv => removeInvoice(inv.id));

  if (isDemoSession()) {
    _added = _added.filter(p => p.id !== id);
    const { [id]: _, ...rest } = _overrides;
    _overrides = rest;
    persist();
    persistOverrides();
    notify();
    return;
  }
  _supabaseProjects = _supabaseProjects.filter(p => p.id !== id);
  notify();
  void removeSupabaseProject(id);
}
