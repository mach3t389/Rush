// Resolves the current real (non-demo) user's studio row, creating it on first
// access. Demo sessions never call this — see isDemoSession() in authStore.ts.

import { supabase } from './supabaseClient';
import { isDemoSession, onLogout } from './authStore';

let cachedStudioId: string | null = null;
let inFlight: Promise<string> | null = null;

interface SupabaseUserLike {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
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
      avatar_color: '#5c3d8f',
      is_owner: true,
    },
    { onConflict: 'user_id' }
  );
  if (error) console.error('insertOwnerMembership failed', error);
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

  // 1. Already a recorded member (owner or invited). This is the only
  //    correct path for invited members, who never match owner_user_id.
  const { data: membership, error: memberError } = await supabase
    .from('studio_members')
    .select('studio_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) throw memberError;

  if (membership) {
    cachedStudioId = membership.studio_id;
    return membership.studio_id;
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
    return existing.id;
  }

  // 3. Brand-new user: create the studio and its owner membership row together.
  const studioName = (user.user_metadata?.studio_name as string) || 'Mon studio';
  const { data: created, error: insertError } = await supabase
    .from('studios')
    .insert({ owner_user_id: user.id, name: studioName })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await insertOwnerMembership(created.id, user);
  const { seedBuiltInEventTypes } = await import('./eventTypeStore');
  await seedBuiltInEventTypes(created.id);
  cachedStudioId = created.id;
  return created.id;
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
