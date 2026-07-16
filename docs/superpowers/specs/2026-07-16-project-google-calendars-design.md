# Per-project Google Calendar sharing — design

Status: approved by user, ready for implementation planning.

## Problem

The existing Google Calendar integration (`docs/superpowers/specs/2026-07-14-google-calendar-integration-design.md`, shipped and verified 2026-07-16) syncs every Rush event, for the whole organisation, into a single Google Calendar — the one the connecting user already had before connecting Rush (Google's `"primary"` calendar). That's fine for internal team use, but it doesn't support the studio's actual next need: sharing a project's calendar directly with that project's client, via native Google Calendar sharing, so the client sees only their own project's events — never other clients'.

Google Calendar sharing is calendar-level, not event-level: a person with access to a calendar can see everything on it. A single shared calendar containing every client's events is therefore not an option — this requires **one Google Calendar per project** that needs client sharing, kept fully separate from other projects' calendars and from the studio's own internal calendar.

## Goals

- Per project, the studio owner can opt in to creating a dedicated Google Calendar for that project and sharing it (read-only) with the project's client contact(s).
- No event ever exists in more than one Google calendar at a time — each Rush event lives in exactly one Google calendar: its project's calendar if one is active, otherwise the organisation's default calendar. No duplication.
- The studio's own overview ("see everything in one place") comes for free from Google Calendar's native multi-calendar view — every calendar this integration creates belongs to the same connected Google account, so the connecting user already sees and can filter/toggle all of them in their own Google Calendar app. Nothing new to build for that.
- Client sharing stays in sync with Rush's existing project access model (`project_client_access`) — add/remove a client contact from a project and their Google Calendar access follows automatically.
- Activating/deactivating a project's calendar never loses data: existing events move (not duplicate, not delete) between the default calendar and the project calendar, and deactivating never deletes the Google calendar itself.

## Non-goals (explicitly out of scope for this round)

- Automatic activation for every project — this is opt-in, offered as a prompt/button when the studio opens a project's Calendrier tab (only shown if the organisation has an active Google connection and the project has a client).
- Write access for clients — shared project calendars are read-only. A client who edits/adds an event on their end will not sync back to Rush (their Google role won't permit it in the first place).
- Sharing with other studio team members individually — same non-goal as the original integration: one Google account per organisation, not per person. Other team members don't automatically get these calendars in their own Google account.
- Real-time push notifications from Google, conflict-merge logic, and Rush event-type changes — same non-goals as the original integration design, unchanged.
- Deleting a Google calendar when a project is archived/deleted, or when sharing is deactivated — calendars are only ever created or unshared, never deleted by Rush, to avoid any risk of destroying a client-visible history by accident.

## Architecture overview

Builds directly on the existing integration's OAuth connection, push endpoint, and pull cron — this only changes *which calendar* an event targets and adds calendar lifecycle management.

```
Rush (client)                      Vercel serverless functions                Google Calendar API
─────────────                      ────────────────────────────               ───────────────────
Project's Calendrier tab     ──►   /api/google-calendar-project-activate ──►  calendars.insert (create),
"Partager avec [client]"            (creates project calendar,                 acl.insert (share, per
 button                             shares with project_client_access          client contact, role=reader),
                                     contacts, moves existing events)           events.move (existing events)

addEvent/updateEvent/        ──►   /api/google-calendar-push             ──►  targets the project's calendar
deleteEvent (eventStore.ts)         (resolves target calendar: project's        if active, else the org's
                                     if active, else org default)               default calendar

project_client_access         ──►  (existing sync path extended)          ──►  acl.insert / acl.delete on the
 changes (add/remove client                                                     project's Google calendar,
 contact on a project)                                                          only if that project has an
                                                                                  active calendar

Vercel Cron (every 15 min)   ──►   /api/google-calendar-pull             ──►  events.list per calendar
                                     (now loops the org default calendar         (org default + every active
                                     AND every active project calendar)          project calendar), incremental
                                                                                  syncToken per calendar

Deactivate sharing            ──►  /api/google-calendar-project-deactivate──►  acl.delete (unshare),
                                     (moves events back to org default,          events.move (back to default)
                                     revokes client access, keeps the
                                     Google calendar itself intact)
```

## Data model

**Repurposed: `google_calendar_connections.google_calendar_id`**

Currently holds the literal string `"primary"` (the connecting user's own default Google calendar). This becomes the ID of a dedicated calendar Rush creates on connect, named `"Rush — <nom de l'organisation>"`, so Rush events stop mixing into the connecting user's personal calendar. For the studio's existing connection (already live in production), the implementation plan includes a one-time migration step: create the dedicated calendar and update the stored `google_calendar_id`, moving any already-synced events over to it.

**New table `project_google_calendars`** (one row per project that has an activated calendar):
- `project_id text primary key references projects(id) on delete cascade`
- `studio_id uuid not null references studios(id) on delete cascade` — denormalized for RLS/query symmetry with other studio-scoped tables
- `google_calendar_id text not null`
- `sync_token text` — this project calendar's own incremental-sync cursor, independent from the org default calendar's
- `active boolean not null default true` — false after deactivation; the calendar and its row are kept, just no longer a push/pull target and no longer shared
- `shared_contact_ids text[] not null default '{}'` — the `client_contacts.id`s currently granted access, used to diff against `project_client_access` when membership changes so Rush knows exactly which ACL grants to add/remove
- `created_at timestamptz not null default now()`
- `last_synced_at timestamptz`
- RLS: enabled, no client grants — same service-role-only pattern as `google_calendar_connections` (and the same explicit `grant ... to service_role` this project has now twice forgotten and had to add after the fact — the new migration will include it from the start).

**`events` table:** no new column needed. The existing `google_event_id` still holds exactly one Google event ID per Rush event, because an event now only ever lives in one Google calendar at a time — this design's core simplification versus the earlier duplicate-push draft.

## Sync mechanics

**Resolving an event's target calendar (used by push, and by the pull cron to know which calendar maps to which):** a Rush event with a `project_id` that has an `active` row in `project_google_calendars` targets that project's `google_calendar_id`. Every other event (no project, or project without an active calendar) targets the organisation's default calendar from `google_calendar_connections.google_calendar_id`. This resolution happens fresh on every push, so an event created before a project's calendar was activated automatically targets the right calendar going forward once activated (the activation step below explicitly moves pre-existing ones too).

**Activating a project's calendar (`/api/google-calendar-project-activate`):**
1. Verify the caller is a member of the project's studio and the project has at least one client contact with `project_client_access`.
2. `calendars.insert` a new Google calendar named after the project.
3. For each client contact with `project_client_access` on this project, `acl.insert` with `role: "reader"` on their email.
4. Insert the `project_google_calendars` row (`shared_contact_ids` = those contact ids, `sync_token` null).
5. For every existing Rush event with this `project_id` that has a `google_event_id`, call `events.move` from the org default calendar to the new project calendar — same event ID, no duplication, no gap in history.

**Deactivating (`/api/google-calendar-project-deactivate`):** the reverse — `acl.delete` every granted contact, `events.move` every event with this `project_id` back to the org default calendar, set `active = false`. The Google calendar itself is left in place (empty of Rush's events, still owned by the studio's connected account) in case sharing is turned back on later.

**Keeping client access in sync with `project_client_access`:** the existing code path that already reacts to project member/client changes (see `c297b9a feat: sync project_client_access whenever project members change` in git history) gets one more step: if the affected project has an `active` row in `project_google_calendars`, diff the new `project_client_access` contact list against `shared_contact_ids` and issue the corresponding `acl.insert`/`acl.delete` calls, then update `shared_contact_ids`.

**Push (`/api/google-calendar-push`, unchanged shape, new target resolution):** resolves the target calendar as described above instead of always using `google_calendar_connections.google_calendar_id`, otherwise identical to the existing create/update/delete logic.

**Pull (`/api/google-calendar-pull`, unchanged shape, now loops calendars):** instead of one `events.list` call per studio, the cron does one call per **calendar** — the org default plus every row in `project_google_calendars` where `active = true` — each with its own stored `sync_token`. Everything else (matching by `google_event_id`, insert/update/delete on the Rush side, default event type for new pulled-in events) is identical to the existing per-studio logic, just parameterized by calendar instead of by studio.

**Conflict resolution, error handling:** unchanged from the original design — last-write-wins by timestamp, a failed push never blocks or rolls back the Rush-side write.

## UI

- **Project's Calendrier tab (`ProjetCalendrier.tsx`):** if the organisation has an active Google connection and the project has at least one client contact with access, and no `project_google_calendars` row exists yet, show a dismissible prompt/button: *"Partager le calendrier de ce projet avec [nom du client] sur Google Calendar"*. Once activated, this becomes a small status indicator ("Partagé avec [client]" + a "Ne plus partager" action) rather than disappearing — consistent with how the org-level connection status is always visible in Paramètres, not just at connect time.
- **Paramètres → Intégrations:** unchanged — still shows the one organisation-level Google connection status, since the OAuth connection itself is still per-organisation, not per-project.
- No changes to `CalendrierGlobal.tsx` or the general event-rendering logic — same as the original design, a synced event is just a regular Rush event once it lands in the `events` table; which Google calendar it happens to live in is invisible to Rush's own UI.

## Manual setup required

None beyond what the original integration already required (Google Cloud OAuth app, Vercel env vars, the original migration). This design adds one new migration (`project_google_calendars` table, with `service_role` grants included from the start) that the user will need to run manually in the Supabase SQL editor, same as every other migration in this project.

## Testing / verification approach

With a real Google account, a real Rush test organisation, and a test project with a client contact:
1. Confirm the org's default calendar is now a dedicated `"Rush — <organisation>"` calendar (not the connecting user's personal primary), and that previously-synced events moved there.
2. Open a project's Calendrier tab; confirm the share prompt appears; activate it; confirm a new Google calendar was created and the client contact received a sharing invite.
3. Confirm any event that already existed on that project moved into the new calendar (no duplicate, same event visible, gone from the default calendar).
4. Create a new event on that project in Rush; confirm it appears only in the project's calendar, not the org default.
5. Create an event with no project (or on a project without an active calendar); confirm it still goes to the org default calendar.
6. As the client (or by checking sharing permissions directly), confirm read-only access — no ability to add/edit.
7. Add and then remove a second client contact's access to the project; confirm their Google Calendar sharing grant appears and then disappears accordingly.
8. Deactivate sharing on the project; confirm the client's access is revoked, the project's events move back to the org default calendar, and the (now empty of Rush events) Google calendar still exists.
9. Reactivate; confirm it reuses the same Google calendar rather than creating a second one, and events move back over.
