# Per-Project Google Calendar Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the studio opt in, per project, to creating a dedicated Google Calendar for that project and sharing it read-only with the project's client contacts — with every event living in exactly one Google calendar (its project's, or the organisation's default) and never duplicated.

**Architecture:** Builds on the existing Google Calendar integration (`docs/superpowers/specs/2026-07-14-google-calendar-integration-design.md`, shipped). A new Supabase table `project_google_calendars` tracks which projects have an active shared calendar, its Google calendar ID, its own incremental `sync_token`, and which client contacts currently have access. The existing push/pull endpoints are extended to resolve the correct target calendar per event (project calendar if active, else the organisation's default) instead of always targeting one calendar. New endpoints handle activating/deactivating a project's calendar (create/share/move events in, or unshare/move events out — using Google's `events.move` so nothing is ever duplicated) and keeping client sharing in sync with the existing `project_client_access` table whenever it changes. The organisation's default calendar itself is upgraded from the connecting user's personal `"primary"` Google calendar to a dedicated `"Rush — <organisation>"` calendar, migrated automatically the first time any sync runs after this ships.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + Auth), Vercel serverless functions + Cron, Google Calendar API v3 (raw `fetch`, no new npm dependency) — same as the existing integration.

## Global Constraints

- No hard-coded user-facing text — everything through `t('namespace.key')`, added to both `app/src/locales/fr.json` and `app/src/locales/en.json`.
- Shared project calendars are read-only for clients (`role: 'reader'` in the Google ACL) — never write access.
- An event lives in exactly one Google calendar at a time — never push the same event to two calendars.
- Deactivating a project's calendar never deletes the Google calendar itself, only unshares it and moves events back to the org default — data is never destroyed.
- Every new/modified table and every new query against an existing table must have its `service_role` grant verified, not assumed — this project has hit the same "RLS bypass ≠ table grant" bug three times now (`ai_usage`, `google_calendar_connections`, and just found on `events`/`projects`/`client_contacts`/`project_client_access` — see `docs/superpowers/specs/2026-07-16-google-calendar-events-grant-migration.sql`, which must be run before Task 3's verification can pass).
- Supabase migrations are specs, not applied automatically — every `.sql` file must be pasted into the Supabase SQL editor by the user manually.
- Follow existing codebase patterns: inline `style={{}}` (not Tailwind), CSS tokens from `app/src/index.css`, `SFIcon`/`SFButton` from `app/src/components/ui`, serverless functions verify a Supabase bearer token then check `studio_members` membership directly, no test suite exists — verification is manual via a deployed Vercel environment and a real Google account (this feature's `/api/*` routes cannot be exercised on `localhost` — see the codebase's existing note on this in `app/vite.config.ts`'s absence of any `/api` proxy).

---

### Task 1: Database migration — `project_google_calendars` table

**Files:**
- Create: `docs/superpowers/specs/2026-07-16-project-google-calendars-migration.sql`

**Interfaces:**
- Produces: table `project_google_calendars(project_id, studio_id, google_calendar_id, sync_token, active, shared_contact_ids, created_at, last_synced_at)`, granted to `service_role` from the start.

- [ ] **Step 1: Write the migration**

```sql
-- Per-project Google Calendar sharing: one dedicated Google Calendar per
-- project that has opted in, shared read-only with that project's client
-- contacts. Same service-role-only access pattern as
-- google_calendar_connections — RLS enabled, no policies, no grants to
-- `authenticated`. Includes the `service_role` grant from the start (this
-- project has forgotten it twice before — see
-- docs/superpowers/specs/2026-07-16-google-calendar-service-role-grant-migration.sql
-- and docs/superpowers/specs/2026-07-16-google-calendar-events-grant-migration.sql).
-- Run once in the Supabase SQL editor.

create table project_google_calendars (
  project_id text primary key references projects(id) on delete cascade,
  studio_id uuid not null references studios(id) on delete cascade,
  google_calendar_id text not null,
  sync_token text,
  active boolean not null default true,
  shared_contact_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_synced_at timestamptz
);

alter table project_google_calendars enable row level security;
grant select, insert, update, delete on project_google_calendars to service_role;
-- Deliberately no policies and no grants to `authenticated` — only the
-- service role (serverless functions) ever reads or writes this table.
```

- [ ] **Step 2: Ask the user to run both pending migrations**

Tell the user: "Deux fichiers SQL à exécuter dans l'éditeur SQL de Supabase, dans cet ordre :
1. `docs/superpowers/specs/2026-07-16-google-calendar-events-grant-migration.sql` (le correctif urgent de permissions).
2. `docs/superpowers/specs/2026-07-16-project-google-calendars-migration.sql` (la nouvelle table pour cette fonctionnalité)."

Wait for confirmation before proceeding to Task 2.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-16-project-google-calendars-migration.sql
git commit -m "docs: add project_google_calendars migration spec"
```

---

### Task 2: Extend the Google Calendar API library

**Files:**
- Modify: `app/api/_lib/googleCalendarApi.ts` (entire file — restructures `getValidAccessToken`, adds new exports)

**Interfaces:**
- Consumes: `google_calendar_connections`, `project_google_calendars`, `studios` tables.
- Produces (all exported, replacing/adding to the existing exports — **breaking change to `getValidAccessToken`'s signature and return type**, callers updated in Tasks 3 and 4):
  - `getValidAccessToken(supabaseAdmin, studioId): Promise<string | null>` — now returns just the access token (refreshing and persisting if needed), no longer bundled with a calendar ID.
  - `getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken): Promise<string | null>` — returns the organisation's default calendar ID, auto-migrating off the legacy `"primary"` the first time it's called for a studio still on it.
  - `resolveEventCalendarId(supabaseAdmin, studioId, projectId, accessToken): Promise<string | null>` — the project's calendar if active, else the org default.
  - `googleCalendarRequest(...)` — unchanged signature, still calendar-scoped (`/calendars/{calendarId}{path}`).
  - `googleCalendarAdminRequest(accessToken, method, path, body?): Promise<any>` — new, for calls not scoped to one calendar (`/calendars`, `/calendars/{id}/acl`, `/calendars/{id}/events/{id}/move`).
  - `createGoogleCalendar(accessToken, name): Promise<string>`
  - `shareGoogleCalendar(accessToken, calendarId, email): Promise<void>` — idempotent, ignores an already-exists response.
  - `unshareGoogleCalendar(accessToken, calendarId, email): Promise<void>` — idempotent, ignores a not-found response.
  - `moveGoogleEvent(accessToken, sourceCalendarId, eventId, destinationCalendarId): Promise<void>`
  - `toGoogleEventBody(...)` — unchanged.

- [ ] **Step 1: Rewrite the file**

Read `app/api/_lib/googleCalendarApi.ts` first (current content shown in the design doc's architecture section — it currently exports `getValidAccessToken` returning `{accessToken, calendarId} | null`). Replace its entire contents with:

```typescript
// app/api/_lib/googleCalendarApi.ts
import type { SupabaseClient } from '@supabase/supabase-js';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

interface ConnectionRow {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
}

// Returns a valid access token for the studio's connection, refreshing it
// first (and persisting the refreshed token) if it's expired or expiring
// within the next minute. Returns null if there's no connection at all.
// Deliberately does NOT resolve a calendar ID — see getOrgDefaultCalendarId
// and resolveEventCalendarId for that, now that a studio can target more
// than one Google calendar.
export async function getValidAccessToken(
  supabaseAdmin: SupabaseClient,
  studioId: string
): Promise<string | null> {
  const { data: connection } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('access_token, refresh_token, access_token_expires_at')
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!connection) return null;
  const conn = connection as ConnectionRow;

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return conn.access_token;
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

  return refreshed.access_token;
}

// Returns the organisation's default calendar ID (used for every event that
// isn't in an actively-shared project calendar). The stored value used to
// be the literal string "primary" (the connecting user's own personal
// Google calendar) — the first time this runs for a studio still on that,
// it creates a dedicated "Rush — <organisation>" calendar, moves every
// already-synced event over to it, and persists the new ID, so Rush events
// stop mixing into that person's personal calendar.
export async function getOrgDefaultCalendarId(
  supabaseAdmin: SupabaseClient,
  studioId: string,
  accessToken: string
): Promise<string | null> {
  const { data: connection } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('google_calendar_id')
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!connection) return null;
  if (connection.google_calendar_id !== 'primary') {
    return connection.google_calendar_id as string;
  }

  const { data: studio } = await supabaseAdmin
    .from('studios')
    .select('name')
    .eq('id', studioId)
    .maybeSingle();

  const dedicatedName = `Rush — ${studio?.name ?? 'Organisation'}`;
  const newCalendarId = await createGoogleCalendar(accessToken, dedicatedName);

  const { data: eventsToMove } = await supabaseAdmin
    .from('events')
    .select('id, google_event_id')
    .eq('studio_id', studioId)
    .not('google_event_id', 'is', null);

  for (const ev of eventsToMove ?? []) {
    try {
      await moveGoogleEvent(accessToken, 'primary', ev.google_event_id as string, newCalendarId);
    } catch (err) {
      console.error(`Failed to move event ${ev.id} to the dedicated organisation calendar during migration:`, err);
    }
  }

  await supabaseAdmin
    .from('google_calendar_connections')
    .update({ google_calendar_id: newCalendarId })
    .eq('studio_id', studioId);

  return newCalendarId;
}

// Resolves which Google calendar a given event should target: its
// project's calendar if that project has an active shared calendar,
// otherwise the organisation's default calendar.
export async function resolveEventCalendarId(
  supabaseAdmin: SupabaseClient,
  studioId: string,
  projectId: string | null,
  accessToken: string
): Promise<string | null> {
  if (projectId) {
    const { data: projectCal } = await supabaseAdmin
      .from('project_google_calendars')
      .select('google_calendar_id')
      .eq('project_id', projectId)
      .eq('active', true)
      .maybeSingle();
    if (projectCal) return projectCal.google_calendar_id as string;
  }
  return getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);
}

export async function googleCalendarRequest(
  accessToken: string,
  calendarId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<any> {
  return googleCalendarAdminRequest(accessToken, method, `/calendars/${encodeURIComponent(calendarId)}${path}`, body);
}

// For calls not scoped to a single calendar's /events sub-path: creating a
// calendar, managing a calendar's ACL, or moving an event between calendars.
export async function googleCalendarAdminRequest(
  accessToken: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<any> {
  const resp = await fetch(`${CALENDAR_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (method === 'DELETE') {
    if (!resp.ok && resp.status !== 410 && resp.status !== 404) {
      const err = new Error(`Google Calendar API ${method} ${path} failed: ${resp.status}`) as Error & { status?: number };
      err.status = resp.status;
      throw err;
    }
    return null;
  }

  if (!resp.ok) {
    const err = new Error(`Google Calendar API ${method} ${path} failed: ${resp.status} ${await resp.text()}`) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export async function createGoogleCalendar(accessToken: string, name: string): Promise<string> {
  const created = await googleCalendarAdminRequest(accessToken, 'POST', '/calendars', { summary: name });
  return created.id as string;
}

// role: 'reader' only — shared project calendars are always read-only for
// clients (see the design's non-goals). Idempotent: Google returns 409 if
// this exact user already has a rule on the calendar, which is treated as
// success rather than an error.
export async function shareGoogleCalendar(accessToken: string, calendarId: string, email: string): Promise<void> {
  try {
    await googleCalendarAdminRequest(accessToken, 'POST', `/calendars/${encodeURIComponent(calendarId)}/acl`, {
      role: 'reader',
      scope: { type: 'user', value: email },
    });
  } catch (err) {
    if ((err as Error & { status?: number }).status === 409) return;
    throw err;
  }
}

// The ACL rule ID for a user-scoped grant is deterministically "user:<email>".
export async function unshareGoogleCalendar(accessToken: string, calendarId: string, email: string): Promise<void> {
  await googleCalendarAdminRequest(
    accessToken,
    'DELETE',
    `/calendars/${encodeURIComponent(calendarId)}/acl/${encodeURIComponent('user:' + email)}`
  );
}

// Moves an event between two calendars owned by the same connected Google
// account, preserving its event ID — this is how activating/deactivating a
// project's calendar avoids ever duplicating an event.
export async function moveGoogleEvent(
  accessToken: string,
  sourceCalendarId: string,
  eventId: string,
  destinationCalendarId: string
): Promise<void> {
  await googleCalendarAdminRequest(
    accessToken,
    'POST',
    `/calendars/${encodeURIComponent(sourceCalendarId)}/events/${encodeURIComponent(eventId)}/move?destination=${encodeURIComponent(destinationCalendarId)}`
  );
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

- [ ] **Step 2: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (note: `app/api` isn't covered by this config — this only confirms `app/src` still compiles; `app/api` type-checks at Vercel deploy time, same as every prior serverless function in this codebase). This step will not yet catch that Tasks 3–4 still call the old `getValidAccessToken` shape — that gets fixed in those tasks.

- [ ] **Step 3: Commit**

```bash
git add app/api/_lib/googleCalendarApi.ts
git commit -m "feat: extend Google Calendar API library for per-project calendars"
```

---

### Task 3: Update push sync to target the right calendar per event

**Files:**
- Modify: `app/api/google-calendar-push.ts` (entire file)
- Modify: `app/src/data/eventStore.ts:15-29,178-203` (`pushToGoogleCalendar` and its three call sites)

**Interfaces:**
- Consumes: `getValidAccessToken`, `resolveEventCalendarId`, `googleCalendarRequest`, `toGoogleEventBody` from `./_lib/googleCalendarApi.js` (Task 2).
- Produces: `POST /api/google-calendar-push` body now `{ studioId, eventId, action, projectId?: string | null, googleEventId?: string }` (added `projectId`, needed to resolve the correct calendar for the `delete` branch since the Rush row is already gone by the time it runs).

- [ ] **Step 1: Rewrite the push endpoint**

Replace the entire contents of `app/api/google-calendar-push.ts` with:

```typescript
// app/api/google-calendar-push.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, resolveEventCalendarId, googleCalendarRequest, toGoogleEventBody } from './_lib/googleCalendarApi.js';

interface PushBody {
  studioId: string;
  eventId: string;
  action: 'create' | 'update' | 'delete';
  projectId?: string | null;
  googleEventId?: string; // required for 'delete' — the Rush row is already gone by the time this runs
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, eventId, action, projectId, googleEventId } = req.body as PushBody;
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
    const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    if (!accessToken) {
      // No Google Calendar connected for this studio — nothing to push, not an error.
      res.status(200).json({ ok: true, skipped: 'not_connected' });
      return;
    }

    if (action === 'delete') {
      if (googleEventId) {
        const calendarId = await resolveEventCalendarId(supabaseAdmin, studioId, projectId ?? null, accessToken);
        if (calendarId) {
          await googleCalendarRequest(accessToken, calendarId, 'DELETE', `/events/${googleEventId}`);
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from('events')
      .select('title, start, "end", all_day, description, location, google_event_id, project_id')
      .eq('id', eventId)
      .eq('studio_id', studioId)
      .single();

    if (eventError || !eventRow) {
      res.status(200).json({ ok: true, skipped: 'event_not_found' });
      return;
    }

    const calendarId = await resolveEventCalendarId(supabaseAdmin, studioId, eventRow.project_id, accessToken);
    if (!calendarId) {
      res.status(200).json({ ok: true, skipped: 'no_calendar' });
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
      await googleCalendarRequest(accessToken, calendarId, 'PUT', `/events/${eventRow.google_event_id}`, body);
    } else {
      const created = await googleCalendarRequest(accessToken, calendarId, 'POST', '/events', body);
      await supabaseAdmin.from('events').update({ google_event_id: created.id }).eq('id', eventId);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to push event to Google Calendar:', error);
    // Do not fail the response with a 500 that the client would surface as
    // an error toast — a push failure never blocks or rolls back the
    // Rush-side write, it just means Google is out of sync until the
    // connection (or calendar) is fixed.
    res.status(200).json({ ok: false, error: 'push_failed' });
  }
}
```

- [ ] **Step 2: Pass `projectId` through from `eventStore.ts`**

Read `app/src/data/eventStore.ts` first. Replace the `pushToGoogleCalendar` helper (currently lines 15–29) with:

```typescript
async function pushToGoogleCalendar(eventId: string, action: 'create' | 'update' | 'delete', projectId?: string, googleEventId?: string): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/google-calendar-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studioId, eventId, action, projectId, googleEventId }),
    });
  } catch (err) {
    // Fire-and-forget — a push failure must never block the Rush-side write.
    console.error('pushToGoogleCalendar failed', err);
  }
}
```

Then update its three call sites (currently around lines 178–203):

```typescript
async function addSupabaseEvent(ev: CalendarEvent): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('events').insert(toRow(ev, studioId));
  if (error) { console.error('addSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(ev.id, 'create', ev.projectId);
  await fetchSupabaseEvents();
}

async function updateSupabaseEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseEvents.find(e => e.id === id);
  if (!current) { console.error('updateSupabaseEvent: event not found in cache', id); return; }
  const merged = { ...current, ...patch };
  const { error } = await supabase.from('events').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(id, 'update', merged.projectId);
  await fetchSupabaseEvents();
}

async function deleteSupabaseEvent(id: string): Promise<void> {
  const existing = _supabaseEvents.find(e => e.id === id);
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) { console.error('deleteSupabaseEvent failed', error); return; }
  void pushToGoogleCalendar(id, 'delete', existing?.projectId, existing?.googleEventId);
  await fetchSupabaseEvents();
}
```

(`CalendarEvent.projectId`, `CalendarEvent.googleEventId`, and `EventRow.google_event_id` already exist from the original integration — no type changes needed here.)

- [ ] **Step 3: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Requires both migrations from Task 1 to be run, and a deployed Vercel environment with an active Google Calendar connection (already true in production as of this plan).

1. Create an event in Rush on a project that has no active shared calendar. Confirm it appears in the organisation's default Google calendar (now named `"Rush — <organisation>"`, not the connecting user's personal calendar — if this is the first push since Task 2 shipped, confirm any previously-synced events also moved there).
2. Edit that event's time in Rush. Confirm the Google event updates to match.
3. Delete it in Rush. Confirm it disappears from Google Calendar too.

- [ ] **Step 5: Commit**

```bash
git add app/api/google-calendar-push.ts app/src/data/eventStore.ts
git commit -m "feat: resolve per-project Google Calendar target in push sync"
```

---

### Task 4: Update pull sync to loop every active project calendar

**Files:**
- Modify: `app/api/google-calendar-pull.ts` (entire file)

**Interfaces:**
- Consumes: `getValidAccessToken`, `getOrgDefaultCalendarId`, `googleCalendarRequest` from `./_lib/googleCalendarApi.js` (Task 2).
- Produces: `GET /api/google-calendar-pull` — unchanged request shape (Vercel Cron, `CRON_SECRET` auth), now syncs the org default calendar plus every studio's active project calendars, each with its own stored `sync_token`.

- [ ] **Step 1: Rewrite the pull endpoint**

Replace the entire contents of `app/api/google-calendar-pull.ts` with:

```typescript
// app/api/google-calendar-pull.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, getOrgDefaultCalendarId, googleCalendarRequest } from './_lib/googleCalendarApi.js';

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
    .select('studio_id');

  if (error) {
    console.error('Failed to load Google Calendar connections:', error);
    res.status(500).json({ error: 'Failed to load connections' });
    return;
  }

  const results: Record<string, string> = {};

  for (const conn of connections ?? []) {
    const studioId = conn.studio_id as string;

    let accessToken: string | null = null;
    try {
      accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    } catch (err) {
      console.error(`Failed to get access token for studio ${studioId}:`, err);
    }
    if (!accessToken) {
      results[`studio:${studioId}:default`] = 'not_connected';
      continue;
    }

    try {
      const orgCalendarId = await getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);
      if (orgCalendarId) {
        const { data: connRow } = await supabaseAdmin
          .from('google_calendar_connections')
          .select('sync_token')
          .eq('studio_id', studioId)
          .maybeSingle();

        results[`studio:${studioId}:default`] = await pullCalendar({
          supabaseAdmin, studioId, calendarId: orgCalendarId, accessToken, insertProjectId: null,
          syncToken: connRow?.sync_token ?? null,
          persistSyncToken: async (token) => {
            await supabaseAdmin
              .from('google_calendar_connections')
              .update({ sync_token: token ?? null, last_synced_at: new Date().toISOString() })
              .eq('studio_id', studioId);
          },
        });
      }
    } catch (err) {
      console.error(`Pull failed for studio ${studioId} default calendar:`, err);
      results[`studio:${studioId}:default`] = 'error';
    }

    const { data: projectCals } = await supabaseAdmin
      .from('project_google_calendars')
      .select('project_id, google_calendar_id, sync_token')
      .eq('studio_id', studioId)
      .eq('active', true);

    for (const pc of projectCals ?? []) {
      const projectId = pc.project_id as string;
      try {
        results[`project:${projectId}`] = await pullCalendar({
          supabaseAdmin, studioId, calendarId: pc.google_calendar_id as string, accessToken, insertProjectId: projectId,
          syncToken: pc.sync_token as string | null,
          persistSyncToken: async (token) => {
            await supabaseAdmin
              .from('project_google_calendars')
              .update({ sync_token: token ?? null, last_synced_at: new Date().toISOString() })
              .eq('project_id', projectId);
          },
        });
      } catch (err) {
        console.error(`Pull failed for project calendar ${projectId}:`, err);
        results[`project:${projectId}`] = 'error';
      }
    }
  }

  res.status(200).json({ ok: true, results });
}

interface PullCalendarOpts {
  supabaseAdmin: ReturnType<typeof createClient>;
  studioId: string;
  calendarId: string;
  accessToken: string;
  insertProjectId: string | null;
  syncToken: string | null;
  persistSyncToken: (token: string | undefined) => Promise<void>;
}

async function pullCalendar(opts: PullCalendarOpts): Promise<string> {
  try {
    return await runSync(opts, opts.syncToken);
  } catch (err) {
    if ((err as Error & { status?: number }).status === 410) {
      // Stale/invalidated sync token — Google requires dropping it and
      // starting a fresh full sync, not retrying with the same token.
      return runSync(opts, null);
    }
    throw err;
  }
}

async function runSync(opts: PullCalendarOpts, syncToken: string | null): Promise<string> {
  const { supabaseAdmin, studioId, calendarId, accessToken, insertProjectId, persistSyncToken } = opts;

  const params = new URLSearchParams({ singleEvents: 'true' });
  if (syncToken) {
    params.set('syncToken', syncToken);
  } else {
    // First sync ever for this calendar (or a resync after a stale token) —
    // Google requires a bounded time window instead of a syncToken. Six
    // months back is enough to catch anything a team would plausibly want
    // to see in Rush.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    params.set('timeMin', sixMonthsAgo.toISOString());
  }

  let allItems: GoogleEventItem[] = [];
  let nextSyncToken: string | undefined;
  let pageToken: string | undefined;

  do {
    if (pageToken) params.set('pageToken', pageToken);
    else params.delete('pageToken');

    const data = await googleCalendarRequest(accessToken, calendarId, 'GET', `/events?${params.toString()}`);

    allItems = allItems.concat((data.items ?? []) as GoogleEventItem[]);
    nextSyncToken = data.nextSyncToken;
    pageToken = data.nextPageToken;
  } while (pageToken);

  for (const item of allItems) {
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
      // Never touch project_id here — an event already in Rush keeps
      // whichever project it's already assigned to (e.g. one just moved
      // into this calendar by the activate endpoint), a pull only updates
      // its content fields.
      await supabaseAdmin.from('events').update(fields).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('events').insert({
        studio_id: studioId,
        project_id: insertProjectId, // null for the org default calendar, the specific project otherwise
        event_type_id: 'autre', // default type for events pulled in from Google — see eventTypeStore.ts
        member_ids: [],
        ...fields,
      });
    }
  }

  await persistSyncToken(nextSyncToken);
  return 'ok';
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Requires both migrations from Task 1, and at least a 15-minute wait for the cron to fire (or a manual trigger via `curl` with `Authorization: Bearer <CRON_SECRET>`).

1. Create an event directly in the connected Google Calendar's default calendar (not through Rush). Confirm it appears in Rush within one cron cycle, tagged with the "Autre" event type and no project.
2. Edit it directly in Google. Confirm the Rush event updates on the next pull.
3. Delete it in Google. Confirm it's removed from Rush on the next pull.

(Project-calendar pulls are verified in Task 6, once activation exists to create one.)

- [ ] **Step 4: Commit**

```bash
git add app/api/google-calendar-pull.ts
git commit -m "feat: pull sync loops every active project calendar, not just the org default"
```

---

### Task 5: Activate/deactivate endpoints for a project's shared calendar

**Files:**
- Create: `app/api/google-calendar-project-activate.ts`
- Create: `app/api/google-calendar-project-deactivate.ts`

**Interfaces:**
- Consumes: `getValidAccessToken`, `getOrgDefaultCalendarId`, `createGoogleCalendar`, `shareGoogleCalendar`, `unshareGoogleCalendar`, `moveGoogleEvent` from `./_lib/googleCalendarApi.js` (Task 2); `project_google_calendars`, `project_client_access`, `client_contacts`, `projects` tables.
- Produces: `POST /api/google-calendar-project-activate` body `{ studioId, projectId }` → `{ ok: true, calendarId: string }`. `POST /api/google-calendar-project-deactivate` body `{ studioId, projectId }` → `{ ok: true }`.

- [ ] **Step 1: Write the activate endpoint**

```typescript
// app/api/google-calendar-project-activate.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, getOrgDefaultCalendarId, createGoogleCalendar, shareGoogleCalendar, moveGoogleEvent } from './_lib/googleCalendarApi.js';

interface ActivateBody {
  studioId: string;
  projectId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId } = req.body as ActivateBody;
  if (!studioId || !projectId) {
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

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (projectError || !project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    if (!accessToken) {
      res.status(400).json({ error: 'No Google Calendar connection for this organisation' });
      return;
    }

    const orgDefaultCalendarId = await getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);
    if (!orgDefaultCalendarId) {
      res.status(400).json({ error: 'No Google Calendar connection for this organisation' });
      return;
    }

    const { data: existingRow } = await supabaseAdmin
      .from('project_google_calendars')
      .select('google_calendar_id, active')
      .eq('project_id', projectId)
      .maybeSingle();

    let calendarId: string;
    if (existingRow) {
      calendarId = existingRow.google_calendar_id as string;
      if (!existingRow.active) {
        await supabaseAdmin.from('project_google_calendars').update({ active: true }).eq('project_id', projectId);
      }
    } else {
      calendarId = await createGoogleCalendar(accessToken, project.name as string);
      await supabaseAdmin.from('project_google_calendars').insert({
        project_id: projectId,
        studio_id: studioId,
        google_calendar_id: calendarId,
        active: true,
        shared_contact_ids: [],
      });
    }

    // Move any already-synced events for this project from the org default
    // calendar into the project's calendar — same event ID, no duplication.
    const { data: eventsToMove } = await supabaseAdmin
      .from('events')
      .select('id, google_event_id')
      .eq('project_id', projectId)
      .not('google_event_id', 'is', null);

    for (const ev of eventsToMove ?? []) {
      try {
        await moveGoogleEvent(accessToken, orgDefaultCalendarId, ev.google_event_id as string, calendarId);
      } catch (err) {
        console.error(`Failed to move event ${ev.id} into project calendar ${calendarId}:`, err);
      }
    }

    // Share with every client contact currently granted access to this project.
    const { data: access } = await supabaseAdmin
      .from('project_client_access')
      .select('client_contact_id')
      .eq('project_id', projectId);
    const contactIds = (access ?? []).map(row => row.client_contact_id as string);

    if (contactIds.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('client_contacts')
        .select('id, email')
        .in('id', contactIds);
      for (const contact of contacts ?? []) {
        if (!contact.email) continue;
        try {
          await shareGoogleCalendar(accessToken, calendarId, contact.email as string);
        } catch (err) {
          console.error(`Failed to share calendar with ${contact.email}:`, err);
        }
      }
    }

    await supabaseAdmin
      .from('project_google_calendars')
      .update({ shared_contact_ids: contactIds })
      .eq('project_id', projectId);

    res.status(200).json({ ok: true, calendarId });
  } catch (error) {
    console.error('Failed to activate project Google Calendar:', error);
    res.status(500).json({ error: 'Failed to activate' });
  }
}
```

- [ ] **Step 2: Write the deactivate endpoint**

```typescript
// app/api/google-calendar-project-deactivate.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, getOrgDefaultCalendarId, unshareGoogleCalendar, moveGoogleEvent } from './_lib/googleCalendarApi.js';

interface DeactivateBody {
  studioId: string;
  projectId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId } = req.body as DeactivateBody;
  if (!studioId || !projectId) {
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

  const { data: row, error: rowError } = await supabaseAdmin
    .from('project_google_calendars')
    .select('google_calendar_id, active, shared_contact_ids')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (rowError || !row || !row.active) {
    res.status(200).json({ ok: true, skipped: 'not_active' });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    if (!accessToken) {
      res.status(400).json({ error: 'No Google Calendar connection for this organisation' });
      return;
    }

    const orgDefaultCalendarId = await getOrgDefaultCalendarId(supabaseAdmin, studioId, accessToken);

    const contactIds = (row.shared_contact_ids ?? []) as string[];
    if (contactIds.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('client_contacts')
        .select('id, email')
        .in('id', contactIds);
      for (const contact of contacts ?? []) {
        if (!contact.email) continue;
        try {
          await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, contact.email as string);
        } catch (err) {
          console.error(`Failed to unshare calendar with ${contact.email}:`, err);
        }
      }
    }

    if (orgDefaultCalendarId) {
      const { data: eventsToMove } = await supabaseAdmin
        .from('events')
        .select('id, google_event_id')
        .eq('project_id', projectId)
        .not('google_event_id', 'is', null);

      for (const ev of eventsToMove ?? []) {
        try {
          await moveGoogleEvent(accessToken, row.google_calendar_id as string, ev.google_event_id as string, orgDefaultCalendarId);
        } catch (err) {
          console.error(`Failed to move event ${ev.id} back to the org default calendar:`, err);
        }
      }
    }

    await supabaseAdmin
      .from('project_google_calendars')
      .update({ active: false, shared_contact_ids: [] })
      .eq('project_id', projectId);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to deactivate project Google Calendar:', error);
    res.status(500).json({ error: 'Failed to deactivate' });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/google-calendar-project-activate.ts app/api/google-calendar-project-deactivate.ts
git commit -m "feat: add project Google Calendar activate/deactivate endpoints"
```

(Manual verification for these two happens in Task 7, once the UI can trigger them.)

---

### Task 6: Keep client sharing in sync with `project_client_access`

**Files:**
- Create: `app/api/google-calendar-project-status.ts`
- Create: `app/api/google-calendar-project-sync-access.ts`
- Modify: `app/src/data/projectClientAccessStore.ts` (entire file)

**Interfaces:**
- Consumes: `getValidAccessToken`, `shareGoogleCalendar`, `unshareGoogleCalendar` from `./_lib/googleCalendarApi.js` (Task 2); `getStudioId` from `./studioStore`, `supabase` from `./supabaseClient` (both already imported in `projectClientAccessStore.ts`).
- Produces: `GET /api/google-calendar-project-status?studioId=&projectId=` → `{ active: boolean }`. `POST /api/google-calendar-project-sync-access` body `{ studioId, projectId }` → `{ ok: true }` (no-op if the project has no active calendar).

- [ ] **Step 1: Write the status endpoint**

```typescript
// app/api/google-calendar-project-status.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const studioId = req.query.studioId as string | undefined;
  const projectId = req.query.projectId as string | undefined;
  if (!studioId || !projectId) {
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

  const { data: row } = await supabaseAdmin
    .from('project_google_calendars')
    .select('active')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  res.status(200).json({ active: !!row?.active });
}
```

- [ ] **Step 2: Write the sync-access endpoint**

```typescript
// app/api/google-calendar-project-sync-access.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, shareGoogleCalendar, unshareGoogleCalendar } from './_lib/googleCalendarApi.js';

interface SyncAccessBody {
  studioId: string;
  projectId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId } = req.body as SyncAccessBody;
  if (!studioId || !projectId) {
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

  const { data: row } = await supabaseAdmin
    .from('project_google_calendars')
    .select('google_calendar_id, active, shared_contact_ids')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (!row || !row.active) {
    res.status(200).json({ ok: true, skipped: 'not_active' });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
    if (!accessToken) {
      res.status(200).json({ ok: true, skipped: 'not_connected' });
      return;
    }

    const { data: access } = await supabaseAdmin
      .from('project_client_access')
      .select('client_contact_id')
      .eq('project_id', projectId);
    const currentIds = (access ?? []).map(r => r.client_contact_id as string);
    const previousIds = (row.shared_contact_ids ?? []) as string[];

    const toAdd = currentIds.filter(id => !previousIds.includes(id));
    const toRemove = previousIds.filter(id => !currentIds.includes(id));

    if (toAdd.length > 0 || toRemove.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('client_contacts')
        .select('id, email')
        .in('id', [...toAdd, ...toRemove]);
      const emailById = new Map((contacts ?? []).map(c => [c.id as string, c.email as string]));

      for (const id of toAdd) {
        const email = emailById.get(id);
        if (!email) continue;
        try { await shareGoogleCalendar(accessToken, row.google_calendar_id as string, email); }
        catch (err) { console.error(`Failed to share calendar with ${email}:`, err); }
      }
      for (const id of toRemove) {
        const email = emailById.get(id);
        if (!email) continue;
        try { await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email); }
        catch (err) { console.error(`Failed to unshare calendar with ${email}:`, err); }
      }

      await supabaseAdmin
        .from('project_google_calendars')
        .update({ shared_contact_ids: currentIds })
        .eq('project_id', projectId);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to sync project Google Calendar access:', error);
    res.status(200).json({ ok: false, error: 'sync_failed' });
  }
}
```

- [ ] **Step 3: Wire it into `projectClientAccessStore.ts`**

Read `app/src/data/projectClientAccessStore.ts` first. Add this helper after the imports:

```typescript
async function syncGoogleCalendarProjectAccess(projectId: string): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/google-calendar-project-sync-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studioId, projectId }),
    });
  } catch (err) {
    // Fire-and-forget — this must never block the project_client_access write.
    console.error('syncGoogleCalendarProjectAccess failed', err);
  }
}
```

Then add a call to it at the very end of `doSync` (after the existing insert pass, as the last line of the function):

```typescript
  void syncGoogleCalendarProjectAccess(projectId);
}
```

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/google-calendar-project-status.ts app/api/google-calendar-project-sync-access.ts app/src/data/projectClientAccessStore.ts
git commit -m "feat: keep project Google Calendar sharing in sync with project_client_access"
```

---

### Task 7: Client store + `ProjetCalendrier.tsx` UI

**Files:**
- Modify: `app/src/data/googleCalendarStore.ts` (add exports, no changes to existing ones)
- Modify: `app/src/screens/ProjetCalendrier.tsx:1-13,605-606` (imports and sidebar)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `getStudioId` from `../data/studioStore`, `getProjects` from `../data/projectStore` (already imported in `ProjetCalendrier.tsx`).
- Produces: `getProjectGoogleCalendarStatus(projectId): Promise<{ active: boolean }>`, `activateProjectGoogleCalendar(projectId): Promise<void>`, `deactivateProjectGoogleCalendar(projectId): Promise<void>` (all exported from `googleCalendarStore.ts`).

- [ ] **Step 1: Add the new client store functions**

Read `app/src/data/googleCalendarStore.ts` first. Add at the end of the file:

```typescript
export interface ProjectGoogleCalendarStatus {
  active: boolean;
}

export async function getProjectGoogleCalendarStatus(projectId: string): Promise<ProjectGoogleCalendarStatus> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-project-status?studioId=${studioId}&projectId=${projectId}`, { headers });
  if (!resp.ok) return { active: false };
  return resp.json();
}

export async function activateProjectGoogleCalendar(projectId: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project-activate', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studioId, projectId }),
  });
  if (!resp.ok) throw new Error('Failed to activate project Google Calendar');
}

export async function deactivateProjectGoogleCalendar(projectId: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project-deactivate', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studioId, projectId }),
  });
  if (!resp.ok) throw new Error('Failed to deactivate project Google Calendar');
}
```

- [ ] **Step 2: Add locale keys**

Read `app/src/locales/fr.json` first, find the `"calendar"` namespace object (it already contains `newEvent`, `projects`, `showAll`, etc.), and add these four keys inside it:

```json
    "gcalProjectSharePrompt": "Partager ce calendrier avec {{client}} sur Google Calendar",
    "gcalProjectShareAction": "Partager avec le client",
    "gcalProjectShared": "Partagé avec {{client}} sur Google Calendar",
    "gcalProjectStopSharing": "Ne plus partager",
```

Read `app/src/locales/en.json` first, find the equivalent `"calendar"` namespace object, and add:

```json
    "gcalProjectSharePrompt": "Share this calendar with {{client}} on Google Calendar",
    "gcalProjectShareAction": "Share with client",
    "gcalProjectShared": "Shared with {{client}} on Google Calendar",
    "gcalProjectStopSharing": "Stop sharing",
```

- [ ] **Step 3: Add the UI**

Read `app/src/screens/ProjetCalendrier.tsx` first. Add to the import block near the top of the file (after the existing `getEvents, addEvent, ...` import line):

```typescript
import { getGoogleCalendarStatus, getProjectGoogleCalendarStatus, activateProjectGoogleCalendar, deactivateProjectGoogleCalendar } from '../data/googleCalendarStore';
```

Add this component above `export function ProjetCalendrier` (same pattern as the file's existing top-level helper components):

```typescript
function GoogleProjectCalendarCard({ projectId, clientName }: { projectId: string; clientName: string }) {
  const { t } = useTranslation();
  const [orgConnected, setOrgConnected] = useState<boolean | null>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getGoogleCalendarStatus();
      if (cancelled) return;
      setOrgConnected(status.connected);
      if (status.connected) {
        const projectStatus = await getProjectGoogleCalendarStatus(projectId);
        if (!cancelled) setActive(projectStatus.active);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (isDemoSession() || orgConnected !== true || active === null) return null;

  const handleActivate = async () => {
    setBusy(true);
    try {
      await activateProjectGoogleCalendar(projectId);
      setActive(true);
    } catch (err) {
      console.error('Failed to activate project Google Calendar', err);
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    setBusy(true);
    try {
      await deactivateProjectGoogleCalendar(projectId);
      setActive(false);
    } catch (err) {
      console.error('Failed to deactivate project Google Calendar', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <SFIcon name="calendar" size={13} color={active ? 'var(--ok)' : 'var(--text-3)'} />
        <span style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>
          {active ? t('calendar.gcalProjectShared', { client: clientName }) : t('calendar.gcalProjectSharePrompt', { client: clientName })}
        </span>
      </div>
      <button
        onClick={active ? handleDeactivate : handleActivate}
        disabled={busy}
        style={{ alignSelf:'flex-start', padding:'6px 12px', borderRadius:8, border: active ? '1px solid var(--danger)' : '1px solid var(--border)', background:'transparent', color: active ? 'var(--danger)' : 'var(--text)', fontSize:11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily:'var(--ff-text)' }}
      >
        {busy ? '…' : active ? t('calendar.gcalProjectStopSharing') : t('calendar.gcalProjectShareAction')}
      </button>
    </div>
  );
}
```

Find the sidebar block's project-filter section (the `{/* Project filter — embedded client view only, with 2+ projects */}` block, ending with its closing `})()}`) and add, immediately after it and before the `{/* Event type filters ... */}` comment:

```typescript
        {!embedded && projectId && (() => {
          const project = getProjects().find(p => p.id === projectId);
          return project?.clientId ? <GoogleProjectCalendarCard projectId={projectId} clientName={project.clientName} /> : null;
        })()}
```

- [ ] **Step 4: Typecheck**

Run: `cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/googleCalendarStore.ts app/src/screens/ProjetCalendrier.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add project Google Calendar sharing UI to ProjetCalendrier"
```

---

### Task 8: Full end-to-end walkthrough

No new code — this is the design's testing checklist, run once all seven prior tasks are deployed and both migrations from Task 1 have been run.

- [ ] **Step 1: Run the design doc's verification list**

Using a real Rush account, a real Google account, and a test project with at least one client contact (`docs/superpowers/specs/2026-07-16-project-google-calendars-design.md`'s "Testing / verification approach" section):

1. Confirm the org's default calendar is now a dedicated `"Rush — <organisation>"` calendar (not the connecting user's personal primary), and that previously-synced events moved there (should already be true from Task 3's verification).
2. Open a project's Calendrier tab (a project with a client contact assigned); confirm the share prompt appears; activate it; confirm a new Google calendar was created and the client contact received a sharing invite.
3. Confirm any event that already existed on that project moved into the new calendar (no duplicate, same event visible, gone from the default calendar).
4. Create a new event on that project in Rush; confirm it appears only in the project's calendar, not the org default.
5. Create an event with no project (or on a project without an active calendar); confirm it still goes to the org default calendar.
6. Confirm read-only access — as the invited client (or by checking the calendar's sharing settings directly in Google), confirm there's no ability to add/edit events.
7. Add and then remove a second client contact's access to the project (via `ProjectMembres.tsx`); confirm their Google Calendar sharing grant appears and then disappears accordingly (may take a few seconds — this is fire-and-forget, not synchronous with the membership change).
8. Deactivate sharing on the project; confirm the client's access is revoked, the project's events move back to the org default calendar, and the (now empty of Rush events) Google calendar still exists.
9. Reactivate; confirm it reuses the same Google calendar rather than creating a second one, and events move back over.

- [ ] **Step 2: Report results to the user**

Summarize what was verified and any issues found before considering the feature complete.

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** every design section maps to a task — new table (Task 1), library restructure (Task 2), push targeting (Task 3), pull looping (Task 4), activate/deactivate + move semantics (Task 5), client-access sync (Task 6), UI (Task 7), verification (Task 8).
- **Bug found during research, not by the design itself, fixed inline before this plan was written:** `events`, `projects`, `client_contacts`, and `project_client_access` had zero `service_role` grants in the live database — the third occurrence of this project's recurring "RLS bypass ≠ table grant" bug. Fixed via `docs/superpowers/specs/2026-07-16-google-calendar-events-grant-migration.sql`, which Task 1 has the user run alongside this plan's own migration, since Task 3's push verification would otherwise silently fail exactly like the two prior occurrences.
- **Type/signature consistency:** `getValidAccessToken`'s return type changes from `{accessToken, calendarId} | null` to `string | null` in Task 2 — verified both of its call sites (Tasks 3 and 4) were rewritten to match, and that Task 5/6's new endpoints (written after Task 2) use the new signature from the start. `resolveEventCalendarId`/`getOrgDefaultCalendarId` names and signatures are used identically across Tasks 3, 4, 5, and 6.
- **Duplication check:** confirmed no task ever pushes the same event to two calendars — Task 3's push always resolves exactly one target calendar; Task 5's activate/deactivate use `moveGoogleEvent` (not create+delete) specifically to avoid any window where an event could appear in both places or get a new ID.
- **Scope check:** this plan only covers per-project calendar sharing as designed — it does not touch multi-user team access to shared calendars or client write access, both explicit non-goals in the design doc.
