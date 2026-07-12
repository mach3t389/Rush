-- Sidebar preferences (pinned projects, pinned clients, per-project color
-- overrides) — per-user, not per-studio, following the same pattern as
-- notif_prefs. Run this once in the Supabase SQL editor.

create table sidebar_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pinned_project_ids text[] not null default '{}',
  pinned_client_ids text[] not null default '{}',
  project_colors jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table sidebar_prefs enable row level security;

create policy "users manage their own sidebar preferences"
  on sidebar_prefs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on sidebar_prefs to authenticated;
