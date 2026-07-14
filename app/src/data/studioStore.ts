// Resolves the current real (non-demo) user's ACTIVE organisation, creating
// one on first access. Demo sessions never call this — see isDemoSession()
// in authStore.ts.
//
// A person can belong to more than one organisation (studio_members no
// longer enforces one row per user — see
// docs/superpowers/specs/2026-07-13-multi-org-migration.sql). "Active" means
// the one currently shown in the app, remembered per-browser in
// localStorage under a key scoped to the logged-in user's id, and
// re-validated against real membership on every resolve (so a stale value
// pointing at an organisation the user has since left never sticks).

import { supabase } from './supabaseClient';
import { isDemoSession, onLogout } from './authStore';

let cachedStudioId: string | null = null;
let inFlight: Promise<string> | null = null;

interface SupabaseUserLike {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

function activeStudioKey(userId: string): string {
  return `sf_active_studio_${userId}`;
}

async function insertOwnerMembership(studioId: string, user: SupabaseUserLike): Promise<void> {
  const fullName = (user.user_metadata?.full_name as string) || user.email || 'Moi';
  const parts = fullName.trim().split(' ').filter(Boolean);
  const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || '??';
  const { error } = await supabase.from('studio_members').upsert(
    {
      studio_id: studioId,
      user_id: user.id,
      name: fullName,
      email: user.email ?? '',
      role: 'Admin',
      initials,
      avatar_color: '#5B8AF5',
      is_owner: true,
    },
    { onConflict: 'user_id,studio_id' }
  );
  if (error) console.error('insertOwnerMembership failed', error);
}

// Shared by first-time signup (resolveStudioId's fallback) and the
// "Créer une organisation" switcher action — creates the studios row, the
// owner's membership row, and seeds built-in event types.
async function provisionNewStudio(name: string, user: SupabaseUserLike): Promise<string> {
  const { data: created, error: insertError } = await supabase
    .from('studios')
    .insert({ owner_user_id: user.id, name })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await insertOwnerMembership(created.id, user);
  const { seedBuiltInEventTypes } = await import('./eventTypeStore');
  await seedBuiltInEventTypes(created.id);
  return created.id;
}

export async function getStudioId(): Promise<string> {
  if (cachedStudioId) return cachedStudioId;
  if (!inFlight) {
    inFlight = resolveStudioId().finally(() => { inFlight = null; });
  }
  return inFlight;
}

async function resolveStudioId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('getStudioId called without an authenticated Supabase user');

  // 1. Every organisation this person currently belongs to.
  const { data: memberships, error: memberError } = await supabase
    .from('studio_members')
    .select('studio_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (memberError) throw memberError;

  if (memberships && memberships.length > 0) {
    const key = activeStudioKey(user.id);
    const remembered = localStorage.getItem(key);
    const stillMember = !!remembered && memberships.some(m => m.studio_id === remembered);
    const chosen = stillMember ? remembered! : memberships[0].studio_id;
    localStorage.setItem(key, chosen);
    cachedStudioId = chosen;
    return chosen;
  }

  // 2. Legacy path: a studio already exists for this user as owner, created
  //    before studio_members existed. Backfill the missing owner row so they
  //    show up in their own team roster from now on.
  const { data: existing, error: selectError } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    await insertOwnerMembership(existing.id, user);
    cachedStudioId = existing.id;
    localStorage.setItem(activeStudioKey(user.id), existing.id);
    return existing.id;
  }

  // 3. Brand-new user: create the studio and its owner membership row together.
  const studioName = (user.user_metadata?.studio_name as string) || 'Mon studio';
  const created = await provisionNewStudio(studioName, user);
  cachedStudioId = created;
  localStorage.setItem(activeStudioKey(user.id), created);
  return created;
}

export interface MyOrganization {
  studioId: string;
  name: string;
  role: string;
}

// Every organisation the current user belongs to, for the sidebar switcher.
// Two queries rather than a single embedded select — reliable regardless of
// how PostgREST infers (or doesn't infer) the studio_members → studios
// foreign-key relationship.
export async function listMyOrganizations(): Promise<MyOrganization[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships, error } = await supabase
    .from('studio_members')
    .select('studio_id, role')
    .eq('user_id', user.id);

  if (error || !memberships || memberships.length === 0) return [];

  const studioIds = memberships.map(m => m.studio_id);
  const { data: studios, error: studiosError } = await supabase
    .from('studios')
    .select('id, name')
    .in('id', studioIds);

  if (studiosError || !studios) return [];

  const nameById = new Map(studios.map(s => [s.id as string, s.name as string]));
  return memberships.map(m => ({
    studioId: m.studio_id,
    name: nameById.get(m.studio_id) ?? 'Organisation',
    role: m.role,
  }));
}

// Writes the chosen organisation as active and reloads into it. Reload
// (rather than live in-memory invalidation) is deliberate — see the plan's
// Architecture note for why.
export async function switchActiveStudio(studioId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  localStorage.setItem(activeStudioKey(user.id), studioId);
  window.location.href = '/';
}

// Creates a brand-new organisation for the ALREADY-LOGGED-IN current user
// (distinct from resolveStudioId's step 3, which only fires when the user
// has zero organisations at all — this fires when they already have one or
// more and are deliberately adding another). Makes it active; caller
// navigates/reloads.
export async function createAdditionalStudio(name: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('createAdditionalStudio called without an authenticated Supabase user');
  const studioId = await provisionNewStudio(name, user);
  localStorage.setItem(activeStudioKey(user.id), studioId);
  return studioId;
}

// Removes the current user's membership in the currently-ACTIVE
// organisation, clears the cache, and returns whatever organisations they
// have left (empty if none). Caller decides where to navigate — see
// Task 4's "Quitter cette organisation" handler.
export async function leaveCurrentStudio(): Promise<MyOrganization[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('leaveCurrentStudio called without an authenticated Supabase user');

  const studioId = await getStudioId();
  const { error } = await supabase
    .from('studio_members')
    .delete()
    .eq('studio_id', studioId)
    .eq('user_id', user.id);
  if (error) throw error;

  resetStudioIdCache();
  localStorage.removeItem(activeStudioKey(user.id));
  return listMyOrganizations();
}

export function resetStudioIdCache(): void {
  cachedStudioId = null;
  inFlight = null;
}

// ── Studio info (nom, secteur, site web, adresse) ───────────────────────────
// Démo : localStorage. Réel : table `studios` (colonnes sector/website/address
// à ajouter via migration — voir studioStore.ts en commentaire ci-dessous).
// Toujours consommé par Parametres.tsx (mise à jour en direct, sans bouton
// "Enregistrer") et par Onboarding.tsx (première saisie à la création du compte).

export interface StudioInfo {
  name: string;
  sector: string;
  website: string;
  address: string;
}

const DEMO_KEYS = {
  name: 'sf_studio_name',
  sector: 'sf_studio_sector',
  website: 'sf_studio_website',
  address: 'sf_studio_address',
} as const;

type Listener2 = () => void;
const infoListeners: Listener2[] = [];
function notifyInfo() { infoListeners.forEach(l => l()); }
export function subscribeStudioInfo(fn: Listener2): () => void {
  infoListeners.push(fn);
  return () => { const i = infoListeners.indexOf(fn); if (i >= 0) infoListeners.splice(i, 1); };
}

let _studioInfo: StudioInfo = { name: '', sector: '', website: '', address: '' };
let _infoFetchStarted = false;

function getDemoStudioInfo(): StudioInfo {
  try {
    return {
      name: localStorage.getItem(DEMO_KEYS.name) ?? '',
      sector: localStorage.getItem(DEMO_KEYS.sector) ?? '',
      website: localStorage.getItem(DEMO_KEYS.website) ?? '',
      address: localStorage.getItem(DEMO_KEYS.address) ?? '',
    };
  } catch { return { name: '', sector: '', website: '', address: '' }; }
}

async function fetchSupabaseStudioInfo(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studios')
    .select('name, sector, website, address')
    .eq('id', studioId)
    .single();
  if (error) { console.error('fetchSupabaseStudioInfo failed', error); return; }
  _studioInfo = {
    name: data.name ?? '',
    sector: data.sector ?? '',
    website: data.website ?? '',
    address: data.address ?? '',
  };
  notifyInfo();
}

let _infoLogoutHookRegistered = false;

function ensureInfoFetchStarted(): void {
  if (!_infoLogoutHookRegistered) {
    _infoLogoutHookRegistered = true;
    onLogout(resetStudioInfoCache);
  }
  if (_infoFetchStarted) return;
  _infoFetchStarted = true;
  void fetchSupabaseStudioInfo();
}

export function resetStudioInfoCache(): void {
  _studioInfo = { name: '', sector: '', website: '', address: '' };
  _infoFetchStarted = false;
}

export function getStudioInfo(): StudioInfo {
  if (isDemoSession()) return getDemoStudioInfo();
  ensureInfoFetchStarted();
  return _studioInfo;
}

export function updateStudioInfo(patch: Partial<StudioInfo>): void {
  if (isDemoSession()) {
    try {
      if (patch.name !== undefined) localStorage.setItem(DEMO_KEYS.name, patch.name);
      if (patch.sector !== undefined) localStorage.setItem(DEMO_KEYS.sector, patch.sector);
      if (patch.website !== undefined) localStorage.setItem(DEMO_KEYS.website, patch.website);
      if (patch.address !== undefined) localStorage.setItem(DEMO_KEYS.address, patch.address);
    } catch { /* noop */ }
    notifyInfo();
    return;
  }
  _studioInfo = { ..._studioInfo, ...patch };
  notifyInfo();
  void (async () => {
    const studioId = await getStudioId();
    const { error } = await supabase.from('studios').update(patch).eq('id', studioId);
    if (error) console.error('updateStudioInfo failed', error);
  })();
}
