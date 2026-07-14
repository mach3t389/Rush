-- Multi-organization support: allow a person to belong to more than one
-- organisation. Run once in the Supabase SQL editor, BEFORE any of the
-- application code in this feature is deployed — the code assumes a person
-- can have more than one studio_members row, which the database currently
-- forbids outright.

-- 1. Relax the uniqueness rule on studio_members: today it's unique on
--    user_id alone (confirmed by insertOwnerMembership()'s use of
--    `onConflict: 'user_id'` in studioStore.ts), which physically prevents
--    a second membership row for the same person. Replace it with a
--    composite uniqueness on (user_id, studio_id) — one row per person PER
--    organisation, not per person overall.
--
--    IMPORTANT: the exact constraint name below (studio_members_user_id_key)
--    is Postgres's default naming for a single-column unique constraint
--    added via `unique` in a `create table` statement, which is how this
--    table was originally defined. Before running this, check it's correct:
--    in the Supabase dashboard, go to Database → Tables → studio_members →
--    scroll to "Constraints", and confirm the unique constraint on user_id
--    has this exact name. If it's different, replace it in the command
--    below before running.
alter table studio_members drop constraint if exists studio_members_user_id_key;
alter table studio_members add constraint studio_members_user_id_studio_id_key unique (user_id, studio_id);

-- 2. Let any member read their own organisation's row, not just the owner.
--    Today `studios_select_own` (2026-07-04-projects-supabase-migration)
--    only allows `owner_user_id = auth.uid()` — an invited (non-owner)
--    member's browser can't read their own organisation's name, plan, or
--    logo at all. This was already a pre-existing gap (affects
--    getStudioInfo()/planStore.ts for every non-owner real-session member
--    today), surfaced now because the organisation switcher needs every
--    member to see their orgs' names, not just owners. This ADDS a policy;
--    Postgres OR's multiple permissive policies together, so the existing
--    owner-only policy is untouched and this only ever grants MORE access.
create policy "studios_select_member" on studios for select
  using (id in (select studio_id from studio_members where user_id = auth.uid()));
