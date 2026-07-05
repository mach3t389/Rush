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
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

export interface TeamMemberInfo extends User {
  email: string;
  joinedAt: string;
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
  };
}

let _members: TeamMemberInfo[] = [];
let _ownerId: string | null = null;
let _fetchStarted = false;
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }

async function fetchMembers(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studio_members')
    .select('user_id, name, email, role, initials, avatar_color, is_owner, created_at')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchMembers failed', error); return; }

  const rows = data as StudioMemberRow[];
  _members = rows.map(toMember);
  _ownerId = rows.find(r => r.is_owner)?.user_id ?? null;
  notify();
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  void fetchMembers();
}

export function resetTeamCache(): void {
  _members = [];
  _ownerId = null;
  _fetchStarted = false;
}

onLogout(resetTeamCache);

export function getTeamMembers(): TeamMemberInfo[] {
  if (isDemoSession()) {
    return Object.values(USERS).map(u => ({ ...u, email: '', joinedAt: '' }));
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
  return userId === _ownerId;
}

function makeToken(): string {
  return `tinv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createInvitation(email: string, role: string): Promise<{ token: string; link: string }> {
  const token = makeToken();
  const link = `${window.location.origin}/invitation-equipe/${token}`;

  if (isDemoSession()) return { token, link };

  const studioId = await getStudioId();
  const { error } = await supabase.from('studio_invitations').insert({
    token,
    studio_id: studioId,
    email: email.trim().toLowerCase(),
    role: role.trim() || 'Membre',
  });
  if (error) throw error;
  return { token, link };
}

export interface TeamInvitationInfo {
  email: string;
  role: string;
  studioName: string;
  status: 'pending' | 'accepted';
}

export async function getInvitationByToken(token: string): Promise<TeamInvitationInfo | null> {
  const { data, error } = await supabase.rpc('get_studio_invitation', { p_token: token });
  if (error) { console.error('getInvitationByToken failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { email: row.email, role: row.role, studioName: row.studio_name, status: row.status };
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
