-- AI assistant monthly usage quota, tracked per studio. Run once in the
-- Supabase SQL editor.
--
-- Written only by the ai-chat serverless function using the service-role
-- key (never from the client) — the service role bypasses RLS entirely.
-- Read is also allowed directly from the client (Paramètres usage display),
-- scoped to the caller's own studio via studio_members.

create table ai_usage (
  studio_id uuid not null references studios(id) on delete cascade,
  month text not null, -- 'YYYY-MM', UTC
  message_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (studio_id, month)
);

alter table ai_usage enable row level security;

create policy "studio members read their own ai usage" on ai_usage
  for select
  using (studio_id in (select studio_id from studio_members where user_id = auth.uid()));

grant select on ai_usage to authenticated;
-- Deliberately no insert/update/delete grant — only the service role writes.
