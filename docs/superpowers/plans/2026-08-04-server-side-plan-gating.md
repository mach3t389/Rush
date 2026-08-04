# Server-side plan gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Postgres RLS backstop so Finances, custom templates, project count, and team seat count are enforced by the database itself, not only by the React client — and freeze (never delete) the custom logo columns for a downgraded studio.

**Architecture:** One SQL migration file, run manually by the user in Supabase → SQL Editor (this repo has no automated migration runner — see `CLAUDE.md`'s "Migrations Supabase" section). No application code changes. Six independently-reviewable SQL blocks, each targeting one table group.

**Tech Stack:** PostgreSQL (Supabase), plain SQL — no ORM, no client code involved.

## Global Constraints

- Never touch `USING` clauses on existing policies — SELECT/DELETE must keep working exactly as today for every plan tier (never destroy or hide a downgraded studio's existing data).
- Refinement vs. the design doc (`docs/superpowers/specs/2026-08-04-server-side-plan-gating-design.md`): instead of altering each table's existing permissive `WITH CHECK` clause directly (which requires knowing its exact current text and risks a typo silently breaking legitimate paid-plan writes), every task below adds a **new, additive `RESTRICTIVE` policy** scoped to `INSERT, UPDATE` only. In Postgres RLS, multiple `PERMISSIVE` policies for the same command are OR'd together, but a `RESTRICTIVE` policy is AND'd on top of them — so this achieves the exact same effect (an extra mandatory condition) without touching, naming, or risking the existing policy at all. This is strictly safer and is the only change from the approved design; the *behavior* described there (SELECT/DELETE untouched, INSERT/UPDATE gated) is identical.
- Every SQL block must be idempotent-safe to hand to the user: use `drop policy if exists "<name>" on <table>;` before each `create policy`, so re-running the same file twice (e.g. after a typo fix) never errors with "policy already exists".
- Exact plan values: `'gratuit' | 'studio' | 'agence'` (`app/src/data/planFeatures.ts:8`).

---

### Task 1: `studios.plan` CHECK constraint

**Files:**
- Create: `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql` (this task starts the file)

**Interfaces:**
- Produces: nothing consumed by later tasks — this is a standalone hardening constraint.

- [ ] **Step 1: Write the SQL block**

```sql
-- ============================================================
-- Server-side plan gating — 2026-08-04
-- Run this entire file once in Supabase → SQL Editor.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- 1. Hardening: studios.plan can only ever be one of the 3 real values.
alter table studios drop constraint if exists studios_plan_valid;
alter table studios add constraint studios_plan_valid
  check (plan in ('gratuit', 'studio', 'agence'));
```

- [ ] **Step 2: Verify (manual, in Supabase SQL Editor)**

Run this in a second query tab, after pasting Step 1's block into the first and running it:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'studios'::regclass and conname = 'studios_plan_valid';
```

Expected: one row, `pg_get_constraintdef` showing `CHECK ((plan = ANY (ARRAY['gratuit'::text, 'studio'::text, 'agence'::text])))`.

- [ ] **Step 3: Commit the migration file (partial, will grow in later tasks — commit once at the end, see Task 7)**

No commit yet — this file accumulates through Task 6, committed once in Task 7.

---

### Task 2: Finance tables — `invoices`, `payment_methods`, `invoice_defaults`

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql` (append)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append the SQL block**

```sql
-- 2. Finances — block create/edit of invoices, payment methods, and
--    invoice defaults for Gratuit studios. SELECT/DELETE unaffected
--    (existing data stays visible/removable after a downgrade).
drop policy if exists "block_gratuit_writes_invoices" on invoices;
create policy "block_gratuit_writes_invoices" on invoices
  as restrictive
  for insert, update
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

drop policy if exists "block_gratuit_writes_payment_methods" on payment_methods;
create policy "block_gratuit_writes_payment_methods" on payment_methods
  as restrictive
  for insert, update
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

drop policy if exists "block_gratuit_writes_invoice_defaults" on invoice_defaults;
create policy "block_gratuit_writes_invoice_defaults" on invoice_defaults
  as restrictive
  for insert, update
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );
```

- [ ] **Step 2: Verify (manual, in Supabase SQL Editor)**

```sql
select tablename, policyname, permissive, cmd
from pg_policies
where tablename in ('invoices', 'payment_methods', 'invoice_defaults')
order by tablename, policyname;
```

Expected: for each of the 3 tables, two rows — the original permissive `for all` (`permissive = PERMISSIVE`, `cmd = ALL`) policy plus the new one (`permissive = RESTRICTIVE`, `cmd = INSERT` — Postgres lists a multi-command policy as separate rows per command in some client views, or a single row with `cmd` combining both depending on your Supabase dashboard version; either way both `block_gratuit_writes_*` rows must show `permissive = RESTRICTIVE`).

---

### Task 3: Custom template tables — `custom_project_templates`, `custom_form_templates`, `custom_resource_templates`

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append the SQL block**

```sql
-- 3. Custom templates — block creating/editing a new custom template for
--    Gratuit studios. Existing saved templates stay visible/deletable.
drop policy if exists "block_gratuit_writes_custom_project_templates" on custom_project_templates;
create policy "block_gratuit_writes_custom_project_templates" on custom_project_templates
  as restrictive
  for insert, update
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

drop policy if exists "block_gratuit_writes_custom_form_templates" on custom_form_templates;
create policy "block_gratuit_writes_custom_form_templates" on custom_form_templates
  as restrictive
  for insert, update
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );

drop policy if exists "block_gratuit_writes_custom_resource_templates" on custom_resource_templates;
create policy "block_gratuit_writes_custom_resource_templates" on custom_resource_templates
  as restrictive
  for insert, update
  with check (
    studio_id in (select id from studios where plan <> 'gratuit')
  );
```

- [ ] **Step 2: Verify (manual, in Supabase SQL Editor)**

```sql
select tablename, policyname, permissive
from pg_policies
where tablename in ('custom_project_templates', 'custom_form_templates', 'custom_resource_templates')
order by tablename, policyname;
```

Expected: each table shows a `block_gratuit_writes_*` row with `permissive = RESTRICTIVE`, alongside its original policy.

---

### Task 4: `projects` — active-project count limit

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append the SQL block**

```sql
-- 4. Projects — Gratuit studios capped at 3 *active* (non-archived)
--    projects, matching canCreateNewProject() in
--    app/src/data/upgradePromptStore.ts:48-56. Unlimited on paid plans.
drop policy if exists "block_gratuit_project_overlimit" on projects;
create policy "block_gratuit_project_overlimit" on projects
  as restrictive
  for insert, update
  with check (
    exists (select 1 from studios s where s.id = projects.studio_id and s.plan <> 'gratuit')
    or (
      select count(*) from projects p2
      where p2.studio_id = projects.studio_id and p2.archived = false
    ) < 3
  );
```

- [ ] **Step 2: Verify (manual, in Supabase SQL Editor)**

```sql
select policyname, permissive, cmd
from pg_policies
where tablename = 'projects' and policyname = 'block_gratuit_project_overlimit';
```

Expected: one row, `permissive = RESTRICTIVE`.

- [ ] **Step 3: Sanity-check the count logic against a real studio (read-only, safe)**

```sql
select s.id, s.name, s.plan,
  (select count(*) from projects p where p.studio_id = s.id and p.archived = false) as active_projects
from studios s
where s.plan = 'gratuit'
order by active_projects desc
limit 10;
```

Confirm no Gratuit studio already shows more than 3 active projects (if one does, the new policy won't retroactively remove any — it only blocks *future* inserts/updates — but flag it, it means that studio is already over the client-side limit and worth investigating separately).

---

### Task 5: `studio_members` — seat count limit

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append the SQL block**

```sql
-- 5. Team seats — capped at studios.billing_seats (already the single
--    source of truth: defaults to 2, only ever written by service_role
--    via the Stripe webhook / admin tool / downgrade reset — see
--    app/api/stripe-webhook.ts and app/api/update-subscription.ts:81).
--    This one condition correctly covers both Gratuit (billing_seats=2)
--    and any paid tier (however many seats were purchased).
drop policy if exists "block_seat_overlimit" on studio_members;
create policy "block_seat_overlimit" on studio_members
  as restrictive
  for insert, update
  with check (
    (
      select count(*) from studio_members m
      where m.studio_id = studio_members.studio_id
    ) < (
      select billing_seats from studios s
      where s.id = studio_members.studio_id
    )
  );
```

- [ ] **Step 2: Verify (manual, in Supabase SQL Editor)**

```sql
select policyname, permissive, cmd
from pg_policies
where tablename = 'studio_members' and policyname = 'block_seat_overlimit';
```

Expected: one row, `permissive = RESTRICTIVE`.

- [ ] **Step 3: Sanity-check against real data (read-only, safe)**

```sql
select s.id, s.name, s.plan, s.billing_seats,
  (select count(*) from studio_members m where m.studio_id = s.id) as current_members
from studios s
order by current_members desc
limit 10;
```

Confirm no studio already has `current_members >= billing_seats` (same caveat as Task 4 — the policy only blocks future inserts, doesn't remove existing over-limit members).

---

### Task 6: `studios` logo columns — freeze on downgrade

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append the SQL block**

RLS `WITH CHECK` can't express "these two specific columns didn't change" (it only sees the whole candidate row) — a `BEFORE UPDATE` trigger comparing `OLD`/`NEW` is the correct Postgres mechanism for column-level write restriction on a table members can otherwise freely edit (name, sector, website, address, etc.). On a blocked attempt, this silently keeps the old logo instead of erroring — a bypassed write shouldn't hard-crash the client, it should just no-op the logo part, exactly matching the "never delete, only freeze" behavior already implemented client-side in `Sidebar.tsx`.

```sql
-- 6. Custom logo — freeze logo_full/logo_square changes for Gratuit
--    studios. Never deletes an existing logo; a write attempt while
--    Gratuit is silently ignored (keeps the old value) rather than
--    erroring, since a real user should never hit this (the UI already
--    blocks it) — this is a backstop, not a user-facing error path.
create or replace function freeze_studio_logo_on_gratuit()
returns trigger
language plpgsql
as $$
begin
  if new.plan = 'gratuit' then
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
```

- [ ] **Step 2: Verify (manual, in Supabase SQL Editor)**

```sql
select tgname, tgrelid::regclass, tgenabled
from pg_trigger
where tgname = 'freeze_studio_logo_on_gratuit_trigger';
```

Expected: one row, `tgrelid` = `studios`, `tgenabled = 'O'` (enabled).

- [ ] **Step 3: Functional test (manual, in Supabase SQL Editor — safe, uses a transaction that's rolled back)**

Pick any real Gratuit-plan studio id from Task 4's query output and substitute it below (replace `'PASTE-A-GRATUIT-STUDIO-ID-HERE'`):

```sql
begin;
  update studios set logo_full = 'data:image/png;base64,TEST'
  where id = 'PASTE-A-GRATUIT-STUDIO-ID-HERE';

  select logo_full from studios where id = 'PASTE-A-GRATUIT-STUDIO-ID-HERE';
  -- Expected: logo_full is UNCHANGED (still the old value, not 'data:image/png;base64,TEST')
rollback;
```

The `rollback` at the end guarantees this test makes zero permanent changes regardless of outcome.

---

### Task 7: Finalize — commit migration file, update manual test checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql` (final file, already fully written by Tasks 1–6)
- Modify: `docs/tests-manuels.md`

**Interfaces:**
- Consumes: the complete SQL file from Tasks 1–6.
- Produces: nothing (terminal task).

- [ ] **Step 1: Append a checklist entry to `docs/tests-manuels.md`**

Add this section (mirrors the existing style in that file):

```markdown
## Server-side plan gating (RLS backstop)

- [ ] **Exécuter la migration** : coller et lancer `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql` dans Supabase → SQL Editor, confirmer aucune erreur.
- [ ] **Spot-check normal (plan Gratuit)** : dans l'app, avec un studio réel en plan Gratuit, confirmer qu'un essai de création de facture/modèle/4e projet/3e membre échoue toujours exactement comme avant (l'interface bloque avant même d'atteindre la base) — prouve que la nouvelle règle n'a rien cassé pour un usage normal.
- [ ] **Spot-check plan payant** : avec un studio réel en plan Studio/Agence, confirmer que créer une facture, un modèle, un projet, ou inviter un membre (dans la limite de sièges achetés) fonctionne toujours normalement.
  - Pourquoi : cette migration ajoute une protection invisible en usage normal (elle ne bloque que les tentatives de contournement de l'interface) — le vrai risque à tester est qu'elle bloque *aussi* par erreur un usage légitime.
```

- [ ] **Step 2: Commit everything**

```bash
git add docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql docs/tests-manuels.md
git commit -m "feat(rls): server-side plan gating backstop for finances, templates, logo, project/seat limits

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Hand off to the user**

Tell the user the file is ready at `docs/superpowers/specs/2026-08-04-server-side-plan-gating-migration.sql`, paste-and-run it once in Supabase → SQL Editor, and the two spot-checks from `docs/tests-manuels.md` are the only manual verification needed (everything else in this plan was already verified by the read-only queries in Tasks 1–6).
