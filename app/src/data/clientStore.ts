// Reactive client store.
//
// Demo sessions (isDemoSession() === true): unchanged mock-seed +
// localStorage-overrides behavior, exactly as before this migration.
//
// Real sessions: backed by Supabase, scoped to the user's studio (see
// studioStore.ts). getClients() stays synchronous via an in-memory cache
// populated by a background fetch — the same pattern projectStore.ts uses.

import { CLIENTS } from './mock';
import type { Client } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { getProjects, removeProject } from './projectStore';
import { deleteAllFilesForClient } from './fileStore';
import { getInvoicesByClient, removeInvoice } from './financeStore';
import { setClientTeam } from './clientTeamStore';

const STORAGE_KEY = 'sf_added_clients';
const OVERRIDES_KEY = 'sf_client_overrides';

let _added: Client[] = loadPersisted<Client[]>(STORAGE_KEY, []);
let _overrides: Record<string, Partial<Client>> = loadPersisted<Record<string, Partial<Client>>>(OVERRIDES_KEY, {});
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function persist() { savePersisted(STORAGE_KEY, _added); }
function persistOverrides() { savePersisted(OVERRIDES_KEY, _overrides); }

// ── Real (Supabase-backed) session state ──────────────────────────────────
let _supabaseClients: Client[] = [];
let _supabaseFetchStarted = false;

interface ClientRow {
  id: string;
  studio_id: string;
  name: string;
  initials: string;
  avatar_color: string;
  sector: string;
  city: string;
  active_projects: number;
  pending_deliverables: number;
  since: string;
  progress: number;
  status: string;
  status_label: string;
  last_activity: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  email_compta: string | null;
  website: string | null;
  notes: string | null;
  archived: boolean;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    avatarColor: row.avatar_color,
    sector: row.sector,
    city: row.city,
    activeProjects: row.active_projects,
    pendingDeliverables: row.pending_deliverables,
    since: row.since,
    progress: row.progress,
    status: row.status as Client['status'],
    statusLabel: row.status_label,
    lastActivity: row.last_activity,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    emailCompta: row.email_compta ?? undefined,
    website: row.website ?? undefined,
    notes: row.notes ?? undefined,
    archived: row.archived,
  };
}

function toRow(c: Client, studioId: string): ClientRow {
  return {
    id: c.id,
    studio_id: studioId,
    name: c.name,
    initials: c.initials,
    avatar_color: c.avatarColor,
    sector: c.sector,
    city: c.city,
    active_projects: c.activeProjects,
    pending_deliverables: c.pendingDeliverables,
    since: c.since,
    progress: c.progress,
    status: c.status,
    status_label: c.statusLabel,
    last_activity: c.lastActivity,
    address: c.address ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    email_compta: c.emailCompta ?? null,
    website: c.website ?? null,
    notes: c.notes ?? null,
    archived: c.archived ?? false,
  };
}

async function fetchSupabaseClients(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchSupabaseClients failed', error); return; }

  _supabaseClients = (data as ClientRow[]).map(toClient);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseClients();
}

export function resetClientsCache(): void {
  _supabaseClients = [];
  _supabaseFetchStarted = false;
}

onLogout(resetClientsCache);

async function addSupabaseClient(c: Client): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('clients').insert(toRow(c, studioId));
  if (error) { console.error('addSupabaseClient failed', error); return; }
  await fetchSupabaseClients();
}

async function updateSupabaseClient(id: string, updates: Partial<Client>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseClients.find(c => c.id === id);
  if (!current) { console.error('updateSupabaseClient: client not found in cache', id); return; }
  const merged = { ...current, ...updates };
  const { error } = await supabase.from('clients').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseClient failed', error); return; }
  await fetchSupabaseClients();
}

// ── Public API (unchanged signatures) ─────────────────────────────────────

export function getClients(): Client[] {
  if (isDemoSession()) {
    return [...CLIENTS, ..._added].map(c =>
      _overrides[c.id] ? { ...c, ..._overrides[c.id] } : c
    );
  }
  ensureSupabaseFetchStarted();
  return _supabaseClients;
}

export function findClient(id: string): Client | undefined {
  return getClients().find(c => c.id === id);
}

export function addClient(c: Client): void {
  if (isDemoSession()) {
    _added = [..._added, c];
    persist();
    notify();
    return;
  }
  void addSupabaseClient(c);
}

export function updateClient(id: string, updates: Partial<Client>): void {
  if (isDemoSession()) {
    _overrides = { ..._overrides, [id]: { ...(_overrides[id] ?? {}), ...updates } };
    persistOverrides();
    notify();
    return;
  }
  void updateSupabaseClient(id, updates);
}

export function subscribeClients(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function archiveClient(id: string): void {
  updateClient(id, { archived: true });
}

export function unarchiveClient(id: string): void {
  updateClient(id, { archived: false });
}

async function removeSupabaseClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) { console.error('removeSupabaseClient failed', error); return; }
  await fetchSupabaseClients();
}

export function removeClient(id: string): void {
  getProjects().filter(p => p.clientId === id).forEach(p => removeProject(p.id));
  deleteAllFilesForClient(id);
  getInvoicesByClient(id).forEach(inv => removeInvoice(inv.id));
  setClientTeam(id, []);

  if (isDemoSession()) {
    _added = _added.filter(c => c.id !== id);
    const { [id]: _removed, ...rest } = _overrides;
    _overrides = rest;
    persist();
    persistOverrides();
    notify();
    return;
  }
  _supabaseClients = _supabaseClients.filter(c => c.id !== id);
  notify();
  void removeSupabaseClient(id);
}
