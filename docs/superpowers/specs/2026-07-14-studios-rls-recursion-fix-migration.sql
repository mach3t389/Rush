-- Fixes a live bug found during the multi-organization feature's final
-- manual walkthrough (2026-07-14): creating a brand-new account (or a new
-- additional organisation) now fails to record the owner's membership row,
-- with the browser console showing:
--
--   insertOwnerMembership failed
--   { code: '42P17', message: 'infinite recursion detected in policy for
--     relation "studio_members"' }
--
-- Root cause: the `studios_select_member` policy added in
-- 2026-07-13-multi-org-migration.sql lets `studios` be read via a subquery
-- on `studio_members`. But `studio_members` already had a policy
-- (`members_delete_by_owner`, from 2026-07-05-team-invitations-design.md)
-- that reads `studios` via a subquery in the other direction. Postgres
-- evaluates all applicable policies together when planning a write to
-- studio_members (an insert/upsert needs to know which existing rows are
-- visible for conflict resolution) — with both policies now present, that
-- evaluation forms a cycle: check studio_members → check studios →
-- check studio_members → ... which Postgres detects and rejects outright.
-- A plain read of either table alone does NOT hit this (confirmed live:
-- select on studio_members works, select on studios works) — only a WRITE
-- to studio_members, which triggers checking the studios-side policy too,
-- forms the cycle.
--
-- Fix: replace the studios_select_member policy with one that checks
-- membership through a `security definer` helper function instead of a
-- raw subquery. A security definer function's internal query runs with the
-- function owner's privileges, not the calling role's — so it does not
-- re-trigger the caller's RLS policy evaluation on studio_members, breaking
-- the cycle. This is the standard fix for this exact class of Postgres/
-- Supabase RLS error.
--
-- MANUAL STEP REQUIRED: paste and run this whole file in the Supabase SQL
-- editor. After running it, existing accounts affected by this bug
-- self-heal automatically the next time they load the app (getStudioId()'s
-- existing legacy-owner-fallback path already retries inserting the missing
-- membership row on every load until it succeeds) — no manual data repair
-- needed.

drop policy if exists "studios_select_member" on studios;

create or replace function is_studio_member(p_studio_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from studio_members
    where studio_id = p_studio_id and user_id = auth.uid()
  );
$$;
grant execute on function is_studio_member(uuid) to authenticated;

create policy "studios_select_member" on studios for select
  using (is_studio_member(id));
