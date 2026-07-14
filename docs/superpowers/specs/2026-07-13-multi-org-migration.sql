-- Multi-organization support: allow a person to belong to more than one
-- organisation. Run once in the Supabase SQL editor, BEFORE any of the
-- application code in this feature is deployed — the code assumes a person
-- can have more than one studio_members row, which the database currently
-- forbids outright.

-- 0. client_contacts.studio_member_id currently has a foreign key that
--    (incorrectly, per the original design in
--    2026-07-07-branding-contacts-notifprefs-supabase-migration-design.md,
--    which intended `references studio_members(id)`) ended up pointing at
--    studio_members(user_id) instead — which is exactly the column whose
--    uniqueness this migration needs to relax, so it must be fixed first.
--    Confirmed with the user (a read-only count query) that this column is
--    entirely empty today (0 rows), so there is no data to migrate — this
--    just repoints the foreign key at the correct column before anything
--    could ever be stored against the wrong one.
alter table client_contacts drop constraint if exists client_contacts_studio_member_id_fkey;
alter table client_contacts add constraint client_contacts_studio_member_id_fkey
  foreign key (studio_member_id) references studio_members(id) on delete set null;

-- 1. Relax the uniqueness rule on studio_members: today it's unique on
--    user_id alone (confirmed by insertOwnerMembership()'s use of
--    `onConflict: 'user_id'` in studioStore.ts), which physically prevents
--    a second membership row for the same person. Replace it with a
--    composite uniqueness on (user_id, studio_id) — one row per person PER
--    organisation, not per person overall.
--
--    This looks up the existing unique constraint on user_id by its actual
--    behavior (a unique constraint covering exactly that one column) rather
--    than by a guessed name, so it works regardless of what it happens to
--    be called.
do $$
declare
  cname text;
begin
  select tc.constraint_name into cname
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
  where tc.table_name = 'studio_members'
    and tc.table_schema = 'public'
    and tc.constraint_type = 'UNIQUE'
  group by tc.constraint_name
  having count(*) = 1 and bool_or(ccu.column_name = 'user_id')
  limit 1;

  if cname is not null then
    execute format('alter table studio_members drop constraint %I', cname);
  end if;
end $$;

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
