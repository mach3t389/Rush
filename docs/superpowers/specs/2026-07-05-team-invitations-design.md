# Team Invitations → Supabase — Design Spec

**Status:** approved for planning
**Depends on:** Phase 2 chantiers 1–4 — Projects, Clients, Tasks, Mes tâches migrated to Supabase (all merged to `master`). Reuses `studioStore.ts`'s `getStudioId()`/`resetStudioIdCache()`, `authStore.ts`'s `isDemoSession()`/`onLogout()` registry.

## Problem

There is currently no real concept of "who belongs to a studio" beyond its single owner. Three pieces of UI gesture at team membership without any of them being connected or real:

- **`MonEquipe.tsx`** (Paramètres → Mon équipe): "Inviter" button is fully decorative — it shows a fake "Envoyé !" success state after a `setTimeout`, creates nothing. The team list is always the 5 hardcoded demo users (`USERS` from `mock.ts`).
- **`ProjectMembres.tsx`** (per-project members): lets you add people to a project, but only from the same hardcoded 5-person pool (plus client contacts), and stores the result in a plain in-memory object (`projectMembersStore`) that isn't even `localStorage`-persisted — **a pre-existing bug**, changes here vanish on reload regardless of demo or real session.
- **`invitationStore.ts`**: a real, working, persisted invitation system — but for **client portal contacts** (`/invitation/:token`), an entirely different concept from studio team members. Not reused directly, but its token-lifecycle pattern (`pending` → `accepted`/`declined`) is the template this spec follows.

`Travail.tsx`'s `getTeam()` (added in the Mes tâches chantier) already has the seam for "assignable people" — for real sessions it currently returns only `[authUser]` because there is no one else to return. This chantier is what makes that list grow.

## Scope decision

This is one coherent chantier, not decomposed further: studio membership, the invite/accept flow, and project/task assignment are tightly coupled — a real invited member with no way to be assigned to anything would leave the feature useless. Comparable in size to the original Supabase Auth chantier (Phase 1).

**Explicitly out of scope for this chantier** (documented as the next step below instead of built now): automatic email delivery of the invitation. **V1 ships a copy-paste link**, the same interaction model already proven for client invitations — the studio owner generates a unique link and sends it themselves through whatever channel they want (email, Slack, text). No email-sending infrastructure exists in this app today (it's a pure SPA + Supabase, no application server), so automatic delivery is a separate, later investment (see **Future Work** below).

## Data model

Two tables, mirroring the existing separation between an invitation's lifecycle and actual membership (the same split `invitationStore.ts` already makes between `ClientInvitation` and the real client-team roster):

```sql
create table if not exists studio_invitations (
  token text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  email text not null,
  role text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now()
);
alter table studio_invitations enable row level security;

-- Only the studio owner can see/manage their own invitations directly.
create policy "invitations_select_own" on studio_invitations for select
  using (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "invitations_insert_own" on studio_invitations for insert
  with check (studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "invitations_delete_own" on studio_invitations for delete
  using (studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, delete on studio_invitations to authenticated;

create table if not exists studio_members (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null,
  initials text not null,
  avatar_color text not null,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);
alter table studio_members enable row level security;

-- Any member of a studio can see the rest of its roster.
create policy "members_select_same_studio" on studio_members for select
  using (studio_id in (select studio_id from studio_members where user_id = auth.uid()));
-- Only the owner can remove a member (never themselves — enforced in application code).
create policy "members_delete_by_owner" on studio_members for delete
  using (studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, delete on studio_members to authenticated;
-- Deliberately no insert/update grant: rows are only ever created by the
-- security-definer functions below, running with elevated privilege.
```

`studio_members.user_id` is `unique` — **a real user belongs to exactly one studio**, whether as owner or invited member. Simpler than multi-studio membership, and nothing in the app today needs a person to belong to two studios at once (YAGNI).

### Why two Postgres functions instead of plain table access

An invited person doesn't have an account yet when they first open the invite link — they're unauthenticated. Two requirements collide with plain RLS:

1. They need to look up the invitation **by token** to see "You're invited to join Atelier Bleu" before signing up — but `studio_invitations` must not be broadly readable, or any anonymous visitor could enumerate every pending invitation's email address and studio.
2. The moment their account is created, their `studio_members` row must be inserted **before** anything else in the app runs — otherwise `getStudioId()`'s existing "no studio yet → create one" fallback would silently make them the owner of a brand-new, empty studio instead of joining yours.

Both are solved with two `security definer` Postgres functions — small, auditable pieces of server-side logic that run with elevated rights but only do exactly what they're told, the same way `RPC`s are used in every mainstream multi-tenant app for "join via invite link" flows (Notion, Linear, etc. all work this way under the hood):

```sql
create or replace function get_studio_invitation(p_token text)
returns table (email text, role text, studio_name text, status text)
language sql security definer as $$
  select si.email, si.role, s.name, si.status
  from studio_invitations si
  join studios s on s.id = si.studio_id
  where si.token = p_token;
$$;
grant execute on function get_studio_invitation(text) to anon, authenticated;

create or replace function accept_studio_invitation(p_token text)
returns void
language plpgsql security definer as $$
declare
  inv studio_invitations%rowtype;
  u auth.users%rowtype;
begin
  select * into inv from studio_invitations where token = p_token and status = 'pending';
  if not found then
    raise exception 'invalid_or_used_invitation';
  end if;

  select * into u from auth.users where id = auth.uid();

  insert into studio_members (studio_id, user_id, name, email, role, initials, avatar_color, is_owner)
  values (
    inv.studio_id,
    auth.uid(),
    coalesce(u.raw_user_meta_data->>'full_name', inv.email),
    inv.email,
    inv.role,
    upper(left(coalesce(u.raw_user_meta_data->>'full_name', inv.email), 2)),
    '#5c3d8f',
    false
  );

  update studio_invitations set status = 'accepted' where token = p_token;
end;
$$;
grant execute on function accept_studio_invitation(text) to authenticated;
```

`get_studio_invitation` returns only the single matched row's public-facing fields (never the whole table) — safe for `anon`. `accept_studio_invitation` requires an authenticated caller (`auth.uid()` must be non-null) and does the lookup, insert, and status update as one atomic unit, so there's no window where the client could crash between "account created" and "membership recorded."

### `studios` row also gets an owner membership row

When `getStudioId()` creates a brand-new studio (existing code, `studioStore.ts`), it now also inserts a `studio_members` row for the owner (`is_owner: true`) in the same call, so the owner shows up in their own team roster exactly like any invited member — no special-casing needed anywhere else in the app.

## New file: `teamStore.ts`

Same demo/real branching and "stay-sync-via-cache" pattern as `projectStore.ts`/`clientStore.ts`:

- `getTeamMembers(): User[]` — sync getter. Demo → `Object.values(USERS)` (existing 5-person cast, unchanged). Real → in-memory cache populated by a background fetch of `studio_members` for the current studio, empty array until the fetch resolves.
- `subscribeTeam(fn): () => void`.
- `createInvitation(email: string, role: string): Promise<{ token: string; link: string }>` — demo sessions: no-op that still returns a fake link for UI parity in the demo (so the existing "Envoyé !" UX keeps working for the 3 demo accounts), matching how other stores treat demo writes as accepted-but-inert. Real sessions: inserts into `studio_invitations`, returns `${window.location.origin}/invitation-equipe/${token}`.
- `getInvitationByToken(token: string): Promise<{ email: string; role: string; studioName: string; status: string } | null>` — calls `get_studio_invitation` RPC.
- `acceptInvitation(token: string): Promise<void>` — calls `accept_studio_invitation` RPC. Must be called immediately after the invited user's Supabase account is confirmed and before any other store touches `getStudioId()`.
- `removeMember(userId: string): Promise<void>` — real only; refuses (no-op + `console.warn`) if `userId` belongs to the owner, mirroring the existing "can't remove yourself" guard already drawn in `ProjectMembres.tsx`'s UI (`isOwner` check).
- `resetTeamCache()`, registered via `onLogout()` from the start.

## New route: team invitation accept page

New screen `TeamInvitationAccept.tsx`, new route `/invitation-equipe/:token`, standalone (no `AppShell`), following the shape of the existing client `InvitationAccept.tsx`:

1. On mount, calls `getInvitationByToken(token)`.
   - Not found / already accepted → "Ce lien d'invitation n'est plus valide" state, link back to `/login`.
   - Found + pending → shows "Vous êtes invité(e) à rejoindre **{studioName}**" with a signup form (name, email pre-filled and locked from the invitation, password).
2. On submit: calls `register()` (existing `authStore.ts` function) with the invitation's email — then, in the same flow, calls `acceptInvitation(token)` **before** navigating anywhere else in the app.
3. Redirects to `/` on success, already a member of the inviting studio.

If Supabase's "Confirm email" setting is enabled on this project (it was disabled earlier for dev per an existing note), signup here follows the same confirmation path as normal registration — `acceptInvitation` still runs right after the account exists, since `auth.uid()` is available as soon as the session is established, matching how `register()` already works today for normal signups.

## Wiring up existing screens

- **`MonEquipe.tsx`**: `INTERNAL_TEAM` (hardcoded from `USERS`) replaced by `teamStore.getTeamMembers()` for real sessions (demo unchanged). `InviteTeamModal`'s `submit()` calls `createInvitation(email, role)` for real, and surfaces the generated link with a "Copier le lien" button instead of just showing "Envoyé !" — the studio owner needs to actually get the link to send it. Demo sessions keep today's simple "Envoyé !" confirmation (no link to copy, since there's nowhere real for it to go).
- **`ProjectMembres.tsx`**: two independent fixes bundled here since they touch the same lines —
  1. **Persistence bug fix (both demo and real):** `handleAdd`/`handleRemove`/`handleRemoveSelected` now call the existing `updateProject(projectId, { members })` (from `projectStore.ts`) instead of writing to the throwaway `projectMembersStore` object, so membership changes survive reload for every account type.
  2. **Real member pool:** `AddMemberModal`'s `internalPool` sources from `teamStore.getTeamMembers()` for real sessions instead of `Object.values(USERS)` (demo unchanged, client-contact pool unchanged).
- **`Travail.tsx`** (`getTeam()`) / **`Taches.tsx`** (assignee default): swap the real-session branch from `[authUser]-only` to `teamStore.getTeamMembers()`, keeping the existing `USERS.lea` fallback for the just-logged-in timing window (same reasoning as the fix already made in the Mes tâches chantier). Both files already subscribe-and-rerender for other stores — add a `subscribeTeam()` call alongside so the assignee picker updates once the roster fetch resolves.

## Error handling

- Expired/already-accepted/garbage token → handled entirely by `get_studio_invitation` returning no row; the accept page shows a plain "invalid link" state, no crash path.
- Double-submit on the accept form (impatient double-click) → `accept_studio_invitation` is naturally idempotent-safe against this because the second call's `select ... where status = 'pending'` will no longer match after the first call updates status to `'accepted'`, and raises `invalid_or_used_invitation` — caught and shown as "this invitation was already used," not a silent duplicate row (the `unique` constraint on `user_id` would reject a duplicate insert anyway as a second line of defense).
- Removing a member who owns tasks/project assignments elsewhere: out of scope to auto-reassign — matches the existing app-wide behavior of not cascading task reassignment on removal (`ProjectMembres.tsx` already just drops them from the `members` list today).

## Explicitly out of scope

- Automatic email delivery (see Future Work).
- Multi-studio membership per user.
- Per-member granular permission enforcement anywhere in the backend — the `role` field and the existing `PERMISSION_PRESETS` UI remain a label/decoration exactly as today (nothing in the current app enforces them server-side either; extending that is a separate, later chantier if ever needed).
- Re-inviting an email whose invitation already exists and is pending: `createInvitation` does not need dedupe logic for V1 (unlike `invitationStore.ts`'s client-invite `createInvitation`, which reuses a pending invite) — acceptable because the team-invite modal is a deliberate one-at-a-time action by the owner, not a repeatedly-triggered background flow.

## Future Work: automatic email delivery

Documented here so the next chantier doesn't have to rediscover the reasoning:

1. Add a transactional email provider (e.g., Resend or Postmark) — needs an account and an API key.
2. Add a Supabase **Edge Function** (small server-side script Supabase hosts for you) that `createInvitation` calls right after inserting the `studio_invitations` row, passing the email/link/studio name. The Edge Function holds the email provider's secret key (never exposed to the browser) and sends the message.
3. `MonEquipe.tsx`'s UI would change from "copy this link" to "email sent to {address}," with a "Copier le lien" option kept as a fallback.
4. No changes needed to the `studio_invitations` table or the accept flow — this is purely additive on top of what this chantier builds.

## Testing

Same shape as every prior chantier: typecheck, lint, manual E2E. Specifically exercise:
- Real signup → invite a second email address from Mon équipe → copy the generated link.
- Open the link in a fresh session (e.g., a private browser window) → confirm invitation details display → complete signup → confirm landing in the *inviting* studio (not a new empty one) — this is the critical check for the `getStudioId()` race described above.
- Confirm the new member appears in Mon équipe for the inviting owner (roster re-fetch / subscription).
- Assign the new member to a project via Membres, then assign them a task in that project; reload and confirm both persisted.
- Remove the member from a project (not the studio) → confirm `updateProject` persistence fix holds for this and for the pre-existing demo-account flow.
- Re-open an already-accepted invitation link → confirm the "no longer valid" state, not a crash or a duplicate signup.
- Demo accounts (Léa/Sarah/Thomas) completely unaffected — Mon équipe still shows the 5 demo people, "Inviter" still shows the harmless "Envoyé !" confirmation with no real link.
