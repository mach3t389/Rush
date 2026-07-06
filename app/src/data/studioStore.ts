// Resolves the current real (non-demo) user's studio row, creating it on first
// access. Demo sessions never call this — see isDemoSession() in authStore.ts.

import { supabase } from './supabaseClient';

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
