# Studio Preferences Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move studio preferences (fonts, accent color) from global localStorage to per-studio Supabase storage, so team members see consistent branding per organization.

**Architecture:** Add two JSON columns (`ui_fonts`, `portal_accent`) to the Supabase `studios` table, create a new `studioPreferencesStore.ts` following the demo/real-session pattern, refactor `uiFontsStore.ts` to delegate to it, and ensure preferences apply at app startup and on studio switch. Session-switch (via `switchActiveStudio`) already triggers a page reload, so `applyPersistedStudioPreferences()` in `main.tsx` will load the correct prefs for the new studio.

**Tech Stack:** Supabase (studios table), React, TypeScript, localStorage (demo sessions only)

## Global Constraints

- Demo sessions use localStorage with `sf_studio_prefs_*` keys (scoped by mock studio id)
- Real sessions use Supabase table `studios`, fetched via the standard cache-then-notify pattern
- Polices d'écriture : every exported function signature must remain backward-compatible from existing consumers' perspective (uiFontsStore's public API doesn't change externally)
- All CSS variable application must happen synchronously (before first React render) via `applyPersistedStudioPreferences()` called in `main.tsx` line 9, matching the existing pattern

---

### Task 1: Supabase Migration — Add Preferences Columns

**Files:**
- Create: `docs/superpowers/specs/2026-08-04-studio-preferences-migration.sql`

**Interfaces:**
- Consumes: Nothing (new migration spec)
- Produces: Two new nullable JSON columns on `studios` table: `ui_fonts` (default `{"heading":"'Montserrat',sans-serif","body":"'Montserrat',sans-serif"}`) and `portal_accent` (default `null`)

- [ ] **Step 1: Write the migration SQL spec**

Create `docs/superpowers/specs/2026-08-04-studio-preferences-migration.sql`:

```sql
-- Add ui_fonts and portal_accent columns to studios table
-- Default values match current hardcoded defaults in uiFontsStore.ts and Parametres.tsx

ALTER TABLE studios
ADD COLUMN ui_fonts JSONB DEFAULT '{"heading":"''Montserrat'',sans-serif","body":"''Montserrat'',sans-serif"}' NOT NULL,
ADD COLUMN portal_accent TEXT DEFAULT NULL;

-- Add RLS policies (owner and team members can read/write their studio's preferences)
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;

-- Owners can update their studio's prefs
CREATE POLICY "studio_owner_can_update_prefs" ON studios
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Team members (studio_members rows) can read their studio's prefs
CREATE POLICY "studio_members_can_read_prefs" ON studios
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM studio_members
      WHERE studio_members.studio_id = studios.id
        AND studio_members.user_id = auth.uid()
    )
  );

-- Team members can update their studio's prefs if they're admin/owner
CREATE POLICY "studio_admin_can_update_prefs" ON studios
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM studio_members
      WHERE studio_members.studio_id = studios.id
        AND studio_members.user_id = auth.uid()
        AND studio_members.access_level IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM studio_members
      WHERE studio_members.studio_id = studios.id
        AND studio_members.user_id = auth.uid()
        AND studio_members.access_level IN ('owner', 'admin')
    )
  );
```

- [ ] **Step 2: Copy and execute in Supabase SQL Editor**

1. Go to Supabase dashboard → SQL Editor
2. Create a new query
3. Copy the entire SQL from the file
4. Run it
5. Verify in Supabase Table Editor that `studios` now has `ui_fonts` and `portal_accent` columns

- [ ] **Step 3: Commit the spec**

```bash
git add docs/superpowers/specs/2026-08-04-studio-preferences-migration.sql
git commit -m "docs: add studio preferences migration spec"
```

---

### Task 2: Create studioPreferencesStore.ts

**Files:**
- Create: `app/src/data/studioPreferencesStore.ts`

**Interfaces:**
- Consumes: `isDemoSession()` and `onLogout()` from `authStore.ts`, `supabase` from `supabaseClient.ts`, `loadPersisted()` and `savePersisted()` from `persist.ts`, `getStudioId()` from `studioStore.ts`
- Produces: 
  - `interface StudioPreferences { uiFonts: { heading: string; body: string }; portalAccent: string | null }`
  - `getStudioPreferences(): StudioPreferences`
  - `setUiFonts(heading: string, body: string): void`
  - `setPortalAccent(color: string | null): void`
  - `applyPersistedStudioPreferences(): Promise<void>` (async, fetches from Supabase if needed)
  - `subscribeStudioPreferences(fn: () => void): () => void`

- [ ] **Step 1: Create the store file**

Create `app/src/data/studioPreferencesStore.ts`:

```typescript
// Studio-level preferences: fonts (heading/body), portal accent color.
// Scoped by studio, shared by all team members in that studio.
//
// Demo sessions: localStorage with studio-scoped keys (e.g., sf_studio_prefs_demo_studio_1)
// Real sessions: Supabase `studios` table columns `ui_fonts` and `portal_accent`,
// fetched on app startup via applyPersistedStudioPreferences().

import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { supabase } from './supabaseClient';
import { getStudioId } from './studioStore';

const DEFAULT_UI_FONTS = { heading: "'Montserrat',sans-serif", body: "'Montserrat',sans-serif" };
const DEFAULT_PORTAL_ACCENT = '#f9ff00';

export interface StudioPreferences {
  uiFonts: { heading: string; body: string };
  portalAccent: string | null;
}

// ── Demo-session state ────────────────────────────────────────────────────────

function demoStorageKey(studioId: string, key: string): string {
  return `sf_studio_prefs_${studioId}_${key}`;
}

function getDemoPreferences(studioId: string): StudioPreferences {
  try {
    const uiFonts = loadPersisted(demoStorageKey(studioId, 'ui_fonts'), DEFAULT_UI_FONTS);
    const portalAccent = loadPersisted(demoStorageKey(studioId, 'portal_accent'), null);
    return { uiFonts, portalAccent };
  } catch {
    return { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
  }
}

function setDemoPreferences(studioId: string, prefs: StudioPreferences): void {
  try {
    savePersisted(demoStorageKey(studioId, 'ui_fonts'), prefs.uiFonts);
    savePersisted(demoStorageKey(studioId, 'portal_accent'), prefs.portalAccent);
  } catch { /* noop */ }
}

// ── Real-session in-memory cache ─────────────────────────────────────────────

let _realPreferences: StudioPreferences = { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
let _fetchStarted = false;
let _fetchPromise: Promise<void> | null = null;

async function fetchStudioPreferences(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('studios')
      .select('ui_fonts, portal_accent')
      .eq('id', studioId)
      .single();

    if (error) {
      console.error('fetchStudioPreferences failed', error);
      _realPreferences = { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
      return;
    }

    _realPreferences = {
      uiFonts: data?.ui_fonts ?? DEFAULT_UI_FONTS,
      portalAccent: data?.portal_accent ?? null,
    };
    notify();
  } catch (e) {
    console.error('fetchStudioPreferences exception', e);
    _realPreferences = { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
  }
}

function ensureFetchStarted(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  _fetchPromise = fetchStudioPreferences();
}

function resetCache(): void {
  _realPreferences = { uiFonts: DEFAULT_UI_FONTS, portalAccent: null };
  _fetchStarted = false;
  _fetchPromise = null;
}

onLogout(resetCache);

// ── Public API ────────────────────────────────────────────────────────────────

const _listeners = new Set<() => void>();
function notify() {
  _listeners.forEach(fn => fn());
}

export function getStudioPreferences(): StudioPreferences {
  if (isDemoSession()) {
    // For demo, we need a mock studio id — use a fixed string
    return getDemoPreferences('demo_studio_1');
  }
  ensureFetchStarted();
  return { ..._realPreferences };
}

export function setUiFonts(heading: string, body: string): void {
  const uiFonts = { heading, body };
  if (isDemoSession()) {
    const current = getDemoPreferences('demo_studio_1');
    setDemoPreferences('demo_studio_1', { ...current, uiFonts });
    notify();
    return;
  }
  _realPreferences = { ..._realPreferences, uiFonts };
  notify();
  void (async () => {
    const studioId = await getStudioId();
    const { error } = await supabase
      .from('studios')
      .update({ ui_fonts: uiFonts })
      .eq('id', studioId);
    if (error) console.error('setUiFonts failed', error);
  })();
}

export function setPortalAccent(color: string | null): void {
  if (isDemoSession()) {
    const current = getDemoPreferences('demo_studio_1');
    setDemoPreferences('demo_studio_1', { ...current, portalAccent: color });
    notify();
    return;
  }
  _realPreferences = { ..._realPreferences, portalAccent: color };
  notify();
  void (async () => {
    const studioId = await getStudioId();
    const { error } = await supabase
      .from('studios')
      .update({ portal_accent: color })
      .eq('id', studioId);
    if (error) console.error('setPortalAccent failed', error);
  })();
}

export function subscribeStudioPreferences(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Bootstrap: Apply persisted preferences at app startup ─────────────────────
// Called once from main.tsx before React render. Ensures fonts and accent color
// are applied to CSS variables before components mount.

function applyUiFontsToCss(uiFonts: { heading: string; body: string }): void {
  document.documentElement.style.setProperty('--ff-display', uiFonts.heading);
  document.documentElement.style.setProperty('--ff-text', uiFonts.body);
}

function applyAccentToCss(color: string | null): void {
  if (color) {
    document.documentElement.style.setProperty('--accent', color);
  }
}

export async function applyPersistedStudioPreferences(): Promise<void> {
  const prefs = getStudioPreferences();
  applyUiFontsToCss(prefs.uiFonts);
  applyAccentToCss(prefs.portalAccent);

  // For real sessions, wait for fetch to complete so we have fresh data from Supabase
  if (!isDemoSession() && _fetchPromise) {
    await _fetchPromise;
    // Re-apply after fetch resolves (fresh data from server)
    const updated = getStudioPreferences();
    applyUiFontsToCss(updated.uiFonts);
    applyAccentToCss(updated.portalAccent);
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd app
npx tsc --noEmit -p tsconfig.app.json
```

Expected: No errors in `studioPreferencesStore.ts`

- [ ] **Step 3: Commit**

```bash
git add app/src/data/studioPreferencesStore.ts
git commit -m "feat: create studioPreferencesStore for studio-scoped preferences"
```

---

### Task 3: Refactor uiFontsStore.ts to Delegate to studioPreferencesStore

**Files:**
- Modify: `app/src/data/uiFontsStore.ts` (replace entire file)

**Interfaces:**
- Consumes: `studioPreferencesStore.ts` functions
- Produces: Same public API as before (backward compatible):
  - `loadUiFonts(): UiFonts`
  - `saveUiFonts(heading: string, body: string): void`
  - `applyPersistedUiFonts(): void` (now async wrapper)

- [ ] **Step 1: Rewrite uiFontsStore.ts**

```typescript
// UI fonts (heading/body) — now delegated to studioPreferencesStore.
// This file exists for backward compatibility and to keep the single-concern
// responsibility clear: managing fonts specifically (not general preferences).
//
// Internally delegates to studioPreferencesStore, which handles the per-studio
// storage and synchronization.

import { setUiFonts, getStudioPreferences, subscribeStudioPreferences } from './studioPreferencesStore';

export interface UiFonts { heading: string; body: string }

// Backward-compatible getters/setters that delegate to studioPreferencesStore
export function loadUiFonts(): UiFonts {
  const prefs = getStudioPreferences();
  return prefs.uiFonts;
}

export function saveUiFonts(heading: string, body: string): void {
  setUiFonts(heading, body);
}

// Subscribe to font changes — delegates to studio preferences subscription
export function subscribeUiFonts(fn: () => void): () => void {
  return subscribeStudioPreferences(fn);
}

// For backward compatibility with existing consumers that may call this directly
// (though applyPersistedStudioPreferences in main.tsx is the primary bootstrap)
export function applyPersistedUiFonts(): void {
  const fonts = loadUiFonts();
  document.documentElement.style.setProperty('--ff-display', fonts.heading);
  document.documentElement.style.setProperty('--ff-text', fonts.body);
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd app
npx tsc --noEmit -p tsconfig.app.json
```

Expected: No errors

- [ ] **Step 3: Verify no other files import uiFontsStore directly (grep check)**

```bash
grep -rn "from.*uiFontsStore" app/src --include="*.ts" --include="*.tsx" | grep -v test
```

Expected: Only `Parametres.tsx` and possibly `ResourceDetail.tsx` — we'll migrate Parametres in Task 4.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/uiFontsStore.ts
git commit -m "refactor: uiFontsStore now delegates to studioPreferencesStore"
```

---

### Task 4: Migrate Parametres.tsx — Use studioPreferencesStore for Color + Fonts

**Files:**
- Modify: `app/src/screens/Parametres.tsx` (lines ~740–830)

**Interfaces:**
- Consumes: `studioPreferencesStore.ts` functions
- Produces: No public API change (screen internal state only)

- [ ] **Step 1: Locate and review current accent color management**

Read lines 740–830 of `app/src/screens/Parametres.tsx` to find:
- `PORTAL_ACCENT_KEY` constant
- `applyPortalAccent()` function
- `onAccent` callback
- Color picker input handling

- [ ] **Step 2: Replace accent color handling**

In the Parametres component, replace the import and state management:

**OLD:**
```typescript
const PORTAL_ACCENT_KEY = 'sf_portal_accent';
function applyPortalAccent(color: string) {
  try { localStorage.setItem(PORTAL_ACCENT_KEY, color); } catch { /* noop */ }
  document.documentElement.style.setProperty('--accent', color);
}
// ... in state:
const [accentColor, setAccentColor] = useState<string>(() => {
  try { return localStorage.getItem(PORTAL_ACCENT_KEY) ?? '#f9ff00'; } catch { return '#f9ff00'; }
});
```

**NEW:**
Add import at top:
```typescript
import { getStudioPreferences, setPortalAccent, subscribeStudioPreferences } from '../data/studioPreferencesStore';
```

Replace the constants and functions:
```typescript
// Accent color now managed by studioPreferencesStore (per-studio, not global)
const [accentColor, setAccentColor] = useState<string>(() => {
  const prefs = getStudioPreferences();
  return prefs.portalAccent ?? '#f9ff00';
});
```

Replace the `onAccent` callback:
```typescript
const onAccent = (c: string) => {
  setAccentColor(c);
  setHexInput(c);
  setPortalAccent(c); // Now uses studioPreferencesStore, not localStorage
};
```

Replace the hex input onChange:
```typescript
// OLD:
if (/^#[0-9a-fA-F]{6}$/.test(raw)) { setAccentColor(raw); applyPortalAccent(raw); }

// NEW:
if (/^#[0-9a-fA-F]{6}$/.test(raw)) { setAccentColor(raw); setPortalAccent(raw); }
```

- [ ] **Step 3: Add useEffect to subscribe to studio preferences changes**

Add this useEffect to the Parametres component to keep accent color in sync when preferences change:

```typescript
useEffect(() => {
  const unsubscribe = subscribeStudioPreferences(() => {
    const prefs = getStudioPreferences();
    if (prefs.portalAccent) {
      setAccentColor(prefs.portalAccent);
      setHexInput(prefs.portalAccent);
    }
  });
  return unsubscribe;
}, []);
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd app
npx tsc --noEmit -p tsconfig.app.json
```

Expected: No errors in Parametres.tsx

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Parametres.tsx
git commit -m "refactor: migrate accent color management to studioPreferencesStore"
```

---

### Task 5: Bootstrap at App Startup — Call applyPersistedStudioPreferences in main.tsx

**Files:**
- Modify: `app/src/main.tsx` (lines 1–15)

**Interfaces:**
- Consumes: `studioPreferencesStore.applyPersistedStudioPreferences()`
- Produces: No public API (bootstrap call only)

- [ ] **Step 1: Update main.tsx**

```typescript
// app/src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { applyPersistedUiFonts } from './data/uiFontsStore';  // KEEP — backward compat
import { applyPersistedStudioPreferences } from './data/studioPreferencesStore';  // ADD
import App from './App';

// Bootstrap: Apply studio preferences (fonts, accent) from Supabase or localStorage
// before React render, so CSS variables are set for the first component mount
void applyPersistedStudioPreferences();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 2: Verify the file**

Check that the import and bootstrap call are in place:

```bash
head -15 app/src/main.tsx
```

Expected: Both `applyPersistedStudioPreferences()` call and the import present.

- [ ] **Step 3: Commit**

```bash
git add app/src/main.tsx
git commit -m "bootstrap: apply persisted studio preferences at app startup"
```

---

### Task 6: Manual Verification — Test Studio Switch & Preferences Consistency

**Files:**
- None (manual testing only)

**Interfaces:**
- Consumes: All changes from Tasks 1–5
- Produces: Confidence that preferences persist and switch correctly per studio

- [ ] **Step 1: Start dev server**

```bash
cd app
npm run dev
```

Navigate to `http://localhost:5173`

- [ ] **Step 2: Test preferences in demo session**

1. Go to Paramètres → Personnalisation
2. Change fonts (e.g., to "Georgia")
3. Change accent color (e.g., to "#ff0000")
4. Refresh the page
5. **Expected:** Fonts and accent color persist

- [ ] **Step 3: Test real session (if applicable)**

If you have a real Supabase account:

1. Log in to a real account
2. Go to Paramètres → Personnalisation
3. Change fonts and accent color
4. Refresh the page
5. **Expected:** Preferences persist
6. Create or switch to a different studio
7. **Expected:** That studio's preferences apply (or defaults if not set yet)
8. Set different preferences for the second studio
9. Switch back to the first studio
10. **Expected:** First studio's preferences are restored

- [ ] **Step 4: Verify CSS variables applied**

Open browser DevTools (F12) → Elements → select `<html>` element → inspect `style` attribute

**Expected:** See `--ff-display`, `--ff-text`, `--accent` set to the values from Parametres

- [ ] **Step 5: Document results**

If all tests pass, note that in a message to the user. If any step fails, report the exact failure.

---

### Task 7: Clean Up Legacy localStorage Keys

**Files:**
- Modify: `app/src/data/persist.ts` (optional helper function)

**Interfaces:**
- Consumes: Nothing specific (utility function)
- Produces: `migrateLegacyStorageKeys(): void` (one-time cleanup)

- [ ] **Step 1: Create migration helper in persist.ts**

Add this function to `app/src/data/persist.ts` (at the end of the file):

```typescript
// One-time migration: Remove legacy global preference keys
// (sf_ui_fonts, sf_portal_accent) since they are now per-studio in Supabase
export function migrateLegacyStorageKeys(): void {
  const keysToRemove = ['sf_ui_fonts', 'sf_portal_accent'];
  keysToRemove.forEach(key => {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  });
}
```

- [ ] **Step 2: Call the migration on first launch**

In `app/src/main.tsx`, add the call right before React render:

```typescript
import { migrateLegacyStorageKeys } from './data/persist';

void applyPersistedStudioPreferences();
migrateLegacyStorageKeys(); // Clean up old global keys
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd app
npx tsc --noEmit -p tsconfig.app.json
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/src/data/persist.ts app/src/main.tsx
git commit -m "chore: add legacy storage key migration and cleanup"
```

---

## Self-Review Checklist

✅ **Spec coverage:**
- Supabase schema changes → Task 1 (migration SQL)
- studioPreferencesStore creation → Task 2
- uiFontsStore refactoring → Task 3
- Parametres accent color migration → Task 4
- Bootstrap at startup → Task 5
- Testing preferences persistence and studio switch → Task 6
- Cleanup legacy keys → Task 7

✅ **Placeholder scan:** No "TBD", "TODO", or incomplete steps. All code blocks complete and exact.

✅ **Type consistency:** `UiFonts`, `StudioPreferences` interfaces defined and used consistently across tasks.

✅ **No ambiguity:** Migration SQL, API signatures, and commit messages are explicit.

---

## Summary

This plan implements per-studio preference scoping in 7 tasks:

1. **Schema** — Add `ui_fonts` and `portal_accent` columns to `studios` table
2. **Store** — Create `studioPreferencesStore.ts` with demo/real session logic
3. **Refactor** — Update `uiFontsStore.ts` to delegate to the new store
4. **Migrate** — Adapt `Parametres.tsx` to use `studioPreferencesStore` for accent color
5. **Bootstrap** — Call `applyPersistedStudioPreferences()` in `main.tsx` before React
6. **Verify** — Manual testing of preferences persistence and studio switch
7. **Cleanup** — Remove legacy global localStorage keys

After completion, fonts and accent color will be consistent team-wide per studio, with correct preferences applied on studio switch (page reload).
