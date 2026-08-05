-- Per-user "last viewed" timestamp per task, for the task comment badge's
-- unread state. Personal preference data (like notif_prefs/sidebar_prefs),
-- scoped by auth.uid(), not by studio.

create table if not exists task_comment_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  last_viewed_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

alter table task_comment_reads enable row level security;

create policy "Users manage their own task comment reads"
  on task_comment_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on task_comment_reads to authenticated;
