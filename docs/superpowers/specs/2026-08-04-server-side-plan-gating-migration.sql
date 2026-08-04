-- ============================================================
-- Server-side plan gating — 2026-08-04
-- Run this entire file once in Supabase → SQL Editor.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- 0. OPTIONAL PRE-FLIGHT (read-only, run first, review the output):
--    confirms no studio already holds a plan value outside the 3 allowed
--    (the constraint in step 1 would otherwise fail to apply) and flags
--    any studio with a null billing_seats (step 5 treats that as the
--    documented Gratuit default of 2, not a hard lock — but worth
--    knowing about beforehand).
-- select plan, count(*) from studios group by plan;
-- select id, name from studios where billing_seats is null;

-- 1. Hardening: studios.plan can only ever be one of the 3 real values.
alter table studios drop constraint if exists studios_plan_valid;
alter table studios add constraint studios_plan_valid
  check (plan is not null and plan in ('gratuit', 'studio', 'agence'));

-- 2. Finances — block create/edit of invoices, payment methods, and
--    invoice defaults for Gratuit studios. SELECT/DELETE unaffected
--    (existing data stays visible/removable after a downgrade).
--    `for all` with no `using` clause only constrains INSERT and the
--    post-image of UPDATE (via `with check`) — SELECT/DELETE, and which
--    rows an UPDATE may target, still come entirely from the existing
--    permissive policy's `using` clause.
--    `invoice_defaults` is written via upsert (INSERT ... ON CONFLICT DO
--    UPDATE), so it needs both INSERT and UPDATE covered — `for all` does.
drop policy if exists "block_gratuit_writes_invoices" on invoices;
create policy "block_gratuit_writes_invoices" on invoices
  as restrictive
  for all
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

drop policy if exists "block_gratuit_writes_payment_methods" on payment_methods;
create policy "block_gratuit_writes_payment_methods" on payment_methods
  as restrictive
  for all
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

drop policy if exists "block_gratuit_writes_invoice_defaults" on invoice_defaults;
create policy "block_gratuit_writes_invoice_defaults" on invoice_defaults
  as restrictive
  for all
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

-- 3. Custom templates — block creating/editing a new custom template for
--    Gratuit studios. Existing saved templates stay visible/deletable.
drop policy if exists "block_gratuit_writes_custom_project_templates" on custom_project_templates;
create policy "block_gratuit_writes_custom_project_templates" on custom_project_templates
  as restrictive
  for all
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

drop policy if exists "block_gratuit_writes_custom_form_templates" on custom_form_templates;
create policy "block_gratuit_writes_custom_form_templates" on custom_form_templates
  as restrictive
  for all
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

drop policy if exists "block_gratuit_writes_custom_resource_templates" on custom_resource_templates;
create policy "block_gratuit_writes_custom_resource_templates" on custom_resource_templates
  as restrictive
  for all
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

-- 4. Projects — Gratuit studios capped at 3 *active* (non-archived)
--    projects, matching canCreateNewProject() in
--    app/src/data/upgradePromptStore.ts:48-56. Unlimited on paid plans.
--
--    A policy on `projects` cannot itself run a plain subquery against
--    `projects` — Postgres raises "infinite recursion detected in policy
--    for relation" because the inner SELECT re-triggers the same RLS
--    policy. A SECURITY DEFINER function bypasses RLS for its own body,
--    same trick as the existing my_studio_ids() helper. It also excludes
--    the row being written (exclude_id) from the count, so editing or
--    archiving an *existing* project never miscounts itself as "one too
--    many" (an UPDATE without this would incorrectly block e.g. renaming
--    project #3 on a studio already at exactly 3 active projects).
create or replace function count_other_active_projects(p_studio_id uuid, p_exclude_id uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::integer
  from public.projects
  where studio_id = p_studio_id
    and archived is not true
    and id <> p_exclude_id;
$$;

grant execute on function count_other_active_projects(uuid, uuid) to authenticated;

drop policy if exists "block_gratuit_project_overlimit" on projects;
create policy "block_gratuit_project_overlimit" on projects
  as restrictive
  for all
  with check (
    exists (select 1 from studios s where s.id = projects.studio_id and s.plan <> 'gratuit')
    or count_other_active_projects(projects.studio_id, projects.id) < 3
  );

-- 5. Team seats — capped at studios.billing_seats (already the single
--    source of truth: defaults to 2, only ever written by service_role
--    via the Stripe webhook / admin tool / downgrade reset — see
--    app/api/stripe-webhook.ts and app/api/update-subscription.ts:81).
--    This one condition correctly covers both Gratuit (billing_seats=2)
--    and any paid tier (however many seats were purchased).
--
--    Same recursion + self-row-exclusion fix as Task 4's helper, applied
--    to studio_members (excluding by its own `id` column — NOT `user_id`,
--    which is a different column, see studio_members(user_id, studio_id)
--    uniqueness in 2026-07-13-multi-org-migration.sql). billing_seats is
--    coalesced to 2 (the documented Gratuit default) if it's ever null,
--    so a data gap fails safe to the same limit a real Gratuit studio has
--    instead of silently locking every studio whose seats column is null.
create or replace function count_other_studio_members(p_studio_id uuid, p_exclude_id uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::integer
  from public.studio_members
  where studio_id = p_studio_id
    and id <> p_exclude_id;
$$;

grant execute on function count_other_studio_members(uuid, uuid) to authenticated;

drop policy if exists "block_seat_overlimit" on studio_members;
create policy "block_seat_overlimit" on studio_members
  as restrictive
  for all
  with check (
    count_other_studio_members(studio_members.studio_id, studio_members.id) < (
      select coalesce(billing_seats, 2) from studios s
      where s.id = studio_members.studio_id
    )
  );

-- 6. Custom logo — freeze logo_full/logo_square changes for Gratuit
--    studios. Never deletes an existing logo; a write attempt while
--    Gratuit is silently ignored (keeps the old value) rather than
--    erroring, since a real user should never hit this (the UI already
--    blocks it) — this is a backstop, not a user-facing error path.
--    Gates on OLD.plan (the studio's plan before this write) rather than
--    NEW.plan, so a hypothetical future update that changes plan and logo
--    in the same statement is judged by what the studio was entitled to
--    a moment ago, not by the value it's transitioning to.
create or replace function freeze_studio_logo_on_gratuit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.plan = 'gratuit' then
    if new.logo_full is distinct from old.logo_full then
      new.logo_full := old.logo_full;
    end if;
    if new.logo_square is distinct from old.logo_square then
      new.logo_square := old.logo_square;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists freeze_studio_logo_on_gratuit_trigger on studios;
create trigger freeze_studio_logo_on_gratuit_trigger
  before update on studios
  for each row
  execute function freeze_studio_logo_on_gratuit();
