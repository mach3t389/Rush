-- À exécuter manuellement dans Supabase → SQL Editor.
alter table projects
  add column if not exists is_template_draft boolean not null default false,
  add column if not exists draft_origin_template_id text;
