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

// Demo sessions never touch Supabase and should never be blocked — default
// to the most permissive plan until a real fetch (which demo never triggers)
// would overwrite it.
let _plan: PlanKey = 'agence';
let _billingSeats = 50;
let _fetchStarted = false;

async function fetchPlan(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('studios')
    .select('plan, billing_seats')
    .eq('id', studioId)
    .single();
  if (error) { console.error('fetchPlan failed', error); return; }
  _plan = (data.plan as PlanKey) ?? 'gratuit';
  _billingSeats = data.billing_seats ?? 2;
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
  void fetchPlan();
}

export function resetPlanCache(): void {
  _plan = 'agence';
  _billingSeats = 50;
  _fetchStarted = false;
}

export function getCurrentPlan(): PlanKey {
  if (isDemoSession()) return 'agence';
  ensureFetchStarted();
  return _plan;
}

export function getCurrentBillingSeats(): number {
  if (isDemoSession()) return 50;
  ensureFetchStarted();
  return _billingSeats;
}

export function usePlan(): PlanKey {
  const [plan, setPlan] = useState<PlanKey>(getCurrentPlan);
  useEffect(() => subscribePlan(() => setPlan(getCurrentPlan())), []);
  return plan;
}
