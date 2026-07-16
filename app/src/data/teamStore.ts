// Reactive team-membership store.
//
// Demo sessions: unchanged behavior — the 5 hardcoded USERS, no real
// invitations (createInvitation still returns a usable token/link shape so
// MonEquipe.tsx's existing "Envoyé !" UX keeps working, but nothing is
// persisted anywhere).
//
// Real sessions: backed by studio_members/studio_invitations, scoped to the
// user's studio (see studioStore.ts). getTeamMembers() stays synchronous via
// an in-memory cache populated by a background fetch, same pattern as
// projectStore.ts/clientStore.ts.

import { USERS } from './mock';
import type { User } from '../types';
import { isDemoSession, onLogout, getCurrentUser } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { createLoadingFlag } from './loadingFlag';

export type AccessLevel = 'owner' | 'admin' | 'member';

export interface TeamMemberInfo extends User {
  email: string;
  joinedAt: string;
  phone?: string;
  photoUrl?: string;
  permissions?: string[];
  accessLevel: AccessLevel;
}

interface StudioMemberRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  avatar_color: string;
  is_owner: boolean;
  created_at: string;
  phone: string | null;
  photo_url: string | null;
  permissions: string[] | null;
  access_level: AccessLevel;
}

function toMember(row: StudioMemberRow): TeamMemberInfo {
  return {
    id: row.user_id,
    name: row.name,
    initials: row.initials,
    avatarColor: row.avatar_color,
    role: row.role,
    email: row.email,
    joinedAt: row.created_at,
    phone: row.phone ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    permissions: row.permissions ?? undefined,
    accessLevel: row.access_level,
  };
}

let _members: TeamMemberInfo[] = [];
let _ownerId: string | null = null;
let _fetchStarted = false;
const _loading = createLoadingFlag();
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }

async function fetchMembers(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studio_members')
    .select('user_id, name, email, role, initials, avatar_color, is_owner, created_at, phone, photo_url, permissions, access_level')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchMembers failed', error); _loading.markLoaded(); notify(); return; }

  const rows = data as StudioMemberRow[];
  _members = rows.map(toMember);
  _ownerId = rows.find(r => r.is_owner)?.user_id ?? null;
  _loading.markLoaded();
  notify();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchMembers();
}

export function isTeamLoading(): boolean {
  if (isDemoSession()) return false;
  ensureFetchStarted();
  return _loading.isLoading();
}

export function resetTeamCache(): void {
  _members = [];
  _ownerId = null;
  _fetchStarted = false;
  _loading.reset();
}

onLogout(resetTeamCache);

export function getTeamMembers(): TeamMemberInfo[] {
  if (isDemoSession()) {
    return Object.values(USERS).map(u => ({
      ...u,
      email: '',
      joinedAt: '',
      accessLevel: (u.id === USERS.lea.id ? 'owner' : 'member') as AccessLevel,
    }));
  }
  ensureFetchStarted();
  return _members;
}

export function subscribeTeam(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function isTeamOwner(userId: string): boolean {
  if (isDemoSession()) return userId === USERS.lea.id;
  ensureFetchStarted();
  return userId === _ownerId;
}

export function findTeamMember(userId: string): TeamMemberInfo | undefined {
  return getTeamMembers().find(m => m.id === userId);
}

export function getMyAccessLevel(): AccessLevel {
  const user = getCurrentUser();
  if (!user) return 'member';
  if (isDemoSession()) return user.id === USERS.lea.id ? 'owner' : 'member';
  ensureFetchStarted();
  return findTeamMember(user.id)?.accessLevel ?? 'member';
}

const ACCESS_LEVEL_STORAGE_KEY = (id: string) => `sf_access_${id}`;

// Mirrors loadProfile/loadPermissions in ProfileEditPanel.tsx: demo sessions
// persist to localStorage (never Supabase), real sessions read the live
// studio_members cache via findTeamMember. Unlike getMyAccessLevel() above,
// this reads ANY member's level (used when an admin views someone else's
// profile), not just the signed-in user's own.
export function loadAccessLevel(userId: string): AccessLevel {
  if (isDemoSession()) {
    try {
      const raw = localStorage.getItem(ACCESS_LEVEL_STORAGE_KEY(userId));
      if (raw === 'owner' || raw === 'admin' || raw === 'member') return raw;
    } catch { /* noop */ }
    return userId === USERS.lea.id ? 'owner' : 'member';
  }
  return findTeamMember(userId)?.accessLevel ?? 'member';
}

export function saveAccessLevel(userId: string, accessLevel: AccessLevel): void {
  if (isDemoSession()) {
    if (userId === USERS.lea.id) return; // demo owner can't be demoted
    try { localStorage.setItem(ACCESS_LEVEL_STORAGE_KEY(userId), accessLevel); } catch { /* noop */ }
    return;
  }
  updateMemberFields(userId, { accessLevel });
}

async function upsertSupabaseMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel'>>): Promise<void> {
  const studioId = await getStudioId();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined)        row.name = patch.name;
  if (patch.email !== undefined)       row.email = patch.email;
  if (patch.role !== undefined)        row.role = patch.role;
  if (patch.phone !== undefined)       row.phone = patch.phone;
  if (patch.photoUrl !== undefined)    row.photo_url = patch.photoUrl;
  if (patch.permissions !== undefined) row.permissions = patch.permissions;
  if (patch.accessLevel !== undefined) row.access_level = patch.accessLevel;

  const { error } = await supabase.from('studio_members').update(row).eq('studio_id', studioId).eq('user_id', userId);
  if (error) { console.error('upsertSupabaseMemberFields failed', error); return; }
  await fetchMembers();
}

// Used by ProfileEditPanel.tsx's loadProfile/saveProfile/loadPhoto/savePhoto/
// loadPermissions/savePermissions for real sessions — demo sessions keep
// their own separate localStorage-only path (unchanged). Silently no-ops if
// userId doesn't match any real studio member (e.g. an external client
// contact id, or an invitee's email before they've accepted) — same
// no-real-effect outcome those callers already had before this migration.
export function updateMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel'>>): void {
  if (isDemoSession()) return;
  _members = _members.map(m => (m.id === userId ? { ...m, ...patch } : m));
  notify();
  void upsertSupabaseMemberFields(userId, patch);
}

function makeToken(): string {
  return `tinv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Narrower than AccessLevel: an invitation can never grant 'owner' — there
// is exactly one owner per studio, assigned automatically at studio
// creation (see studioStore.ts's insertOwnerMembership).
export type InvitableAccessLevel = 'admin' | 'member';

export async function createInvitation(email: string, role: string, accessLevel: InvitableAccessLevel, permissions?: string[]): Promise<{ token: string; link: string }> {
  const token = makeToken();
  const link = `${window.location.origin}/invitation-equipe/${token}`;

  if (isDemoSession()) return { token, link };

  const studioId = await getStudioId();
  const { error } = await supabase.from('studio_invitations').insert({
    token,
    studio_id: studioId,
    email: email.trim().toLowerCase(),
    role: role.trim() || 'Membre',
    access_level: accessLevel,
    permissions: permissions ?? null,
  });
  if (error) throw error;
  return { token, link };
}

export interface TeamInvitationInfo {
  email: string;
  role: string;
  studioName: string;
  status: 'pending' | 'accepted';
  studioId: string;
  studioLogoFull: string | null;
  studioLogoSquare: string | null;
}

export async function getInvitationByToken(token: string): Promise<TeamInvitationInfo | null> {
  const { data, error } = await supabase.rpc('get_studio_invitation', { p_token: token });
  if (error) { console.error('getInvitationByToken failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    email: row.email,
    role: row.role,
    studioName: row.studio_name,
    status: row.status,
    studioId: row.studio_id,
    studioLogoFull: row.studio_logo_full ?? null,
    studioLogoSquare: row.studio_logo_square ?? null,
  };
}

export async function acceptInvitation(token: string): Promise<void> {
  const { error } = await supabase.rpc('accept_studio_invitation', { p_token: token });
  if (error) throw error;
  // The caller now belongs to a different studio than getStudioId()'s cache
  // (if any) would reflect — force every store to re-resolve it from scratch.
  resetTeamCache();
}

export async function removeMember(userId: string): Promise<void> {
  if (isDemoSession()) return;
  if (userId === _ownerId) {
    console.warn('removeMember: refusing to remove the studio owner');
    return;
  }
  const studioId = await getStudioId();
  const { error } = await supabase.from('studio_members').delete().eq('studio_id', studioId).eq('user_id', userId);
  if (error) { console.error('removeMember failed', error); return; }
  await fetchMembers();
}
