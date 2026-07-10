// Shared "first fetch in flight" flag factory.
//
// Every real-session store lazily fetches from Supabase on first read and
// caches synchronously afterward (see projectStore.ts etc. for the pattern).
// That means on a fresh page load there's a brief window — the first fetch's
// round-trip — where the cache is empty for a reason completely different
// from "there's genuinely nothing here". Without a separate signal, screens
// can't tell the two apart and flash their real empty state, which reads as
// "you lost your data". This tiny helper gives each store a boolean screens
// can check before deciding which one to show.
//
// Demo sessions never go through this — they're synchronous from the start,
// so loading is always `false` for them.

export interface LoadingFlag {
  isLoading(): boolean;
  markLoading(): void;
  markLoaded(): void;
  reset(): void;
}

export function createLoadingFlag(): LoadingFlag {
  let loading = true;
  return {
    isLoading: () => loading,
    markLoading: () => { loading = true; },
    markLoaded: () => { loading = false; },
    reset: () => { loading = true; },
  };
}
