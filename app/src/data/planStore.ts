// app/src/data/planStore.ts
// Reactive cache of the current studio's Stripe plan/seat count, sourced
// from `studios.plan`/`billing_seats` (populated by the chantier A webhook —
// see app/api/stripe-webhook.ts). Same get/subscribe pattern as the other
// stores in this file (studioStore.ts, projectStore.ts).

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import type { PlanKey } from './planFeatures';

type Listener = () => void;
const listeners: Listener[] = [];
function notify() { listeners.forEach(l => l()); }
export function subscribePlan(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

// Demo sessions never touch Supabase and should never be blocked — they use
// the most permissive plan directly (DEMO_* below), never the module state.
const DEMO_PLAN: PlanKey = 'agence';
const DEMO_SEATS = 50;
const DEMO_STORAGE_TIER = 6;

// Real sessions: least-privilege fallback while the fetch is in flight OR if
// it fails outright (e.g. the studio/org couldn't be resolved — see
// studioStore's getStudioId). Deliberately the OPPOSITE of the demo
// defaults: a real session that hasn't proven its plan should never look
// like it's on the most permissive tier with unlimited-looking storage.
const SAFE_PLAN: PlanKey = 'gratuit';
const SAFE_SEATS = 2;
const SAFE_STORAGE_TIER = 0;

const MAX_FETCH_RETRIES = 3;

let _plan: PlanKey | null = null;
let _billingSeats: number | null = null;
let _storageTier: number | null = null;
let _fetchStarted = false;
let _fetchAttempts = 0;

async function fetchPlan(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('studios')
      .select('plan, billing_seats, billing_storage_tier')
      .eq('id', studioId)
      .single();
    if (error) throw error;
    _plan = (data.plan as PlanKey) ?? 'gratuit';
    _billingSeats = data.billing_seats ?? 2;
    _storageTier = data.billing_storage_tier ?? 0;
  } catch (err) {
    console.error('fetchPlan failed', err);
    // Let a later getter call retry (bounded) instead of getting stuck
    // showing the last-known (or default) values forever.
    if (_fetchAttempts < MAX_FETCH_RETRIES) _fetchStarted = false;
  }
  notify();
}

let _logoutHookRegistered = false;
function ensureFetchStarted(): void {
  if (!_logoutHookRegistered) {
    _logoutHookRegistered = true;
    onLogout(resetPlanCache);
  }
  if (_fetchStarted) return;
  _fetchStarted = true;
  _fetchAttempts += 1;
  void fetchPlan();
}

export function resetPlanCache(): void {
  _plan = null;
  _billingSeats = null;
  _storageTier = null;
  _fetchStarted = false;
  _fetchAttempts = 0;
}

export function getCurrentPlan(): PlanKey {
  if (isDemoSession()) return DEMO_PLAN;
  ensureFetchStarted();
  return _plan ?? SAFE_PLAN;
}

export function getCurrentBillingSeats(): number {
  if (isDemoSession()) return DEMO_SEATS;
  ensureFetchStarted();
  return _billingSeats ?? SAFE_SEATS;
}

export function getCurrentStorageTier(): number {
  if (isDemoSession()) return DEMO_STORAGE_TIER;
  ensureFetchStarted();
  return _storageTier ?? SAFE_STORAGE_TIER;
}

export function usePlan(): PlanKey {
  const [plan, setPlan] = useState<PlanKey>(getCurrentPlan);
  useEffect(() => subscribePlan(() => setPlan(getCurrentPlan())), []);
  return plan;
}
