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
import { getStudioId, getStudioInfo } from './studioStore';
import { supabase } from './supabaseClient';
import { createLoadingFlag } from './loadingFlag';
import { sendEmail, wrapEmailHtml } from './emailStore';

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
  id: string;
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
    // The studio_members table's own row id — NOT the same as `id` above
    // (that's the person's auth user_id). client_contacts.studio_member_id
    // has a foreign key to studio_members(id), not studio_members(user_id)
    // (see the 2026-07-13 multi-org migration, which repointed it) — any
    // code writing that column must use THIS value, never `.id`.
    membershipId: row.id,
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
    .select('id, user_id, name, email, role, initials, avatar_color, is_owner, created_at, phone, photo_url, permissions, access_level')
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

// Assignee-picker helper — returns plain User[] (not the studio-membership
// TeamMemberInfo shape) so callers like task/subtask assignee dropdowns
// don't need to care about email/joinedAt/accessLevel.
export function getTeam(): User[] {
  const team = getTeamMembers();
  if (team.length > 0) return team.map(m => ({ id: m.id, name: m.name, initials: m.initials, avatarColor: m.avatarColor, role: m.role, photoUrl: m.photoUrl }));
  // teamStore's fetch hasn't resolved yet (or getCurrentUser() briefly
  // returns null right after login, same one-frame window already accepted
  // in GlobalTopBar.tsx) — fall back to a placeholder so callers that assume
  // getTeam()[0] is always defined (e.g. the "add task" row's default
  // assignee) never see undefined.
  const authUser = getCurrentUser();
  if (!authUser) return [USERS.lea];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
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

async function upsertSupabaseMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel' | 'initials'>>): Promise<void> {
  const studioId = await getStudioId();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined)        row.name = patch.name;
  if (patch.email !== undefined)       row.email = patch.email;
  if (patch.role !== undefined)        row.role = patch.role;
  if (patch.phone !== undefined)       row.phone = patch.phone;
  if (patch.photoUrl !== undefined)    row.photo_url = patch.photoUrl;
  if (patch.permissions !== undefined) row.permissions = patch.permissions;
  if (patch.accessLevel !== undefined) row.access_level = patch.accessLevel;
  if (patch.initials !== undefined)    row.initials = patch.initials;

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
export function updateMemberFields(userId: string, patch: Partial<Pick<TeamMemberInfo, 'name' | 'email' | 'role' | 'phone' | 'photoUrl' | 'permissions' | 'accessLevel' | 'initials'>>): void {
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

// Fire-and-forget — demo sessions don't have a real invitee address, so
// skip entirely (matches sendClientInvitationEmail's same reasoning in
// invitationStore.ts).
export function sendTeamInvitationEmail(email: string, role: string, link: string): void {
  if (isDemoSession() || !email) return;
  const studioName = getStudioInfo().name || 'Rushflow';
  void sendEmail(
    email,
    `${studioName} vous invite à rejoindre son équipe sur Rushflow`,
    wrapEmailHtml(
      `<p>Bonjour,</p>
      <p><strong>${studioName}</strong> vous invite à rejoindre son équipe sur Rushflow en tant que <strong>${role || 'membre'}</strong>. Rushflow est une plateforme de gestion de projets utilisée par ${studioName} pour organiser son travail, ses fichiers et ses échanges avec ses clients.</p>`,
      { ctaLabel: "Rejoindre l'équipe", ctaLink: link }
    )
  );
}

export interface PendingInvitation {
  token: string;
  email: string;
  role: string;
  createdAt: string;
}

// Demo sessions have no real invitations to list (createInvitation never
// persists anything for them — see the file header comment).
export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  if (isDemoSession()) return [];
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studio_invitations')
    .select('token, email, role, created_at')
    .eq('studio_id', studioId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { console.error('getPendingInvitations failed', error); return []; }
  return (data ?? []).map(row => ({ token: row.token, email: row.email, role: row.role, createdAt: row.created_at }));
}

// Deletes the pending invitation outright — the studio_invitations table
// already grants delete to authenticated (2026-07-05 design) and the
// invitations_delete_own RLS policy already scopes it to admins
// (2026-08-03 multi-org audit), so no new migration is needed here.
export async function cancelInvitation(token: string): Promise<void> {
  if (isDemoSession()) return;
  const studioId = await getStudioId();
  const { error } = await supabase.from('studio_invitations').delete().eq('studio_id', studioId).eq('token', token);
  if (error) throw error;
}

// Re-sends the same invitation email pointing at the SAME token/link —
// no DB write needed, the token is still valid and unconsumed. Mirrors
// createInvitation's link-building exactly.
export function resendInvitation(invitation: PendingInvitation): void {
  const link = `${window.location.origin}/invitation-equipe/${invitation.token}`;
  sendTeamInvitationEmail(invitation.email, invitation.role, link);
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

export async function acceptInvitation(token: string, extra?: { name?: string; phone?: string; photoUrl?: string }): Promise<void> {
  const { error } = await supabase.rpc('accept_studio_invitation', {
    p_token: token,
    p_name: extra?.name ?? null,
    p_phone: extra?.phone ?? null,
    p_photo_url: extra?.photoUrl ?? null,
  });
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
