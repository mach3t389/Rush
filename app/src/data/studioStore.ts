// Resolves the current real (non-demo) user's studio row, creating it on first
// access. Demo sessions never call this — see isDemoSession() in authStore.ts.

import { supabase } from './supabaseClient';

let cachedStudioId: string | null = null;

export async function getStudioId(): Promise<string> {
  if (cachedStudioId) return cachedStudioId;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('getStudioId called without an authenticated Supabase user');

  const { data: existing, error: selectError } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    cachedStudioId = existing.id;
    return existing.id;
  }

  const studioName = (user.user_metadata?.studio_name as string) || 'Mon studio';
  const { data: created, error: insertError } = await supabase
    .from('studios')
    .insert({ owner_user_id: user.id, name: studioName })
    .select('id')
    .single();

  if (insertError) throw insertError;

  cachedStudioId = created.id;
  return created.id;
}

export function resetStudioIdCache(): void {
  cachedStudioId = null;
}
