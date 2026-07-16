-- View preferences (per-user, cross-device) — e.g. "show completed sections",
-- "show completed tasks", list/board view choice. Previously localStorage-only,
-- so it reset on every new browser/device. Mirrors notif_prefs' shape/RLS.

create table if not exists view_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table view_prefs enable row level security;

create policy "view_prefs_select_own" on view_prefs
  for select using (auth.uid() = user_id);

create policy "view_prefs_upsert_own" on view_prefs
  for insert with check (auth.uid() = user_id);

create policy "view_prefs_update_own" on view_prefs
  for update using (auth.uid() = user_id);

grant select, insert, update on view_prefs to authenticated;
