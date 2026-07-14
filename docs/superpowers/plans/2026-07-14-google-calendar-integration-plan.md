# Google Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organisation connect one Google Calendar account to Rush, with events created/edited/deleted in Rush pushed to Google immediately, and events created/edited/deleted directly in Google pulled into Rush every 15 minutes.

**Architecture:** A new Supabase table (`google_calendar_connections`) holds one row per studio's OAuth tokens, touched only by service-role serverless functions — the client never sees raw tokens, only a small `{connected, lastSyncedAt}` status. `eventStore.ts`'s existing real-session write functions (`addSupabaseEvent`/`updateSupabaseEvent`/`deleteSupabaseEvent`) fire-and-forget a call to a new push endpoint after each successful Supabase write. A Vercel Cron job hits a pull endpoint every 15 minutes per connected studio, using Google's incremental `syncToken` to fetch only what changed. All Google API calls use plain `fetch` against Google's REST endpoints (no `googleapis` SDK), matching this codebase's existing pattern of calling third-party APIs directly (see `app/api/ai-chat.ts`'s Anthropic calls).

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + Auth), Vercel serverless functions + Cron, Google Calendar API v3 + Google OAuth 2.0 (via raw `fetch`, no new npm dependency).

## Global Constraints

- No hard-coded user-facing text — everything through `t('namespace.key')`, added to both `app/src/locales/fr.json` and `app/src/locales/en.json`.
- One Google Calendar connection per organisation (studio), not per person.
- Available on every plan — no `canUseFeature`/plan gating anywhere in this feature.
- Google tokens (`access_token`, `refresh_token`) are readable/writable ONLY by service-role serverless functions — never granted to `authenticated` in Supabase, never sent to the client in any API response.
- Conflict resolution is last-write-wins by timestamp — no merge logic anywhere.
- Supabase migrations are specs, not applied automatically — every `.sql` file must be pasted into the Supabase SQL editor by the user manually.
- Follow existing codebase patterns: inline `style={{}}` (not Tailwind), CSS tokens from `app/src/index.css`, `SFIcon`/`SFButton` from `app/src/components/ui`, serverless functions verify a Supabase bearer token then check `studio_members` membership directly (see `app/api/update-subscription.ts` for the reference pattern), no test suite exists — verification is manual via the dev server (and, for this feature specifically, a real Google account, since the OAuth/sync flows can't be exercised through Supabase alone the way the multi-organization feature's flows could).

---

### Task 1: Preconditions — Vercel cron limits, Google Cloud setup, and the database migration

This task has no code to write; it unblocks every other task.

- [ ] **Step 1: Check the Vercel account's cron plan**

Ask the user: "Peux-tu vérifier dans les paramètres de ton projet Vercel (Settings → Cron Jobs, ou ton plan de facturation) si les tâches planifiées peuvent tourner toutes les 15 minutes ? Le plan Hobby gratuit de Vercel limite historiquement les cron jobs à une fois par jour — si c'est le cas pour toi, on ajustera l'intervalle (par exemple une fois par jour au lieu de toutes les 15 minutes) plutôt que de construire quelque chose que ton compte ne peut pas exécuter."

Record the answer. If the account cannot run a 15-minute cron, every later reference to `*/15 * * * *` in this plan becomes the supported interval instead (e.g. `0 0 * * *` for once daily) — note this substitution before starting Task 6.

- [ ] **Step 2: Ask the user to set up Google Cloud OAuth credentials**

Tell the user: "Avant de coder, il faut créer les identifiants Google. Étapes :
1. Va sur [console.cloud.google.com](https://console.cloud.google.com), crée un nouveau projet (ou utilise un existant).
2. Dans 'APIs & Services' → 'Library', cherche 'Google Calendar API' et clique 'Enable'.
3. Dans 'APIs & Services' → 'OAuth consent screen', configure un écran de consentement basique (nom de l'app 'Rush', ton email de contact) — pas besoin de vérification Google pour commencer en mode test.
4. Dans 'APIs & Services' → 'Credentials', clique 'Create Credentials' → 'OAuth client ID', type 'Web application'. Dans 'Authorized redirect URIs', ajoute `https://<ton-domaine-vercel>/api/google-calendar-oauth-callback` (et `http://localhost:5173/api/google-calendar-oauth-callback` si tu veux tester en local, mais ça ne marchera pas vraiment sans un vrai déploiement Vercel puisque c'est une fonction serverless).
5. Copie le 'Client ID' et le 'Client secret' générés.
6. Dans les paramètres du projet Vercel → Environment Variables, ajoute `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, et `GOOGLE_OAUTH_REDIRECT_URI` (l'URL complète de l'étape 4)."

Wait for confirmation before proceeding to Step 3.

- [ ] **Step 3: Write the database migration**

Create `docs/superpowers/specs/2026-07-14-google-calendar-migration.sql`:

```sql
-- Google Calendar integration: one OAuth connection per organisation,
-- readable/writable only by service-role serverless functions — never
-- granted to `authenticated`, since these rows hold live OAuth tokens.
-- Run once in the Supabase SQL editor.

create table google_calendar_connections (
  studio_id uuid primary key references studios(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  google_calendar_id text not null default 'primary',
  sync_token text,
  connected_by_user_id uuid not null references auth.users(id),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);

alter table google_calendar_connections enable row level security;
-- Deliberately no policies and no grants — only the service role (which
-- bypasses RLS) ever reads or writes this table.

-- Links a Rush event to the Google Calendar event it's synced with, so
-- later pushes/pulls update the same event instead of creating duplicates.
alter table events add column google_event_id text;
```

- [ ] **Step 4: Ask the user to run it**

Tell the user: "Peux-tu coller et exécuter `docs/superpowers/specs/2026-07-14-google-calendar-migration.sql` dans l'éditeur SQL de Supabase ?" Wait for confirmation.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-14-google-calendar-migration.sql
git commit -m "docs: add Google Calendar integration migration spec"
```

---

### Task 2: OAuth start + callback

**Files:**
- Create: `app/api/_lib/googleCalendarAuth.ts`
- Create: `app/api/google-calendar-oauth-start.ts`
- Create: `app/api/google-calendar-oauth-callback.ts`

**Interfaces:**
- Consumes: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (env vars from Task 1), `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (already used by every other serverless function in `app/api`).
- Produces: `signOAuthState(studioId: string): string`, `verifyOAuthState(state: string): { studioId: string } | null` (exported from `googleCalendarAuth.ts`, reused by the callback in this task and nowhere else in this plan). `GET /api/google-calendar-oauth-start` (requires `Authorization: Bearer <token>` + `?studioId=`, returns `{ url: string }`). `GET /api/google-calendar-oauth-callback?code=...&state=...` (no auth header — a real browser redirect from Google; redirects the browser to `/parametres?section=integrations&google=connected` or `...&google=error`).

- [ ] **Step 1: Write the signed-state helper**

A browser redirect from Google carries no `Authorization` header, so the callback can't re-verify the caller's session the way every other endpoint in this codebase does. Instead, the start endpoint signs `studioId` (proving *it* was called by an authenticated member) into an opaque `state` string that only the callback can verify, using `SUPABASE_SERVICE_ROLE_KEY` as the HMAC secret (already a server-only secret in every deployment of this app — no new secret to manage).

```typescript
// app/api/_lib/googleCalendarAuth.ts
import { createHmac } from 'crypto';

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — plenty for a consent-screen round trip

export function signOAuthState(studioId: string): string {
  const payload = `${studioId}.${Date.now()}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function verifyOAuthState(state: string): { studioId: string } | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [studioId, tsStr, sig] = decoded.split('.');
    if (!studioId || !tsStr || !sig) return null;
    const payload = `${studioId}.${tsStr}`;
    const expectedSig = createHmac('sha256', SECRET).update(payload).digest('hex');
    if (sig !== expectedSig) return null;
    if (Date.now() - Number(tsStr) > MAX_AGE_MS) return null;
    return { studioId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Write the OAuth start endpoint**

```typescript
// app/api/google-calendar-oauth-start.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { signOAuthState } from './_lib/googleCalendarAuth.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const studioId = req.query.studioId as string | undefined;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const state = signOAuthState(studioId);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent',      // forces a refresh_token even on repeat connections
    state,
  });

  res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}
```

- [ ] **Step 3: Write the OAuth callback endpoint**

```typescript
// app/api/google-calendar-oauth-callback.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyOAuthState } from './_lib/googleCalendarAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  const redirectBase = req.headers.origin || 'https://rush.app';

  if (!code || !state) {
    res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
    return;
  }

  const verified = verifyOAuthState(state);
  if (!verified) {
    res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', await tokenRes.text());
      res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
      return;
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on the FIRST consent (or when
      // prompt=consent forces re-consent, which oauth-start always sets) —
      // if it's still missing here, something is wrong with the request.
      console.error('No refresh_token in Google response — check prompt=consent is set in oauth-start');
      res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
      return;
    }

    const supabaseAdmin = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Who to record as connected_by_user_id: any member of this studio at
    // the time of connection — the first row found is fine, this field is
    // informational only (e.g. "connected by Alice on ..." in a future UI).
    const { data: anyMember } = await supabaseAdmin
      .from('studio_members')
      .select('user_id')
      .eq('studio_id', verified.studioId)
      .limit(1)
      .maybeSingle();

    const { error: upsertError } = await supabaseAdmin
      .from('google_calendar_connections')
      .upsert({
        studio_id: verified.studioId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        google_calendar_id: 'primary',
        connected_by_user_id: anyMember?.user_id ?? null,
        connected_at: new Date().toISOString(),
        sync_token: null, // force a fresh full sync on the next pull
      }, { onConflict: 'studio_id' });

    if (upsertError) {
      console.error('Failed to store Google Calendar connection:', upsertError);
      res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
      return;
    }

    res.redirect(302, `${redirectBase}/parametres?section=integrations&google=connected`);
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors. (Note: `app/api/*.ts` files are not covered by `tsconfig.app.json` — this only confirms nothing in `app/src` broke. There's no local way to typecheck `app/api` in this project; Vercel compiles it at deploy time, same as every prior serverless function added in this codebase.)

- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/googleCalendarAuth.ts app/api/google-calendar-oauth-start.ts app/api/google-calendar-oauth-callback.ts
git commit -m "feat: add Google Calendar OAuth start and callback endpoints"
```

---

### Task 3: Status + disconnect endpoints, and the client data module

**Files:**
- Create: `app/api/google-calendar-status.ts`
- Create: `app/api/google-calendar-disconnect.ts`
- Create: `app/src/data/googleCalendarStore.ts`

**Interfaces:**
- Consumes: `getStudioId` from `../data/studioStore` (client side); the `google_calendar_connections` table (server side, from Task 1/2).
- Produces: `GET /api/google-calendar-status?studioId=` → `{ connected: boolean, lastSyncedAt: string | null }`. `POST /api/google-calendar-disconnect` (body `{ studioId }`) → `{ ok: true }`. Client: `getGoogleCalendarStatus(): Promise<{ connected: boolean; lastSyncedAt: string | null }>`, `startGoogleCalendarConnect(): Promise<void>` (redirects the browser), `disconnectGoogleCalendar(): Promise<void>`.

- [ ] **Step 1: Write the status endpoint**

```typescript
// app/api/google-calendar-status.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const studioId = req.query.studioId as string | undefined;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const { data: connection } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('last_synced_at')
    .eq('studio_id', studioId)
    .maybeSingle();

  res.status(200).json({
    connected: !!connection,
    lastSyncedAt: connection?.last_synced_at ?? null,
  });
}
```

- [ ] **Step 2: Write the disconnect endpoint**

```typescript
// app/api/google-calendar-disconnect.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

interface DisconnectBody {
  studioId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId } = req.body as DisconnectBody;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('google_calendar_connections')
    .delete()
    .eq('studio_id', studioId);

  if (error) {
    console.error('Failed to disconnect Google Calendar:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
    return;
  }

  res.status(200).json({ ok: true });
}
```

- [ ] **Step 3: Write the client data module**

```typescript
// app/src/data/googleCalendarStore.ts
import { supabase } from './supabaseClient';
import { getStudioId } from './studioStore';

export interface GoogleCalendarStatus {
  connected: boolean;
  lastSyncedAt: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-status?studioId=${studioId}`, { headers });
  if (!resp.ok) return { connected: false, lastSyncedAt: null };
  return resp.json();
}

export async function startGoogleCalendarConnect(): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-oauth-start?studioId=${studioId}`, { headers });
  if (!resp.ok) throw new Error('Failed to start Google Calendar connection');
  const { url } = await resp.json();
  window.location.href = url;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-disconnect', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studioId }),
  });
  if (!resp.ok) throw new Error('Failed to disconnect Google Calendar');
}
```

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/google-calendar-status.ts app/api/google-calendar-disconnect.ts app/src/data/googleCalendarStore.ts
git commit -m "feat: add Google Calendar status/disconnect endpoints and client store"
```

---

### Task 4: Wire the Paramètres → Intégrations UI to the real connection

**Files:**
- Modify: `app/src/screens/Parametres.tsx:2124-2176` (the existing Google Calendar placeholder card)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getGoogleCalendarStatus`, `startGoogleCalendarConnect`, `disconnectGoogleCalendar` from `../data/googleCalendarStore` (Task 3).

- [ ] **Step 1: Replace the placeholder card**

Read `app/src/screens/Parametres.tsx` first. Add the import near the other data-store imports:

```typescript
import { getGoogleCalendarStatus, startGoogleCalendarConnect, disconnectGoogleCalendar, type GoogleCalendarStatus } from '../data/googleCalendarStore';
```

Find the exact block from `{/* Google Calendar */}` through its closing `</div>` (lines 2131–2176 in the current file — the card containing the SVG logo, the feature-bullet list, and the disabled "Connecter Google Agenda" button) and replace it entirely with:

```typescript
            {/* Google Calendar */}
            <GoogleCalendarCard />
```

Then add the `GoogleCalendarCard` component in the same file, above `export function Parametres` (same pattern as the existing top-level helper components like `LogoUploader`):

```typescript
function GoogleCalendarCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getGoogleCalendarStatus();
      if (!cancelled) setStatus(s);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google');
    if (result) {
      const url = new URL(window.location.href);
      url.searchParams.delete('google');
      window.history.replaceState({}, '', url);
      if (result === 'connected') {
        void getGoogleCalendarStatus().then(setStatus);
      }
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await startGoogleCalendarConnect();
    } catch (err) {
      console.error('Failed to start Google Calendar connection', err);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectGoogleCalendar();
      setStatus({ connected: false, lastSyncedAt: null });
    } catch (err) {
      console.error('Failed to disconnect Google Calendar', err);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="#fff" stroke="#dadce0" strokeWidth="1.5"/>
            <rect x="3" y="3" width="18" height="5" rx="2" fill="#4285F4"/>
            <rect x="3" y="6" width="18" height="2" fill="#4285F4"/>
            <text x="12" y="18" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="8" fill="#4285F4">31</text>
            <line x1="8" y1="3" x2="8" y2="6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="16" y1="3" x2="16" y2="6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Google Calendar</p>
            {status?.connected && (
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(52,201,138,0.12)', border: '1px solid rgba(52,201,138,0.3)', color: 'var(--ok)', letterSpacing: '0.06em' }}>
                {t('settings.gcalConnected')}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {status?.connected && status.lastSyncedAt
              ? t('settings.gcalLastSynced', { time: new Date(status.lastSyncedAt).toLocaleString() })
              : t('settings.googleCalendarDesc')}
          </p>
        </div>
      </div>

      {!status?.connected && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)' }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.whatThisEnables')}</p>
          {[
            { icon: 'calendar', text: t('settings.gcalFeatureAutoAdd') },
            { icon: 'refresh-cw', text: t('settings.gcalFeatureBidirectional') },
            { icon: 'bell', text: t('settings.gcalFeatureReminders') },
          ].map(item => (
            <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SFIcon name={item.icon as any} size={13} color="var(--text-3)" />
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.text}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {status?.connected ? (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontSize: 13, cursor: disconnecting ? 'not-allowed' : 'pointer', fontFamily: 'var(--ff-text)', fontWeight: 500 }}
          >
            {disconnecting ? '…' : t('settings.gcalDisconnect')}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting || status === null}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, cursor: connecting ? 'not-allowed' : 'pointer', fontFamily: 'var(--ff-text)', fontWeight: 500 }}
          >
            <svg width="14" height="14" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
            {connecting ? '…' : t('settings.connectGoogleCalendar')}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fix the overpromising "real-time" copy and add new keys**

The existing `gcalFeatureBidirectional` string says "temps réel" (real-time), but Google→Rush sync is a 15-minute poll, not real-time — fix it while adding the new keys. In `app/src/locales/fr.json`:

```json
    "gcalFeatureBidirectional": "Synchronisation dans les deux sens (Google vers Rush toutes les 15 minutes)",
```

(replacing the existing `"gcalFeatureBidirectional": "Synchronisation bidirectionnelle en temps réel",` line) and add, near the other `gcal*` keys:

```json
    "gcalConnected": "Connecté",
    "gcalLastSynced": "Dernière synchronisation : {{time}}",
    "gcalDisconnect": "Déconnecter",
```

In `app/src/locales/en.json`, find the equivalent `gcalFeatureBidirectional` line and replace it:

```json
    "gcalFeatureBidirectional": "Two-way sync (Google to Rush every 15 minutes)",
```

and add:

```json
    "gcalConnected": "Connected",
    "gcalLastSynced": "Last synced: {{time}}",
    "gcalDisconnect": "Disconnect",
```

- [ ] **Step 3: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Requires Task 1's migration to be run and Task 2/3's endpoints deployed (this card can't be meaningfully tested against a local `vite dev` server alone, since `/api/*` routes are Vercel functions — deploy to Vercel first, or use `vercel dev` if available in this environment).

1. Log in with a real (non-demo) account, go to Paramètres → Intégrations.
2. Confirm the card shows "Connecter Google Agenda" (not connected).
3. Click it — expect a redirect to Google's consent screen.
4. Approve access, get redirected back — confirm the card now shows "Connecté" (no last-sync time yet, since no pull has run).
5. Click "Déconnecter" — confirm it reverts to the not-connected state.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Parametres.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: wire Paramètres Google Calendar card to the real connection"
```

---

### Task 5: Push sync (Rush → Google)

**Files:**
- Create: `app/api/_lib/googleCalendarApi.ts`
- Create: `app/api/google-calendar-push.ts`
- Modify: `app/src/data/eventStore.ts:159-180` (`addSupabaseEvent`/`updateSupabaseEvent`/`deleteSupabaseEvent`)

**Interfaces:**
- Consumes: `google_calendar_connections` table (Task 1); `events.google_event_id` column (Task 1).
- Produces: `refreshAccessTokenIfNeeded(supabaseAdmin, studioId): Promise<string>` (returns a valid access token, refreshing and persisting it first if expired) and `googleCalendarRequest(accessToken, calendarId, method, path, body?): Promise<any>` (both exported from `googleCalendarApi.ts`, reused by Task 6). `POST /api/google-calendar-push` (body `{ studioId, eventId, action: 'create' | 'update' | 'delete' }`).

- [ ] **Step 1: Write the shared Google Calendar API helper**

```typescript
// app/api/_lib/googleCalendarApi.ts
import type { SupabaseClient } from '@supabase/supabase-js';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

interface ConnectionRow {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  google_calendar_id: string;
}

// Returns a valid access token for the studio's connection, refreshing it
// first (and persisting the refreshed token) if it's expired or expiring
// within the next minute. Returns null if there's no connection at all.
export async function getValidAccessToken(
  supabaseAdmin: SupabaseClient,
  studioId: string
): Promise<{ accessToken: string; calendarId: string } | null> {
  const { data: connection } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('access_token, refresh_token, access_token_expires_at, google_calendar_id')
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!connection) return null;
  const conn = connection as ConnectionRow;

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return { accessToken: conn.access_token, calendarId: conn.google_calendar_id };
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    console.error('Failed to refresh Google access token:', await tokenRes.text());
    return null;
  }

  const refreshed = await tokenRes.json() as { access_token: string; expires_in: number };

  await supabaseAdmin
    .from('google_calendar_connections')
    .update({
      access_token: refreshed.access_token,
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq('studio_id', studioId);

  return { accessToken: refreshed.access_token, calendarId: conn.google_calendar_id };
}

export async function googleCalendarRequest(
  accessToken: string,
  calendarId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<any> {
  const resp = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (method === 'DELETE') {
    if (!resp.ok && resp.status !== 410 && resp.status !== 404) {
      throw new Error(`Google Calendar API ${method} ${path} failed: ${resp.status}`);
    }
    return null;
  }

  if (!resp.ok) {
    throw new Error(`Google Calendar API ${method} ${path} failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

// Converts a Rush CalendarEvent row's fields into Google's event body shape.
export function toGoogleEventBody(ev: {
  title: string;
  start: string;
  end: string;
  allDay?: boolean | null;
  description?: string | null;
  location?: string | null;
}) {
  return {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    start: ev.allDay ? { date: ev.start.slice(0, 10) } : { dateTime: ev.start },
    end: ev.allDay ? { date: ev.end.slice(0, 10) } : { dateTime: ev.end },
  };
}
```

- [ ] **Step 2: Write the push endpoint**

```typescript
// app/api/google-calendar-push.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, googleCalendarRequest, toGoogleEventBody } from './_lib/googleCalendarApi.js';

interface PushBody {
  studioId: string;
  eventId: string;
  action: 'create' | 'update' | 'delete';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, eventId, action } = req.body as PushBody;
  if (!studioId || !eventId || !action) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  try {
    const conn = await getValidAccessToken(supabaseAdmin, studioId);
    if (!conn) {
      // No Google Calendar connected for this studio — nothing to push, not an error.
      res.status(200).json({ ok: true, skipped: 'not_connected' });
      return;
    }

    if (action === 'delete') {
      const { data: eventRow } = await supabaseAdmin
        .from('events')
        .select('google_event_id')
        .eq('id', eventId)
        .maybeSingle();
      if (eventRow?.google_event_id) {
        await googleCalendarRequest(conn.accessToken, conn.calendarId, 'DELETE', `/events/${eventRow.google_event_id}`);
      }
      res.status(200).json({ ok: true });
      return;
    }

    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from('events')
      .select('title, start, "end", all_day, description, location, google_event_id')
      .eq('id', eventId)
      .eq('studio_id', studioId)
      .single();

    if (eventError || !eventRow) {
      res.status(200).json({ ok: true, skipped: 'event_not_found' });
      return;
    }

    const body = toGoogleEventBody({
      title: eventRow.title,
      start: eventRow.start,
      end: eventRow.end,
      allDay: eventRow.all_day,
      description: eventRow.description,
      location: eventRow.location,
    });

    if (eventRow.google_event_id) {
      await googleCalendarRequest(conn.accessToken, conn.calendarId, 'PUT', `/events/${eventRow.google_event_id}`, body);
    } else {
      const created = await googleCalendarRequest(conn.accessToken, conn.calendarId, 'POST', '/events', body);
      await supabaseAdmin.from('events').update({ google_event_id: created.id }).eq('id', eventId);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to push event to Google Calendar:', error);
    // Do not fail the response with a 500 that the client would surface as
    // an error toast — per the design, a push failure never blocks or rolls
    // back the Rush-side write, it just means Google is out of sync until
    // the connection is fixed.
    res.status(200).json({ ok: false, error: 'push_failed' });
  }
}
```

- [ ] **Step 3: Wire the push calls into `eventStore.ts`**

Read `app/src/data/eventStore.ts` first. Add this helper near the top of the file (after the existing imports):

```typescript
async function pushToGoogleCalendar(eventId: string, action: 'create' | 'update' | 'delete'): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/google-calendar-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studioId, eventId, action }),
    });
  } catch (err) {
    // Fire-and-forget — a push failure must never block the Rush-side write.
    console.error('pushToGoogleCalendar failed', err);
  }
}
```

Then update the three real-session write functions to call it after their existing Supabase write succeeds (fire-and-forget — do not `await` these calls, matching the pattern already used for `fetchSupabaseEvents()` refreshes elsewhere in this file... actually those ARE awaited; this one is intentionally NOT, since Google's response time must never delay the Rush UI):

```typescript
async function addSupabaseEvent(ev: CalendarEvent): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('events').insert(toRow(ev, studioId));
  if (error) { console.error('addSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(ev.id, 'create');
  await fetchSupabaseEvents();
}

async function updateSupabaseEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseEvents.find(e => e.id === id);
  if (!current) { console.error('updateSupabaseEvent: event not found in cache', id); return; }
  const merged = { ...current, ...patch };
  const { error } = await supabase.from('events').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(id, 'update');
  await fetchSupabaseEvents();
}

async function deleteSupabaseEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(id, 'delete');
  await fetchSupabaseEvents();
}
```

Note: `deleteSupabaseEvent`'s push must run BEFORE the Rush row is truly gone from Google's perspective, but the Rush row is already deleted from Supabase by the time `pushToGoogleCalendar` runs — this is fine because the push endpoint reads `google_event_id` from the event row via a separate query that happens to run against the just-deleted row... **this is a real ordering bug**: `google-calendar-push`'s `delete` branch queries `events` for `google_event_id` by `eventId`, but `deleteSupabaseEvent` already deleted that row above. Fix this by capturing `google_event_id` from the in-memory cache BEFORE deleting, and passing it directly instead of having the server look it up:

Revise the push body/endpoint to accept an optional `googleEventId` directly from the client (which already has it in its in-memory cache), avoiding the server needing to look up an already-deleted row:

In `app/api/google-calendar-push.ts`, change the body interface and the delete branch:

```typescript
interface PushBody {
  studioId: string;
  eventId: string;
  action: 'create' | 'update' | 'delete';
  googleEventId?: string; // required for 'delete' — the Rush row is already gone by the time this runs
}
```

```typescript
    if (action === 'delete') {
      if (googleEventId) {
        await googleCalendarRequest(conn.accessToken, conn.calendarId, 'DELETE', `/events/${googleEventId}`);
      }
      res.status(200).json({ ok: true });
      return;
    }
```

(Remove the `const { data: eventRow } = await supabaseAdmin.from('events').select('google_event_id')...` block that preceded it in Step 2 — it's now unnecessary and would find nothing.)

And in `eventStore.ts`, update `pushToGoogleCalendar` and `deleteSupabaseEvent` to pass it through:

```typescript
async function pushToGoogleCalendar(eventId: string, action: 'create' | 'update' | 'delete', googleEventId?: string): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/google-calendar-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studioId, eventId, action, googleEventId }),
    });
  } catch (err) {
    console.error('pushToGoogleCalendar failed', err);
  }
}
```

```typescript
async function deleteSupabaseEvent(id: string): Promise<void> {
  const existing = _supabaseEvents.find(e => e.id === id);
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(id, 'delete', (existing as any)?.googleEventId);
  await fetchSupabaseEvents();
}
```

This requires `CalendarEvent`/`toEvent()` to also carry `googleEventId` — add it:

```typescript
export interface CalendarEvent {
  id: string;
  title: string;
  eventTypeId: string;
  projectId?: string;
  start: string;
  end: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  meetingUrl?: string;
  memberIds?: string[];
  googleEventId?: string;
}
```

and in `toEvent()`:

```typescript
    googleEventId: row.google_event_id ?? undefined,
```

(add this line inside the object returned by `toEvent`, and add `google_event_id: string | null;` to the `EventRow` interface above it).

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Requires a deployed Vercel environment with a connected Google Calendar (Task 4 done first).

1. Create an event in Rush's calendar. Confirm within a few seconds it appears in the connected Google Calendar.
2. Edit that event's time in Rush. Confirm the Google event updates to match.
3. Delete it in Rush. Confirm it disappears from Google Calendar too.

- [ ] **Step 6: Commit**

```bash
git add app/api/_lib/googleCalendarApi.ts app/api/google-calendar-push.ts app/src/data/eventStore.ts
git commit -m "feat: push Rush calendar events to Google Calendar immediately"
```

---

### Task 6: Pull sync (Google → Rush) via Vercel Cron

**Files:**
- Create: `app/api/google-calendar-pull.ts`
- Modify: `app/vercel.json`

**Interfaces:**
- Consumes: `getValidAccessToken`, `googleCalendarRequest` from `./_lib/googleCalendarApi.js` (Task 5).
- Produces: `GET /api/google-calendar-pull` (no auth header — invoked only by Vercel Cron; verifies a shared secret instead, since there's no user session to check).

- [ ] **Step 1: Write the pull endpoint**

Vercel Cron calls this on a schedule with no user present, so it can't use the Bearer-token-plus-membership-check pattern every other endpoint in this plan uses. Instead it checks a `CRON_SECRET` the request must present — Vercel automatically sends this as a bearer token to cron-triggered requests when the `CRON_SECRET` environment variable is set, so this is the standard way to authenticate a Vercel Cron invocation.

```typescript
// app/api/google-calendar-pull.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, googleCalendarRequest } from './_lib/googleCalendarApi.js';

interface GoogleEventItem {
  id: string;
  status: 'confirmed' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: connections, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('studio_id, sync_token, google_calendar_id');

  if (error) {
    console.error('Failed to load Google Calendar connections:', error);
    res.status(500).json({ error: 'Failed to load connections' });
    return;
  }

  const results: Record<string, string> = {};

  for (const conn of connections ?? []) {
    try {
      results[conn.studio_id] = await pullForStudio(supabaseAdmin, conn.studio_id, conn.sync_token, conn.google_calendar_id);
    } catch (err) {
      console.error(`Pull failed for studio ${conn.studio_id}:`, err);
      results[conn.studio_id] = 'error';
    }
  }

  res.status(200).json({ ok: true, results });
}

async function pullForStudio(
  supabaseAdmin: ReturnType<typeof createClient>,
  studioId: string,
  syncToken: string | null,
  calendarId: string
): Promise<string> {
  const token = await getValidAccessToken(supabaseAdmin, studioId);
  if (!token) return 'not_connected';

  const params = new URLSearchParams();
  if (syncToken) {
    params.set('syncToken', syncToken);
  } else {
    // First sync ever for this studio — Google requires a bounded time
    // window instead of a syncToken. Six months back is enough to catch
    // anything a team would plausibly want to see in Rush.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    params.set('timeMin', sixMonthsAgo.toISOString());
    params.set('singleEvents', 'true');
  }

  const data = await googleCalendarRequest(
    token.accessToken,
    calendarId,
    'GET',
    `/events?${params.toString()}`
  );

  for (const item of (data.items ?? []) as GoogleEventItem[]) {
    if (item.status === 'cancelled') {
      await supabaseAdmin.from('events').delete().eq('google_event_id', item.id).eq('studio_id', studioId);
      continue;
    }

    const start = item.start?.dateTime ?? item.start?.date ?? null;
    const end = item.end?.dateTime ?? item.end?.date ?? null;
    if (!start || !end) continue; // malformed event from Google, skip it

    const { data: existing } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('google_event_id', item.id)
      .eq('studio_id', studioId)
      .maybeSingle();

    const fields = {
      title: item.summary ?? '(Sans titre)',
      start,
      end,
      all_day: !item.start?.dateTime,
      description: item.description ?? null,
      location: item.location ?? null,
      google_event_id: item.id,
    };

    if (existing) {
      await supabaseAdmin.from('events').update(fields).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('events').insert({
        studio_id: studioId,
        event_type_id: 'autre', // default type for events pulled in from Google — see eventTypeStore.ts
        member_ids: [],
        ...fields,
      });
    }
  }

  await supabaseAdmin
    .from('google_calendar_connections')
    .update({ sync_token: data.nextSyncToken, last_synced_at: new Date().toISOString() })
    .eq('studio_id', studioId);

  return 'ok';
}
```

- [ ] **Step 2: Configure the Vercel Cron schedule**

Read `app/vercel.json` first (its current content is just `framework`/`buildCommand`/`outputDirectory`/`rewrites`). Add a `crons` array:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "crons": [
    { "path": "/api/google-calendar-pull", "schedule": "*/15 * * * *" }
  ]
}
```

If Task 1 Step 1 found the Vercel account's plan doesn't support a 15-minute interval, use the interval determined there instead of `*/15 * * * *` (for example `0 0 * * *` for once daily).

- [ ] **Step 3: Ask the user to add the cron secret**

Tell the user: "Ajoute une variable d'environnement `CRON_SECRET` dans les paramètres Vercel — n'importe quelle chaîne de caractères longue et aléatoire fait l'affaire (par exemple, génère-en une avec un gestionnaire de mots de passe). Vercel s'en sert automatiquement pour prouver que c'est bien lui qui déclenche la synchronisation périodique, pas quelqu'un d'autre." Wait for confirmation.

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Requires a deployed Vercel environment (Cron jobs only run on deployed projects, not local dev) with a connected Google Calendar.

1. Create an event directly in the connected Google Calendar (not through Rush).
2. Wait for the next cron run (up to 15 minutes, or trigger it manually by visiting `/api/google-calendar-pull` with the correct `Authorization: Bearer <CRON_SECRET>` header, e.g. via `curl`).
3. Confirm the event now appears in Rush's calendar, tagged with the "Autre" event type.
4. Edit that event directly in Google. Confirm the Rush event updates on the next pull.
5. Delete it in Google. Confirm it's removed from Rush on the next pull.

- [ ] **Step 6: Commit**

```bash
git add app/api/google-calendar-pull.ts app/vercel.json
git commit -m "feat: pull Google Calendar changes into Rush via Vercel Cron"
```

---

### Task 7: Full end-to-end walkthrough

No new code — this is the design's testing checklist, run once all six tasks are deployed.

- [ ] **Step 1: Run the design doc's verification list**

Using a real Rush account and a real Google account, walk through every point in `docs/superpowers/specs/2026-07-14-google-calendar-integration-design.md`'s "Testing / verification approach" section:
1. Connect Google Calendar from Paramètres → Intégrations; confirm "Connecté."
2. Create, edit, delete a Rush event; confirm each reaches Google within seconds.
3. Create an event directly in Google; confirm it appears in Rush within 15 minutes, with the "Autre" event type.
4. Edit an event directly in Google; confirm the change reaches Rush on the next pull.
5. Disconnect; confirm no further pushes/pulls happen and the UI shows "Déconnecté."

- [ ] **Step 2: Report results to the user**

Summarize what was verified and any issues found before considering the feature complete.

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** every design section maps to a task — OAuth connection (Tasks 1–2), status/disconnect UI (Tasks 3–4), Rush→Google push (Task 5), Google→Rush pull (Task 6), testing (Task 7).
- **Bug caught during self-review and fixed inline:** Task 5's first draft of the delete-push flow had the server look up `google_event_id` from the `events` table AFTER the client had already deleted that row — it would always find nothing. Fixed by having the client pass `googleEventId` directly from its in-memory cache (already available there) instead of the server re-querying a row that's already gone.
- **Type consistency:** `CalendarEvent.googleEventId` (client) matches `EventRow.google_event_id` (Supabase row) and `events.google_event_id` (migration column) throughout Tasks 1, 5, and 6.
- **Open item carried into Task 1, not resolved here:** the actual Vercel cron interval depends on account plan limits unknown at plan-writing time — Task 1 Step 1 resolves this before Task 6 is implemented, and Task 6 explicitly says to substitute the determined interval.
