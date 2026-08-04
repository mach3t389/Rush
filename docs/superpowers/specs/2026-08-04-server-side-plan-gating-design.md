# Server-side plan gating — design

**Date:** 2026-08-04
**Status:** approved by user, pending SQL write + manual execution

## Problem

Plan-based feature gating (Gratuit vs Studio/Agence) is enforced today only in the React client (`canUseFeature()`, `PLAN_LIMITS`, `requestUpgrade()` — see `app/src/data/planFeatures.ts` and `app/src/data/upgradePromptStore.ts`). The one exception is the AI assistant, which re-checks the plan server-side in `app/api/ai-chat.ts`. Every other gated capability — Finances, custom templates, custom logo, project count limit, team seat limit — has no backstop: a user who calls the Supabase REST API directly with their own session token (bypassing the UI entirely) can currently create/modify data a Gratuit plan shouldn't allow.

This is not urgent for normal usage (the UI correctly blocks the flow for regular users) but is a real gap now that Stripe accepts real payments — someone who never pays could permanently use paid features by working around the UI.

**Out of scope:** storage quota enforcement. Storage usage lives partly in Supabase Storage objects and partly as base64 blobs in a Postgres column (per `app/src/data/fileContentStore.ts`'s documented dual-path), which needs its own investigation into Storage-bucket RLS policies and byte-summing — different mechanism than the table-level RLS used here. Tracked separately in memory (`server-side-plan-gating-deferred`), not part of this migration.

## Approach

Every gated table already has a `for all` RLS policy shaped like:

```sql
create policy "studio members can manage their invoices"
  on invoices for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));
```

`USING` governs SELECT/UPDATE/DELETE visibility; `WITH CHECK` governs what INSERT/UPDATE is allowed to write. Because we want to keep letting a downgraded studio **see and delete** its existing paid-tier data (never destroy it — same principle already applied to the custom logo columns) but **not create or modify** new instances of it, the fix in every case is the same: **extend `WITH CHECK` with an additional plan condition, leave `USING` untouched.** No new pattern for this codebase — cross-table subqueries to `studios` are already used elsewhere (owner-check clauses in the round1/round2 RLS audits).

### Per-table changes

| Table(s) | Added `WITH CHECK` condition | Effect |
|---|---|---|
| `invoices`, `payment_methods`, `invoice_defaults` | `and studio_id in (select id from studios where plan <> 'gratuit')` | Free-plan studios can't create/edit invoices or payment methods; can still view/delete existing ones. |
| `custom_project_templates`, `custom_form_templates`, `custom_resource_templates` | same shape as above | Free-plan studios can't save a new custom template; existing ones stay usable/deletable. |
| `projects` | `and (exists (select 1 from studios s where s.id = projects.studio_id and s.plan <> 'gratuit') or (select count(*) from projects p2 where p2.studio_id = projects.studio_id and p2.archived = false) < 3)` | Matches the client's exact rule (`canCreateNewProject()` in `upgradePromptStore.ts:48-56`): Gratuit capped at 3 *active* (non-archived) projects, unlimited on paid plans. (Referencing `projects.studio_id` — RLS `WITH CHECK` expressions evaluate against the row's own columns directly, not `NEW`/`OLD` as in a trigger.) |
| `studio_members` | `and (select count(*) from studio_members m where m.studio_id = studio_members.studio_id) < (select billing_seats from studios s where s.id = studio_members.studio_id)` | Unifies both plan tiers into one check: `billing_seats` is already the authoritative purchased-seat ceiling (defaults to 2, only ever written by `service_role` via the Stripe webhook / admin tool / downgrade reset — see `app/api/stripe-webhook.ts`, `app/api/update-subscription.ts:81`). Gratuit studios always have `billing_seats = 2` by construction, so this one condition correctly caps both Gratuit (2) and any paid tier (however many seats were purchased) without special-casing plan. |
| `studios` (logo columns specifically) | new `before update` trigger, not a policy tweak | RLS `WITH CHECK` can't cleanly express "these two specific columns didn't change" — a trigger comparing `OLD`/`NEW` is the standard Postgres way to do column-level write restriction on a table that's otherwise freely editable by its own members. Trigger: if `new.plan = 'gratuit'` and (`new.logo_full is distinct from old.logo_full` or `new.logo_square is distinct from old.logo_square`), reject the change (raise exception) or — preferred, gentler — silently keep `old.logo_full`/`old.logo_square` so a bypassed client write doesn't hard-error, just silently no-ops the logo part of the update. Matches the "never delete, only freeze" principle already implemented client-side in `Sidebar.tsx`. |

### Hardening bonus (small, low-risk, included in the same migration)

`studios.plan` is currently a bare `text` column with no `CHECK` constraint — the three valid values (`'gratuit' | 'studio' | 'agence'`) are enforced only in TypeScript. Add:

```sql
alter table studios add constraint studios_plan_valid check (plan in ('gratuit','studio','agence'));
```

This has no behavioral effect on the app (every write already uses one of these three values) — it just closes a gap where a bypassed write could otherwise set `plan` to any string and silently break every `PLAN_FEATURES[plan]` lookup client-side.

### GRANT statements

No new `GRANT` needed — these are modifications to existing policies on tables that already grant `select, insert, update, delete` to `authenticated` (per the finance/templates/projects/studio_members migration docs). Only the new trigger on `studios` and the new `CHECK` constraint are additive DDL, neither of which needs a GRANT.

## Error handling

When RLS rejects a write, Postgres returns a `42501` (`permission denied`) error via PostgREST, surfaced to the client as a normal Supabase error object. None of this should be reachable through the actual UI in ordinary use (the client-side gate always blocks first) — so no new user-facing error message is being designed here. The existing `try/catch` + `console.error` pattern already used in every store (e.g. `financeStore.ts`, `templates.ts`) is sufficient: worst case, a bypass attempt fails with a generic console error instead of the friendly upgrade prompt the UI shows for normal users. If the user later wants a friendlier message for this edge case, that's a separate, small follow-up — not blocking this migration.

## Testing

Since Claude cannot create real paid/free accounts or run authenticated Supabase calls as a real user (safety rules), verification is:
1. Claude reviews the exact SQL for correctness (each condition matches the client-side rule it mirrors) before handing it over.
2. User runs the migration SQL in Supabase → SQL Editor, confirms no errors.
3. User does one manual spot-check on a real Gratuit-plan studio: attempt one blocked action (e.g. try creating a 4th project or a new invoice) through the *normal UI* — should still be blocked exactly as before (proves the new RLS didn't break the already-working client gate or any legitimate paid-plan flow). Full adversarial bypass testing (calling the API directly) is optional/deferred — the goal of this migration is defense-in-depth, not something the user needs to personally verify by attempting a bypass.
4. Add this to `docs/tests-manuels.md` as a lightweight follow-up check.

## Delivery

Same pattern as every other migration in this repo (`docs/superpowers/specs/*.sql`): Claude writes the final SQL file, the user pastes and runs it manually in Supabase → SQL Editor — no code deploy needed since no application code changes.
