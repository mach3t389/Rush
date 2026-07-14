# Google Calendar integration — design

Status: approved by user, ready for implementation planning.

## Problem

Rush's calendar (`app/src/screens/CalendrierGlobal.tsx`, `ProjetCalendrier.tsx`, backed by `app/src/data/eventStore.ts` and the `events` Supabase table) only ever shows events created directly inside Rush. Teams that already run their scheduling through Google Calendar have to maintain two separate calendars by hand. This adds a Google Calendar integration so an organisation's Rush events and their connected Google Calendar stay in sync automatically.

## Goals

- One Google Calendar connection per organisation (studio), not per person — matches Rush's existing model where events are shared across the whole team, not personal.
- Two-way sync: creating/editing/deleting an event in Rush pushes it to Google immediately; changes made directly in Google Calendar are pulled into Rush on a periodic schedule.
- Available on every plan (Gratuit, Studio, Agence) — unlike the AI assistant, this costs nothing to operate (Google Calendar API has no per-call billing for this kind of usage), so there's no cost-driven reason to gate it, and gating by direction (read-only vs two-way) was considered and rejected as adding real implementation complexity for no operating-cost benefit.

## Non-goals (explicitly out of scope for this round)

- A separate Google Calendar per team member — the organisation-wide single connection is the only mode.
- Real-time push notifications from Google (Google's "watch" channels) — these expire (max 7 days) and need constant renewal; periodic polling is simpler and reliable enough for a first version.
- Automatic reconnection/token-refresh recovery UI beyond "show disconnected, let a user reconnect manually" — if Google revokes access or a refresh token dies, sync just stops and the Paramètres screen shows a clear "Déconnecté" state.
- Merging conflicting edits — last-write-wins (by timestamp) is the whole conflict story.
- Any change to how Rush event *types* work (`eventTypeStore.ts`) — Google events pulled into Rush get a default type; existing Rush event-type logic is untouched.

## Architecture overview

```
Rush (client)                  Vercel serverless functions              Google Calendar API
─────────────                  ────────────────────────────             ───────────────────
"Connecter Google              /api/google-calendar-oauth-start   ──►   OAuth consent screen
 Calendar" button        ──►    (builds Google OAuth URL, redirects)

Google redirects back    ──►   /api/google-calendar-oauth-callback ──►  exchanges code for
 with an auth code               (stores tokens in Supabase,             access + refresh token
                                  scoped to studio_id)

addEvent/updateEvent/    ──►   /api/google-calendar-push            ──► creates/updates/deletes
deleteEvent (eventStore.ts)     (uses stored refresh token)               the Google event

Vercel Cron (every        ──►  /api/google-calendar-pull            ──► events.list with
10–15 min, per connected        (for every studio with an active          incremental syncToken
 studio)                        connection)
                                 ↓
                                writes new/changed/deleted Rush
                                events, tagged with google_event_id
```

## Data model (new Supabase table + column, manual migration like all others in this project)

**New table `google_calendar_connections`** (one row per studio with an active connection):
- `studio_id uuid primary key references studios(id) on delete cascade`
- `access_token text not null`
- `refresh_token text not null`
- `google_calendar_id text not null` — which calendar within the connected Google account (usually `"primary"`)
- `sync_token text` — Google's incremental-sync cursor; null until the first full pull completes
- `connected_by_user_id uuid not null references auth.users(id)`
- `connected_at timestamptz not null default now()`
- `last_synced_at timestamptz`
- RLS: enabled, but only ever read/written by serverless functions via the service-role key — no client-side grants at all (same pattern as `ai_usage`). The client never sees raw tokens; it only ever calls a small serverless "status" endpoint that returns `{ connected: boolean, lastSyncedAt: string | null }`.

**New column on `events`:**
- `google_event_id text` — nullable. Set when an event originated in (or has been pushed to) Google, used to match events on subsequent syncs instead of creating duplicates.

## Sync mechanics

**Rush → Google (push, immediate):** `eventStore.ts`'s real-session `addEvent`/`updateEvent`/`deleteEvent` — after the existing Supabase write succeeds — fire-and-forget a call to a new `/api/google-calendar-push` endpoint with the event id and action (create/update/delete). That endpoint loads the studio's stored tokens, calls the corresponding Google Calendar API method, and (for create) writes the resulting `google_event_id` back onto the Rush event row. If the studio has no active connection, this is a fast no-op (checked first, no Google API call attempted). A failure here (e.g. expired token) is logged server-side and does not block or roll back the Rush-side write — the Rush event still saves; it just doesn't reach Google until the connection is fixed.

**Google → Rush (pull, periodic):** a Vercel Cron job (`/api/google-calendar-pull`, run every 15 minutes) iterates every studio with a connection, calls Google's `events.list` using the stored `sync_token` (an empty/full sync the first time), and for each returned event:
- If it matches an existing Rush event by `google_event_id`, update that Rush event's fields.
- If it's new, insert a new Rush event with a default event type (`autre`) and the Google event's title/time/description, storing its `google_event_id`.
- If Google reports it deleted, delete the matching Rush event.
The response's new `sync_token` is stored for the next run.

**Conflict resolution:** last-write-wins, compared by `updated`/`updatedAt` timestamp on each side — no merge logic.

## UI

- **Paramètres → Intégrations**: a "Google Calendar" card — shows "Connecté" + last-sync time + a "Déconnecter" button when active, or "Connecter Google Calendar" when not. This screen already exists in Rush (currently a placeholder per `CLAUDE.md`'s mention of the Intégrations section) and this becomes its first real integration.
- No changes to `CalendrierGlobal.tsx`/`ProjetCalendrier.tsx` beyond what already renders any Rush event — pulled-in Google events are just regular Rush events once synced, so the existing calendar UI displays them automatically with no special-casing.

## Manual setup required (external actions the user must perform, not something Claude can do)

1. Create a project in Google Cloud Console and enable the Google Calendar API.
2. Configure an OAuth consent screen and create OAuth 2.0 credentials (client ID + secret), with the Vercel deployment's callback URL registered as an authorized redirect URI.
3. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the callback URL as Vercel environment variables (same pattern as `ANTHROPIC_API_KEY`/Stripe keys).
4. Run the new Supabase migration (table + column) manually in the SQL editor.
5. The implementation plan's first step will check the Vercel account's actual plan and its cron limits before building the pull job — Vercel's free/Hobby tier has historically restricted cron jobs to once-daily triggers, which would conflict with the 15-minute interval assumed above. If the account is on Hobby, the plan will either fall back to a supported interval or flag that a paid Vercel tier is needed, rather than building a cron schedule the account can't actually run.

## Testing / verification approach

No automated test suite exists in this project (per CLAUDE.md, verification is manual via the dev server). Verification for this feature means, with a real Google account and a real Rush test organisation:
1. Connect Google Calendar from Paramètres → Intégrations; confirm the card shows "Connecté."
2. Create an event in Rush; confirm it appears in the connected Google Calendar within seconds.
3. Edit and then delete that Rush event; confirm both changes reach Google.
4. Create an event directly in Google Calendar; confirm it appears in Rush within the poll interval, tagged with a default event type.
5. Edit an event in Google directly; confirm the change reaches Rush on the next pull.
6. Disconnect; confirm no further pushes/pulls happen and the UI shows "Déconnecté."
