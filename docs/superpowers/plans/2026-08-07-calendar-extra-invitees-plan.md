# Invités manuels du calendrier Google d'un projet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a studio member invite any email address (not just existing client contacts) to a project's dedicated Google Calendar, with the same "pending until Partager" and revocable-anytime behavior contacts already have.

**Architecture:** Two new columns on the existing `project_google_calendars` table (`extra_invitees` = desired list, `extra_invitees_shared` = subset actually invited via Google) mirror the existing contacts model (`project_client_access` = desired, `shared_contact_ids` = subset actually invited). Two new dispatcher actions (`add-extra-invitee`, `remove-extra-invitee`) are added to the existing `app/api/google-calendar-project.ts` file — no new serverless function, since Vercel's Hobby plan is already at its 12-function cap. `sync-access` (the "Partager" button's endpoint) is extended to diff and invite/revoke both lists in one call.

**Tech Stack:** React 19 + TypeScript, Vercel serverless functions (`@vercel/node`), Supabase (Postgres), Google Calendar API (already wrapped in `app/api/_lib/googleCalendarApi.ts`).

## Global Constraints

- Vercel Hobby plan is at exactly 12/12 serverless functions — do NOT create a new file under `app/api/`. All new behavior goes through existing dispatcher actions in `app/api/google-calendar-project.ts`.
- No automated test suite in this project (see `CLAUDE.md`) — verification is `npx tsc --noEmit -p tsconfig.app.json` / `-p tsconfig.api.json` plus manual testing via `npm run dev`. Do not invent a test framework.
- Every new Supabase migration is a **spec only** — it must be executed manually by the user in Supabase SQL Editor. Never assume it ran automatically.
- Every new Supabase policy/grant follows the existing RLS pattern already used by `project_google_calendars` (service-role only, no direct client access — this table is only ever touched by `app/api/google-calendar-project.ts` using `SUPABASE_SERVICE_ROLE_KEY`).
- Every new user-facing string goes through `t('calendar.<key>')` and must be added to BOTH `app/src/locales/fr.json` and `app/src/locales/en.json` — never hard-code text.
- This feature is invisible in demo sessions (`isDemoSession()` short-circuits `GoogleProjectCalendarButton` to `null`) — manual verification requires a real Supabase session with Google Calendar connected in Paramètres, or careful reading of the diff for correctness when that's not available.

---

### Task 1: Migration — `extra_invitees` / `extra_invitees_shared` columns

**Files:**
- Create: `docs/superpowers/specs/2026-08-07-calendar-extra-invitees-migration.sql`

**Interfaces:**
- Produces: two new nullable-free array columns on `project_google_calendars`, consumed by every later task's Supabase queries: `extra_invitees text[] not null default '{}'` (the desired list — every manually-added email, whether shared yet or not) and `extra_invitees_shared text[] not null default '{}'` (the subset of `extra_invitees` currently granted access on the Google Calendar itself).

- [ ] **Step 1: Write the migration file**

```sql
-- docs/superpowers/specs/2026-08-07-calendar-extra-invitees-migration.sql
--
-- Adds manual-invitee support to a project's dedicated Google Calendar.
-- Mirrors the existing contacts model on the same table:
--   - project_client_access + client_contacts  = "desired" contacts list
--   - shared_contact_ids                       = subset of contacts actually
--                                                 invited on the Google side
-- For manually-added emails there is no external "desired" source (no
-- client_contacts row), so both halves live directly on this table:
--   - extra_invitees        = desired list of manually-added emails
--   - extra_invitees_shared = subset of extra_invitees actually invited

alter table project_google_calendars
  add column if not exists extra_invitees text[] not null default '{}',
  add column if not exists extra_invitees_shared text[] not null default '{}';
```

- [ ] **Step 2: Ask the user to run this migration**

Tell the user: "Please paste and run `docs/superpowers/specs/2026-08-07-calendar-extra-invitees-migration.sql` in Supabase → SQL Editor before Task 2's API changes can be tested against a real project." Do not proceed to assume it ran — this is a manual step per this project's convention (see Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-07-calendar-extra-invitees-migration.sql
git commit -m "docs: migration for calendar manual invitees columns"
```

---

### Task 2: Backend — extend `app/api/google-calendar-project.ts`

**Files:**
- Modify: `app/api/google-calendar-project.ts`

**Interfaces:**
- Consumes: `shareGoogleCalendar(accessToken: string, calendarId: string, email: string): Promise<void>` and `unshareGoogleCalendar(accessToken: string, calendarId: string, email: string): Promise<void>` from `./_lib/googleCalendarApi.js` (both already imported at the top of this file — no new import needed).
- Produces: two new dispatcher actions, `add-extra-invitee` and `remove-extra-invitee`; `statusHandler`'s JSON response gains an `extraInvitees: { email: string; shared: boolean }[]` field; the `activate`/`deactivate`/`sync-access` handlers now also read/write `extra_invitees` and `extra_invitees_shared` alongside the existing `shared_contact_ids` handling. These are exactly the field names Task 3 (`googleCalendarStore.ts`) will consume.

This task edits one file in several places. Each step below is a precise find-and-replace — apply them in order.

- [ ] **Step 1: `statusHandler` — select and return the two new columns**

Find (around line 82-110):

```typescript
  const { data: row } = await supabaseAdmin
    .from('project_google_calendars')
    .select('active, shared_contact_ids')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  const { data: access } = await supabaseAdmin
    .from('project_client_access')
    .select('client_contact_id')
    .eq('project_id', projectId);
  const contactIds = (access ?? []).map(r => r.client_contact_id as string);

  let contacts: { id: string; name: string; email: string; shared: boolean }[] = [];
  if (contactIds.length > 0) {
    const sharedIds = new Set((row?.shared_contact_ids ?? []) as string[]);
    const { data: contactRows } = await supabaseAdmin
      .from('client_contacts')
      .select('id, name, email')
      .in('id', contactIds);
    contacts = (contactRows ?? []).map(c => ({
      id: c.id as string,
      name: c.name as string,
      email: c.email as string,
      shared: sharedIds.has(c.id as string),
    }));
  }

  res.status(200).json({ active: !!row?.active, contacts });
```

Replace with:

```typescript
  const { data: row } = await supabaseAdmin
    .from('project_google_calendars')
    .select('active, shared_contact_ids, extra_invitees, extra_invitees_shared')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  const { data: access } = await supabaseAdmin
    .from('project_client_access')
    .select('client_contact_id')
    .eq('project_id', projectId);
  const contactIds = (access ?? []).map(r => r.client_contact_id as string);

  let contacts: { id: string; name: string; email: string; shared: boolean }[] = [];
  if (contactIds.length > 0) {
    const sharedIds = new Set((row?.shared_contact_ids ?? []) as string[]);
    const { data: contactRows } = await supabaseAdmin
      .from('client_contacts')
      .select('id, name, email')
      .in('id', contactIds);
    contacts = (contactRows ?? []).map(c => ({
      id: c.id as string,
      name: c.name as string,
      email: c.email as string,
      shared: sharedIds.has(c.id as string),
    }));
  }

  const extraSharedSet = new Set((row?.extra_invitees_shared ?? []) as string[]);
  const extraInvitees = ((row?.extra_invitees ?? []) as string[]).map(email => ({
    email,
    shared: extraSharedSet.has(email),
  }));

  res.status(200).json({ active: !!row?.active, contacts, extraInvitees });
```

- [ ] **Step 2: `activateHandler` — reset both new columns wherever `shared_contact_ids` is reset**

There are two places in `activateHandler` that write `shared_contact_ids: []` (the stale-row recreate branch, and the brand-new-row insert branch). Both must also reset the two new columns, for the same reason documented in the design spec: a recreated/brand-new Google calendar has no existing access, manual or otherwise.

Find:

```typescript
      const { error: updateError } = await supabaseAdmin
        .from('project_google_calendars')
        .update({ google_calendar_id: calendarId, active: true, shared_contact_ids: [] })
        .eq('project_id', projectId);
```

Replace with:

```typescript
      const { error: updateError } = await supabaseAdmin
        .from('project_google_calendars')
        .update({ google_calendar_id: calendarId, active: true, shared_contact_ids: [], extra_invitees: [], extra_invitees_shared: [] })
        .eq('project_id', projectId);
```

Find:

```typescript
      const { error: insertError } = await supabaseAdmin.from('project_google_calendars').insert({
        project_id: projectId,
        studio_id: studioId,
        google_calendar_id: calendarId,
        active: true,
        shared_contact_ids: [],
      });
```

Replace with:

```typescript
      const { error: insertError } = await supabaseAdmin.from('project_google_calendars').insert({
        project_id: projectId,
        studio_id: studioId,
        google_calendar_id: calendarId,
        active: true,
        shared_contact_ids: [],
        extra_invitees: [],
        extra_invitees_shared: [],
      });
```

- [ ] **Step 3: `deactivateHandler` — unshare extra invitees too, keep the desired list intact**

Find (around line 374-437):

```typescript
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
    const stillSharedIds: string[] = [];
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
          stillSharedIds.push(contact.id as string);
        }
      }
    }
```

Replace with:

```typescript
  const { data: row, error: rowError } = await supabaseAdmin
    .from('project_google_calendars')
    .select('google_calendar_id, active, shared_contact_ids, extra_invitees_shared')
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
    const stillSharedIds: string[] = [];
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
          stillSharedIds.push(contact.id as string);
        }
      }
    }

    // Manually-added emails: unshare the same way, directly from the stored
    // email (no client_contacts lookup needed — the address is already
    // stored raw). The desired list (extra_invitees) is deliberately left
    // untouched here — deactivating never clears what the user asked for,
    // only what's actually granted right now, same as contacts above.
    const extraSharedEmails = (row.extra_invitees_shared ?? []) as string[];
    const stillSharedExtra: string[] = [];
    for (const email of extraSharedEmails) {
      try {
        await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
      } catch (err) {
        console.error(`Failed to unshare calendar with ${email}:`, err);
        stillSharedExtra.push(email);
      }
    }
```

Now find the update at the end of `deactivateHandler`:

```typescript
    const { error: deactivateUpdateError } = await supabaseAdmin
      .from('project_google_calendars')
      .update({ active: false, shared_contact_ids: stillSharedIds })
      .eq('project_id', projectId);
```

Replace with:

```typescript
    const { error: deactivateUpdateError } = await supabaseAdmin
      .from('project_google_calendars')
      .update({ active: false, shared_contact_ids: stillSharedIds, extra_invitees_shared: stillSharedExtra })
      .eq('project_id', projectId);
```

- [ ] **Step 4: `syncAccessHandler` — diff and sync both lists**

This is the "Partager" button's endpoint. Find the entire body from the row select through the final response (around line 488-561):

```typescript
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

      const finalIds = new Set(previousIds);
      for (const id of toAdd) {
        const email = emailById.get(id);
        if (!email) continue;
        try {
          await shareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
          finalIds.add(id);
        } catch (err) {
          console.error(`Failed to share calendar with ${email}:`, err);
        }
      }
      for (const id of toRemove) {
        const email = emailById.get(id);
        if (!email) continue;
        try {
          await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
          finalIds.delete(id);
        } catch (err) {
          console.error(`Failed to unshare calendar with ${email}:`, err);
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('project_google_calendars')
        .update({ shared_contact_ids: Array.from(finalIds) })
        .eq('project_id', projectId);
      if (updateError) {
        console.error(`Failed to persist shared_contact_ids for project ${projectId}:`, updateError);
        res.status(500).json({ error: 'Failed to sync access' });
        return;
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to sync project Google Calendar access:', error);
    res.status(200).json({ ok: false, error: 'sync_failed' });
  }
```

Replace with:

```typescript
  const { data: row, error: rowError } = await supabaseAdmin
    .from('project_google_calendars')
    .select('google_calendar_id, active, shared_contact_ids, extra_invitees, extra_invitees_shared')
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
    const finalIds = new Set(previousIds);

    if (toAdd.length > 0 || toRemove.length > 0) {
      const { data: contacts } = await supabaseAdmin
        .from('client_contacts')
        .select('id, email')
        .in('id', [...toAdd, ...toRemove]);
      const emailById = new Map((contacts ?? []).map(c => [c.id as string, c.email as string]));

      for (const id of toAdd) {
        const email = emailById.get(id);
        if (!email) continue;
        try {
          await shareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
          finalIds.add(id);
        } catch (err) {
          console.error(`Failed to share calendar with ${email}:`, err);
        }
      }
      for (const id of toRemove) {
        const email = emailById.get(id);
        if (!email) continue;
        try {
          await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
          finalIds.delete(id);
        } catch (err) {
          console.error(`Failed to unshare calendar with ${email}:`, err);
        }
      }
    }

    // Manually-added emails follow the exact same add/remove diff, against
    // extra_invitees (desired) vs extra_invitees_shared (currently granted)
    // instead of project_client_access vs shared_contact_ids — same button,
    // same call, both lists reconciled together.
    const extraDesired = (row.extra_invitees ?? []) as string[];
    const extraPreviouslyShared = (row.extra_invitees_shared ?? []) as string[];
    const extraToAdd = extraDesired.filter(email => !extraPreviouslyShared.includes(email));
    const extraToRemove = extraPreviouslyShared.filter(email => !extraDesired.includes(email));
    const finalExtraShared = new Set(extraPreviouslyShared);

    for (const email of extraToAdd) {
      try {
        await shareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
        finalExtraShared.add(email);
      } catch (err) {
        console.error(`Failed to share calendar with ${email}:`, err);
      }
    }
    for (const email of extraToRemove) {
      try {
        await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
        finalExtraShared.delete(email);
      } catch (err) {
        console.error(`Failed to unshare calendar with ${email}:`, err);
      }
    }

    if (toAdd.length > 0 || toRemove.length > 0 || extraToAdd.length > 0 || extraToRemove.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('project_google_calendars')
        .update({ shared_contact_ids: Array.from(finalIds), extra_invitees_shared: Array.from(finalExtraShared) })
        .eq('project_id', projectId);
      if (updateError) {
        console.error(`Failed to persist shared access for project ${projectId}:`, updateError);
        res.status(500).json({ error: 'Failed to sync access' });
        return;
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to sync project Google Calendar access:', error);
    res.status(200).json({ ok: false, error: 'sync_failed' });
  }
```

- [ ] **Step 5: Add `addExtraInviteeHandler` and `removeExtraInviteeHandler`**

Add these two new functions right after `syncAccessHandler` (before the `export default async function handler` dispatcher):

```typescript
interface AddExtraInviteeBody {
  studioId: string;
  projectId: string;
  email: string;
}

async function addExtraInviteeHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId, email } = req.body as AddExtraInviteeBody;
  if (!studioId || !projectId || !email) {
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
    .select('extra_invitees')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (rowError || !row) {
    res.status(404).json({ error: 'Project calendar not found' });
    return;
  }

  const current = (row.extra_invitees ?? []) as string[];
  // Idempotent — adding an already-present email is a no-op, not an error,
  // since the client already blocks duplicates before calling this.
  if (current.includes(email)) {
    res.status(200).json({ ok: true });
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('project_google_calendars')
    .update({ extra_invitees: [...current, email] })
    .eq('project_id', projectId);
  if (updateError) {
    console.error(`Failed to add extra invitee ${email} for project ${projectId}:`, updateError);
    res.status(500).json({ error: 'Failed to add invitee' });
    return;
  }

  res.status(200).json({ ok: true });
}

interface RemoveExtraInviteeBody {
  studioId: string;
  projectId: string;
  email: string;
}

async function removeExtraInviteeHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId, projectId, email } = req.body as RemoveExtraInviteeBody;
  if (!studioId || !projectId || !email) {
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
    .select('google_calendar_id, active, extra_invitees, extra_invitees_shared')
    .eq('project_id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle();

  // Nothing to remove — idempotent, not an error.
  if (rowError || !row) {
    res.status(200).json({ ok: true });
    return;
  }

  const remainingDesired = ((row.extra_invitees ?? []) as string[]).filter(e => e !== email);
  const wasShared = ((row.extra_invitees_shared ?? []) as string[]).includes(email);
  let remainingShared = (row.extra_invitees_shared ?? []) as string[];

  // Revoke immediately if it had actually been invited and the calendar can
  // currently be reached — same "revoke now" behavior as removing a client
  // contact's access. If the calendar is inactive or Google isn't
  // reachable right now, the email is dropped from the desired list anyway;
  // it stays in extra_invitees_shared and the next "Partager" click's
  // sync-access diff will retry the revoke then (same self-healing property
  // sync-access already has for contacts).
  if (wasShared && row.active) {
    try {
      const accessToken = await getValidAccessToken(supabaseAdmin, studioId);
      if (accessToken) {
        await unshareGoogleCalendar(accessToken, row.google_calendar_id as string, email);
        remainingShared = remainingShared.filter(e => e !== email);
      }
    } catch (err) {
      console.error(`Failed to unshare calendar with ${email}:`, err);
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('project_google_calendars')
    .update({ extra_invitees: remainingDesired, extra_invitees_shared: remainingShared })
    .eq('project_id', projectId);
  if (updateError) {
    console.error(`Failed to remove extra invitee ${email} for project ${projectId}:`, updateError);
    res.status(500).json({ error: 'Failed to remove invitee' });
    return;
  }

  res.status(200).json({ ok: true });
}
```

- [ ] **Step 6: Wire the two new actions into the dispatcher**

Find:

```typescript
  switch (action) {
    case 'status': return statusHandler(req, res);
    case 'activate': return activateHandler(req, res);
    case 'deactivate': return deactivateHandler(req, res);
    case 'sync-access': return syncAccessHandler(req, res);
    default:
      res.status(400).json({ error: 'Unknown or missing action' });
  }
```

Replace with:

```typescript
  switch (action) {
    case 'status': return statusHandler(req, res);
    case 'activate': return activateHandler(req, res);
    case 'deactivate': return deactivateHandler(req, res);
    case 'sync-access': return syncAccessHandler(req, res);
    case 'add-extra-invitee': return addExtraInviteeHandler(req, res);
    case 'remove-extra-invitee': return removeExtraInviteeHandler(req, res);
    default:
      res.status(400).json({ error: 'Unknown or missing action' });
  }
```

- [ ] **Step 7: Type-check the API project**

Run: `cd app && npx tsc --noEmit -p tsconfig.api.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/google-calendar-project.ts
git commit -m "feat(calendar): backend support for manual calendar invitees"
```

---

### Task 3: Frontend data layer — `googleCalendarStore.ts`

**Files:**
- Modify: `app/src/data/googleCalendarStore.ts`

**Interfaces:**
- Consumes: nothing new — same `fetch`/`authHeaders`/`getStudioId` plumbing already in this file.
- Produces: `ProjectGoogleCalendarStatus.extraInvitees: ProjectGoogleCalendarExtraInvitee[]` (new field), `addExtraInvitee(projectId: string, email: string): Promise<void>`, `removeExtraInvitee(projectId: string, email: string): Promise<void>` — these three names are exactly what Task 4 imports.

- [ ] **Step 1: Extend the status types and add the two new functions**

Find:

```typescript
export interface ProjectGoogleCalendarContact {
  id: string;
  name: string;
  email: string;
  shared: boolean;
}

export interface ProjectGoogleCalendarStatus {
  active: boolean;
  contacts: ProjectGoogleCalendarContact[];
}
```

Replace with:

```typescript
export interface ProjectGoogleCalendarContact {
  id: string;
  name: string;
  email: string;
  shared: boolean;
}

export interface ProjectGoogleCalendarExtraInvitee {
  email: string;
  shared: boolean;
}

export interface ProjectGoogleCalendarStatus {
  active: boolean;
  contacts: ProjectGoogleCalendarContact[];
  extraInvitees: ProjectGoogleCalendarExtraInvitee[];
}
```

Find:

```typescript
export async function getProjectGoogleCalendarStatus(projectId: string): Promise<ProjectGoogleCalendarStatus> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-project?action=status&studioId=${studioId}&projectId=${projectId}`, { headers });
  if (!resp.ok) return { active: false, contacts: [] };
  return resp.json();
}
```

Replace with:

```typescript
export async function getProjectGoogleCalendarStatus(projectId: string): Promise<ProjectGoogleCalendarStatus> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch(`/api/google-calendar-project?action=status&studioId=${studioId}&projectId=${projectId}`, { headers });
  if (!resp.ok) return { active: false, contacts: [], extraInvitees: [] };
  return resp.json();
}
```

- [ ] **Step 2: Add `addExtraInvitee` / `removeExtraInvitee`**

Add these two functions right after `shareProjectGoogleCalendarNow` (before `deactivateProjectGoogleCalendar`):

```typescript
// Adds a manually-entered email to a project calendar's invitee list.
// Pending until the next "Partager" click (shareProjectGoogleCalendarNow) —
// this call never talks to Google itself, it only records intent, exactly
// like a client contact getting project access does before it's shared.
export async function addExtraInvitee(projectId: string, email: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-extra-invitee', studioId, projectId, email }),
  });
  if (!resp.ok) throw new Error('Failed to add invitee');
}

// Removes a manually-entered email — revokes its Google Calendar access
// immediately if it had already been shared, same as removing a client
// contact's project access does.
export async function removeExtraInvitee(projectId: string, email: string): Promise<void> {
  const studioId = await getStudioId();
  const headers = await authHeaders();
  const resp = await fetch('/api/google-calendar-project', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remove-extra-invitee', studioId, projectId, email }),
  });
  if (!resp.ok) throw new Error('Failed to remove invitee');
}
```

- [ ] **Step 3: Type-check**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (nothing consumes these new exports yet, so this only checks the file itself is valid).

- [ ] **Step 4: Commit**

```bash
git add app/src/data/googleCalendarStore.ts
git commit -m "feat(calendar): add/removeExtraInvitee client functions"
```

---

### Task 4: UI — `GoogleProjectCalendarButton` in `ProjetCalendrier.tsx`

**Files:**
- Modify: `app/src/screens/ProjetCalendrier.tsx:454-638` (the `GoogleProjectCalendarButton` function)
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Consumes: `addExtraInvitee`, `removeExtraInvitee`, `ProjectGoogleCalendarExtraInvitee` from `../data/googleCalendarStore` (Task 3); `ProjectGoogleCalendarStatus.extraInvitees` field (Task 2/3).
- Produces: nothing consumed elsewhere — this is the leaf UI.

- [ ] **Step 1: Add the new i18n keys**

In `app/src/locales/fr.json`, find:

```json
    "gcalProjectNoContacts": "Aucun contact client n'a accès à ce projet pour l'instant.",
```

Replace with:

```json
    "gcalProjectNoContacts": "Aucun contact client n'a accès à ce projet pour l'instant.",
    "gcalAddEmailPlaceholder": "Ajouter un courriel…",
    "gcalAddEmailAction": "Ajouter cet invité",
    "gcalEmailInvalid": "Adresse courriel invalide.",
    "gcalEmailDuplicate": "Cette adresse est déjà invitée.",
    "gcalRemoveExtraInviteeAction": "Retirer cet invité",
    "gcalProjectShareActionGeneric": "Partager",
    "gcalProjectActivatedConfirmationGeneric": "Invitation envoyée.",
```

In `app/src/locales/en.json`, find:

```json
    "gcalProjectNoContacts": "No client contact has access to this project yet.",
```

Replace with:

```json
    "gcalProjectNoContacts": "No client contact has access to this project yet.",
    "gcalAddEmailPlaceholder": "Add an email…",
    "gcalAddEmailAction": "Add this invitee",
    "gcalEmailInvalid": "Invalid email address.",
    "gcalEmailDuplicate": "This address is already invited.",
    "gcalRemoveExtraInviteeAction": "Remove this invitee",
    "gcalProjectShareActionGeneric": "Share",
    "gcalProjectActivatedConfirmationGeneric": "Invitation sent.",
```

- [ ] **Step 2: Add state and load logic**

Find (around line 454-478):

```typescript
function GoogleProjectCalendarButton({ projectId, clientName }: { projectId: string; clientName: string }) {
  const { t } = useTranslation();
  const [orgConnected, setOrgConnected] = useState<boolean | null>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<ProjectGoogleCalendarContact[]>([]);
  const [busy, setBusy] = useState(false);
```

Replace with:

```typescript
function GoogleProjectCalendarButton({ projectId, clientName }: { projectId: string; clientName: string }) {
  const { t } = useTranslation();
  const [orgConnected, setOrgConnected] = useState<boolean | null>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<ProjectGoogleCalendarContact[]>([]);
  const [extraInvitees, setExtraInvitees] = useState<ProjectGoogleCalendarExtraInvitee[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
```

Update the import line at the top of the file. Find:

```typescript
import { getGoogleCalendarStatus, getProjectGoogleCalendarStatus, activateProjectGoogleCalendar, deactivateProjectGoogleCalendar, shareProjectGoogleCalendarNow, type ProjectGoogleCalendarContact } from '../data/googleCalendarStore';
```

Replace with:

```typescript
import { getGoogleCalendarStatus, getProjectGoogleCalendarStatus, activateProjectGoogleCalendar, deactivateProjectGoogleCalendar, shareProjectGoogleCalendarNow, addExtraInvitee, removeExtraInvitee, type ProjectGoogleCalendarContact, type ProjectGoogleCalendarExtraInvitee } from '../data/googleCalendarStore';
```

Find the two `loadStatus`/effect blocks that both currently do:

```typescript
  const loadStatus = async () => {
    const [status, projectStatus] = await Promise.all([
      getGoogleCalendarStatus(),
      getProjectGoogleCalendarStatus(projectId),
    ]);
    setOrgConnected(status.connected);
    if (status.connected) {
      setActive(projectStatus.active);
      setContacts(projectStatus.contacts);
    }
  };

  useEffect(() => {
    if (isDemoSession()) return;
    let cancelled = false;
    (async () => {
      const [status, projectStatus] = await Promise.all([
        getGoogleCalendarStatus(),
        getProjectGoogleCalendarStatus(projectId),
      ]);
      if (cancelled) return;
      setOrgConnected(status.connected);
      if (status.connected) {
        setActive(projectStatus.active);
        setContacts(projectStatus.contacts);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);
```

Replace with:

```typescript
  const loadStatus = async () => {
    const [status, projectStatus] = await Promise.all([
      getGoogleCalendarStatus(),
      getProjectGoogleCalendarStatus(projectId),
    ]);
    setOrgConnected(status.connected);
    if (status.connected) {
      setActive(projectStatus.active);
      setContacts(projectStatus.contacts);
      setExtraInvitees(projectStatus.extraInvitees);
    }
  };

  useEffect(() => {
    if (isDemoSession()) return;
    let cancelled = false;
    (async () => {
      const [status, projectStatus] = await Promise.all([
        getGoogleCalendarStatus(),
        getProjectGoogleCalendarStatus(projectId),
      ]);
      if (cancelled) return;
      setOrgConnected(status.connected);
      if (status.connected) {
        setActive(projectStatus.active);
        setContacts(projectStatus.contacts);
        setExtraInvitees(projectStatus.extraInvitees);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);
```

- [ ] **Step 3: Add `handleAddEmail` / `handleRemoveExtraInvitee`**

Find (around line 519-530):

```typescript
  const handleShare = async () => {
    setBusy(true);
    try {
      await shareProjectGoogleCalendarNow(projectId);
      await loadStatus();
      setConfirmation(t('calendar.gcalProjectActivatedConfirmation', { client: clientName }));
    } catch (err) {
      console.error('Failed to share project Google Calendar', err);
    } finally {
      setBusy(false);
    }
  };
```

Replace with:

```typescript
  const handleShare = async () => {
    setBusy(true);
    try {
      await shareProjectGoogleCalendarNow(projectId);
      await loadStatus();
      setConfirmation(clientName
        ? t('calendar.gcalProjectActivatedConfirmation', { client: clientName })
        : t('calendar.gcalProjectActivatedConfirmationGeneric'));
    } catch (err) {
      console.error('Failed to share project Google Calendar', err);
    } finally {
      setBusy(false);
    }
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleAddEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setEmailError(t('calendar.gcalEmailInvalid'));
      return;
    }
    const isDuplicate = contacts.some(c => c.email.toLowerCase() === email)
      || extraInvitees.some(e => e.email.toLowerCase() === email);
    if (isDuplicate) {
      setEmailError(t('calendar.gcalEmailDuplicate'));
      return;
    }
    setEmailError(null);
    setBusy(true);
    try {
      await addExtraInvitee(projectId, email);
      await loadStatus();
      setNewEmail('');
    } catch (err) {
      console.error('Failed to add extra invitee', err);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveExtraInvitee = async (email: string) => {
    setBusy(true);
    try {
      await removeExtraInvitee(projectId, email);
      await loadStatus();
    } catch (err) {
      console.error('Failed to remove extra invitee', err);
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 4: Render the extra-invitees list, add-email input, and fix the empty/share states**

Find (around line 586-623):

```typescript
            {active && contacts.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {contacts.map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <SFIcon name={c.shared ? 'check-circle' : 'clock'} size={11} color={c.shared ? 'var(--ok)' : 'var(--text-3)'} />
                    <span style={{ fontSize:11, color:'var(--text-2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                    <span style={{ fontSize:9, fontFamily:'var(--ff-mono)', color:'var(--text-3)' }}>
                      {c.shared ? t('calendar.gcalProjectContactShared') : t('calendar.gcalProjectContactPending')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {active && contacts.length === 0 && (
              <span style={{ fontSize:11, color:'var(--text-3)' }}>{t('calendar.gcalProjectNoContacts')}</span>
            )}

            {!active && (
              <span style={{ fontSize:11, color:'var(--text-3)' }}>{t('calendar.gcalProjectCreateHint')}</span>
            )}

            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {!active && (
                <button onClick={handleCreate} disabled={busy}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily:'var(--ff-text)' }}
                >
                  {busy ? '…' : t('calendar.gcalProjectCreateAction')}
                </button>
              )}

              {active && contacts.some(c => !c.shared) && (
                <button onClick={handleShare} disabled={busy}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--ok)', background:'rgba(52,201,138,0.1)', color:'var(--ok)', fontSize:11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily:'var(--ff-text)' }}
                >
                  {busy ? '…' : t('calendar.gcalProjectShareAction', { client: clientName })}
                </button>
              )}

              {active && (
                <button onClick={handleDeactivate} disabled={busy} title={t('calendar.gcalProjectDeactivateHint')}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--danger)', background:'transparent', color:'var(--danger)', fontSize:11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily:'var(--ff-text)' }}
                >
                  {busy ? '…' : t('calendar.gcalProjectDeactivateAction')}
                </button>
              )}
            </div>
```

Replace with:

```typescript
            {active && contacts.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {contacts.map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <SFIcon name={c.shared ? 'check-circle' : 'clock'} size={11} color={c.shared ? 'var(--ok)' : 'var(--text-3)'} />
                    <span style={{ fontSize:11, color:'var(--text-2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                    <span style={{ fontSize:9, fontFamily:'var(--ff-mono)', color:'var(--text-3)' }}>
                      {c.shared ? t('calendar.gcalProjectContactShared') : t('calendar.gcalProjectContactPending')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {active && extraInvitees.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {extraInvitees.map(inv => (
                  <div key={inv.email} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <SFIcon name={inv.shared ? 'check-circle' : 'clock'} size={11} color={inv.shared ? 'var(--ok)' : 'var(--text-3)'} />
                    <span style={{ fontSize:11, color:'var(--text-2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.email}</span>
                    <span style={{ fontSize:9, fontFamily:'var(--ff-mono)', color:'var(--text-3)' }}>
                      {inv.shared ? t('calendar.gcalProjectContactShared') : t('calendar.gcalProjectContactPending')}
                    </span>
                    <button onClick={() => handleRemoveExtraInvitee(inv.email)} disabled={busy} title={t('calendar.gcalRemoveExtraInviteeAction')}
                      style={{ background:'none', border:'none', cursor: busy ? 'not-allowed' : 'pointer', color:'var(--text-3)', display:'flex', padding:0 }}
                    >
                      <SFIcon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {active && contacts.length === 0 && extraInvitees.length === 0 && (
              <span style={{ fontSize:11, color:'var(--text-3)' }}>{t('calendar.gcalProjectNoContacts')}</span>
            )}

            {active && (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <div style={{ display:'flex', gap:6 }}>
                  <input
                    value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setEmailError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddEmail(); }}
                    placeholder={t('calendar.gcalAddEmailPlaceholder')}
                    style={{ flex:1, padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:11, fontFamily:'var(--ff-text)', outline:'none' }}
                  />
                  <button onClick={handleAddEmail} disabled={busy || !newEmail.trim()} title={t('calendar.gcalAddEmailAction')}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:7, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', cursor: (busy || !newEmail.trim()) ? 'not-allowed' : 'pointer', flexShrink:0 }}
                  >
                    <SFIcon name="plus" size={12} />
                  </button>
                </div>
                {emailError && <span style={{ fontSize:10, color:'var(--danger)' }}>{emailError}</span>}
              </div>
            )}

            {!active && (
              <span style={{ fontSize:11, color:'var(--text-3)' }}>{t('calendar.gcalProjectCreateHint')}</span>
            )}

            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {!active && (
                <button onClick={handleCreate} disabled={busy}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily:'var(--ff-text)' }}
                >
                  {busy ? '…' : t('calendar.gcalProjectCreateAction')}
                </button>
              )}

              {active && (contacts.some(c => !c.shared) || extraInvitees.some(e => !e.shared)) && (
                <button onClick={handleShare} disabled={busy}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--ok)', background:'rgba(52,201,138,0.1)', color:'var(--ok)', fontSize:11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily:'var(--ff-text)' }}
                >
                  {busy ? '…' : (clientName ? t('calendar.gcalProjectShareAction', { client: clientName }) : t('calendar.gcalProjectShareActionGeneric'))}
                </button>
              )}

              {active && (
                <button onClick={handleDeactivate} disabled={busy} title={t('calendar.gcalProjectDeactivateHint')}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--danger)', background:'transparent', color:'var(--danger)', fontSize:11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily:'var(--ff-text)' }}
                >
                  {busy ? '…' : t('calendar.gcalProjectDeactivateAction')}
                </button>
              )}
            </div>
```

- [ ] **Step 5: Type-check**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Manual verification**

This feature is invisible in demo sessions. If a real Supabase session with Google Calendar connected is available:
1. Open a project's Calendrier tab, click the calendar icon in the header.
2. If inactive, click "Ajouter à Google Calendar" to create it.
3. Type an email in the new "Ajouter un courriel…" field, click the `+` button — it should appear in the list with an "En attente" badge and a working ✕.
4. Click "Partager" — the entry's badge should flip to "Partagé" after `loadStatus()` re-fetches.
5. Click the ✕ next to the shared entry — it should disappear from the list; check the Google Calendar's own sharing settings (Google Calendar web UI) to confirm the address no longer has access.
6. Try adding a duplicate (same email, or an existing contact's email) — should show the inline error, not call the API.

If no real Supabase session is available, state this limitation explicitly rather than claiming the UI was verified live — re-read this task's diff carefully instead (per this project's established pattern in this session).

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/ProjetCalendrier.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(calendar): manage manual calendar invitees from the project calendar button"
```

---

## Final check

- [ ] Re-read the design spec (`docs/superpowers/specs/2026-08-07-calendar-extra-invitees-design.md`) section by section against the four tasks above — every goal has a task, every edge case has explicit handling in Task 2's code.
- [ ] Confirm the user has run the Task 1 migration in Supabase before considering this feature "done" — without it, Task 2's queries will fail with a missing-column error in a real session.
- [ ] Run `cd app && npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.api.json` one final time on the full branch diff.
