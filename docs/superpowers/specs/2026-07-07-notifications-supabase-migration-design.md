# Notification History Supabase Migration — Design

**Status:** Approved by user (2026-07-07). 11th Phase 2 chantier (backend migration).

## Goal

Migrate `notificationStore.ts` (notification history + read/unread state) from a single global `localStorage` list to Supabase, while keeping the 3 hardcoded demo accounts working unchanged. This is expected to be the last Phase 2 backend chantier — a code audit (2026-07-07) confirmed every other remaining `app/src/data/` store is either purely local UI preference (safe to leave alone) or explicitly deferred (`financeStore.ts`, `commentStore.ts`).

## Scope

**In scope:** `notificationStore.ts` in full — all 13 exported functions, backing the notification bell (`GlobalTopBar.tsx`), the Activité screen, and mark-as-read triggers scattered across `Travail.tsx`, `Portail.tsx`, `DocumentReview.tsx`, `ImageReview.tsx`, `VideoReview.tsx`, `ResourceDetail.tsx`, `InvitationAccept.tsx`, `RequestApprovalButton.tsx`, and the `useNotifs.ts` hook.

**Explicitly out of scope:** `financeStore.ts` and `commentStore.ts` (both remain deferred, unrelated to this chantier).

## Current state (confirmed via code read)

`notificationStore.ts` holds one global `AppNotif[]` array in `localStorage` (`sf_notifs`), seeded once from mock task/resource activity counts on first load (fake demo activity), then persisted going forward as real notifications get added (`addNotif`, called from real flows like invitation acceptance and deliverable approval) and read status changes (`markTaskRead`/`markResourceRead`/`markAllProjectRead`/`markAllRead`). Each `AppNotif` has: `id, kind, actor, text, timestamp, read, taskId?, resourceId?, projectId?, clientId?` — a flat, simple shape (unlike the deeply-nested template/resource-content shapes from earlier chantiers), so this maps cleanly onto typed table columns rather than a JSONB blob.

Critically, `read` is a single shared boolean today — with only one global list, there's no per-user distinction, but in practice every person already effectively has their own read status by accident, since each browser has its own separate `localStorage`. Confirmed with the user: this accidental per-person behavior should become an intentional, explicit product decision — real accounts get each team member their own read/unread state, not a shared one (so one person clearing their notifications doesn't silently clear them for the whole team).

## Migration

Two tables: one for the shared notification events (studio-wide, everyone sees the same feed), one for personal read-tracking.

```sql
create table notifications (
  id text primary key,
  studio_id uuid not null references studios(id),
  kind text not null,
  actor text not null,
  text text not null,
  timestamp bigint not null,
  task_id text,
  resource_id text,
  project_id text,
  client_id text,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "studio members can manage their notifications"
  on notifications for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on notifications to authenticated;

create table notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null references notifications(id) on delete cascade,
  primary key (user_id, notification_id)
);

alter table notification_reads enable row level security;

create policy "users manage their own notification read state"
  on notification_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on notification_reads to authenticated;
```

A notification is "read" for a user if a matching row exists in `notification_reads`. `notificationStore.ts` is rewritten with the dual demo/real pattern: demo sessions keep today's exact `localStorage` behavior (shared global list, shared read state, byte-for-byte unchanged). Real sessions bulk-fetch a studio's notifications plus the caller's own read-state rows into an in-memory cache on first access (mirroring `resourceStore.ts`), merging them into the same `AppNotif[]` shape (with `read` computed per-user from the join) so every existing exported function keeps its exact signature and no consumer file needs any changes. `markTaskRead`/`markResourceRead`/`markAllProjectRead`/`markAllRead` insert rows into `notification_reads` for the caller's own user id (never touching another user's read state); `addNotif` inserts a new shared `notifications` row.

## No consumer changes required

Every one of the 13 exported function signatures is preserved exactly. None of the consumer screens/components/hooks need any changes.

## Testing / verification plan

- Demo-session regression: notification bell, mark-as-read flows (task/resource/project/all), Activité screen all behave exactly as before this migration.
- Real-session round-trip: trigger a real notification (e.g. accept an invitation), confirm it appears; mark it read, reload, confirm it stays read.
- Per-user read-state isolation: with two real users in the same studio, confirm one marking a notification read does NOT mark it read for the other (they each see their own unread count).
- Cross-studio RLS isolation: confirm a studio only ever sees its own notifications, never another studio's.
- Final typecheck/lint diff against the baseline (185 typecheck errors / 339 lint problems).
