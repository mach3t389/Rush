-- À exécuter manuellement dans Supabase → SQL Editor.
alter table projects
  alter column client_id drop not null,
  add column if not exists calendar_enabled boolean not null default true,
  add column if not exists files_enabled boolean not null default true,
  add column if not exists finance_enabled boolean not null default true;
