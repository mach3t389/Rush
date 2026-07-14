# Multi-organization support — design

Status: approved by user, ready for implementation planning.

## Problem

Rush currently assumes every person belongs to exactly one organisation ("studio"), for their entire account lifetime:

- `studio_members` has a unique constraint on `user_id` alone — the database physically forbids a second membership row for the same person.
- `getStudioId()` (`app/src/data/studioStore.ts`) resolves "my organisation" once per browser tab and caches it forever, via `.eq('user_id', user.id).maybeSingle()`.
- Four serverless functions (`app/api/ai-chat.ts`, `update-subscription.ts`, `create-portal-session.ts`, `create-checkout-session.ts`) independently re-derive "the caller's organisation" the same single-row way.
- The team-invitation accept flow (`TeamInvitationAccept.tsx`) always calls `register()` — creating a brand-new Supabase account — even if the person clicking the link is already logged into an existing Rush account. There is no way today for an existing user to end up in a second organisation.

In reality, a person can reasonably be the owner of one organisation and an invited member of another (e.g. a freelance editor who runs their own studio and also works inside a client's agency account). This design adds that capability.

## Goals

- A person can belong to more than one organisation.
- They can switch which organisation they're currently viewing from the sidebar.
- Joining an organisation happens only through an email invitation (no public search/join-by-code) — this was an explicit choice to keep access owner-controlled.
- The existing "create an account" flow is untouched — it always creates a new organisation. Joining is entirely handled by the invitation link becoming smarter.
- Demo sessions are unaffected — no switcher, no multi-org concept there.

## Non-goals (explicitly out of scope for this round)

- Transferring ownership of an organisation, or an owner leaving/deleting their own organisation.
- Joining without an invitation (codes, public directory, request-to-join).
- Live, no-reload switching between organisations (see Architecture below for why).
- Real-time sync between browser tabs when the organisation is switched in another tab.
- Auditing/reviewing whether per-user preference stores (pinned sidebar items, notification prefs, favorite templates) leak or behave oddly across organisations — flagged as a known limitation to watch for, not solved here.

## Data model changes (manual Supabase migration, like all others in this project)

1. **Relax the uniqueness rule on `studio_members`**: replace the existing unique constraint on `user_id` alone with a composite unique constraint on `(user_id, studio_id)`. This is what currently prevents a second membership row for the same person from ever being inserted.
2. Update the two places that upsert/insert into `studio_members` assuming the old single-column uniqueness:
   - `insertOwnerMembership()` in `studioStore.ts` — its `.upsert(..., { onConflict: 'user_id' })` must become `{ onConflict: 'user_id,studio_id' }`.
   - `accept_studio_invitation()` (SQL function, in `2026-07-12-profile-permissions-supabase-migration.sql`) — currently a plain `insert`, which would violate the old constraint for a person already in another organisation. No code change needed to the function itself once the constraint is relaxed, but this is the exact reason the migration is required before the rest of this feature can work.

## Client-side: tracking and switching the "active" organisation

`getStudioId()` today returns a single deterministic answer per user. It becomes instead: "the organisation the user last chose to view, or a sensible default."

- The active organisation id is remembered in `localStorage` (same pattern as other local prefs in this app), keyed so it doesn't collide across different logged-in accounts on the same browser.
- On load, `getStudioId()`:
  1. Reads the remembered active studio id from localStorage.
  2. Verifies the current user actually has a `studio_members` row for that studio id (guards against a stale value pointing to an organisation they've since left or been removed from).
  3. If there's no remembered value, or it's no longer valid, falls back to the **oldest membership row** (`created_at` ascending) — in practice, for anyone who hasn't joined a second organisation yet, this is simply their one and only organisation, so today's behavior is unchanged for every existing user.
- **Switching organisations reloads the page** (e.g. `window.location.href = '/'`), rather than trying to live-invalidate in-memory state. Roughly 19 different data stores (`projectStore`, `clientStore`, `taskStore`, `eventStore`, etc.) each resolve and cache their studio-scoped data once per tab session. Live-swapping all of them correctly, without reintroducing the kind of stale-cache bug this codebase has already hit more than once, is high-risk for low benefit — a full reload is simple, correct by construction, and matches how comparable multi-workspace apps (Slack, Notion) behave. The one-time reload flash is an acceptable trade-off.
- Switching always navigates to `/` (the dashboard) of the new organisation — never tries to "stay on the same page," since whatever project/client/resource was on screen almost certainly doesn't exist in the new organisation.
- The organisation switcher UI does not render at all for demo sessions (`isDemoSession()`).

## Zero-organisation state

An admin can already remove a member from an organisation today (`removeMember` in `teamStore.ts`); combined with the new self-service "leave" action below, a person can end up belonging to zero organisations. There is currently no screen for this — the app has never had to handle it, since every existing user has exactly one organisation. Add a simple dedicated screen for this case: "You don't belong to an organisation yet — create one, or ask someone to invite you." (Reuses existing register-a-new-organisation UI for the "create one" path.)

## Sidebar organisation switcher

- The current organisation's name appears at the top of the sidebar (where the logo/brand area is), clickable.
- Opens a small menu listing: every organisation the user belongs to (name + their role in it), a "Créer une organisation" action at the bottom.
- Selecting a different organisation writes it to localStorage as the active studio id, then reloads (see above).
- "Créer une organisation" reuses the existing account-registration organisation-creation logic, but for an already-logged-in user (creates a new `studios` row + owner membership for the current user, then reloads into it) rather than the full sign-up form.

## Invitation accept flow (`TeamInvitationAccept.tsx`)

Today this screen unconditionally shows a "create your password" form and calls `register()`. It becomes:

1. On load, check whether there's already an active Supabase session (`supabase.auth.getUser()`).
2. **Already logged in:**
   - If the logged-in account's email matches the invitation's target email, show a simple confirmation ("Rejoindre {organisation} en tant que {rôle} ?") with one button that calls `accept_studio_invitation` directly (no registration) and then reloads into the new organisation.
   - If the logged-in account's email does **not** match, show an explicit error ("Cette invitation est pour {email} — vous êtes connecté en tant que {autre email}.") with a "Se déconnecter" option, rather than silently letting the wrong account join. This is the security check flagged during design — without it, someone could accept an invite meant for a different person just by having any active session.
3. **Not logged in:** show two options — "J'ai déjà un compte" (a login form; on success, proceed as in step 2) or "Créer un compte" (today's existing form, unchanged, still restricted to the invitation's target email).

## Server-side changes

The four serverless functions that currently resolve "the caller's organisation" from `user_id` alone (assuming exactly one row) must instead:
- Accept an explicit `studioId` in the request body (the client always knows and sends the currently-active organisation).
- Verify the caller actually has a `studio_members` row for that `studioId` (same membership check already used in `update-subscription.ts` today — this becomes the norm for all four instead of being special-cased there) — reject with 403 if not.

This is a small, mechanical change to each of the four files; no new endpoints are needed.

## Leave-organisation (self-service)

Add a "Quitter cette organisation" button in Paramètres, visible to any member who is **not** the organisation's owner. Deletes their own `studio_members` row for the active organisation, then:
- If they have another organisation, switch to it (reload).
- If not, show the zero-organisation screen.

Owners cannot leave (no ownership-transfer flow exists yet) — the button is simply not shown to them.

## Testing / verification approach

No automated test suite exists in this project (per CLAUDE.md — verification is manual via the dev server). Verification for this feature means, in the real (non-demo) app:
1. Create two organisations under two different accounts.
2. Invite the second account's email into the first organisation; confirm the "already logged in" and "not logged in, log in" and "not logged in, register" paths all correctly end with one person having two organisations.
3. Confirm the sidebar switcher lists both, switching reloads into the correct one, and each organisation's data (projects/clients/plan/AI quota) is fully isolated from the other.
4. Confirm demo sessions show no switcher.
5. Confirm leaving an organisation removes access and correctly falls back (to the other organisation, or to the zero-organisation screen if it was the only one).
6. Confirm the mismatched-email invitation case shows the error rather than joining.
