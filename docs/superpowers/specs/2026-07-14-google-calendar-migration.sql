-- Google Calendar integration: one OAuth connection per organisation,
-- readable/writable only by service-role serverless functions — never
-- granted to `authenticated`, since these rows hold live OAuth tokens.
-- Run once in the Supabase SQL editor.

create table google_calendar_connections (
  studio_id uuid primary key references studios(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  google_calendar_id text not null default 'primary',
  sync_token text,
  connected_by_user_id uuid not null references auth.users(id),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);

alter table google_calendar_connections enable row level security;
-- Deliberately no policies and no grants — only the service role (which
-- bypasses RLS) ever reads or writes this table.

-- Links a Rush event to the Google Calendar event it's synced with, so
-- later pushes/pulls update the same event instead of creating duplicates.
alter table events add column google_event_id text;
