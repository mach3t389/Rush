-- AI assistant monthly usage quota, tracked per studio. Run once in the
-- Supabase SQL editor.
--
-- Only ever read/written by the ai-chat serverless function using the
-- service-role key (never from the client), so RLS is enabled with no
-- policies and no grants to anon/authenticated — this denies all direct
-- client access by default while the service role bypasses RLS entirely.

create table ai_usage (
  studio_id uuid not null references studios(id) on delete cascade,
  month text not null, -- 'YYYY-MM', UTC
  message_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (studio_id, month)
);

alter table ai_usage enable row level security;
