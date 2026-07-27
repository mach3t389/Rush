-- Backs projectContentStore.ts (app/src/data/projectContentStore.ts) — free-
-- text content for a project's Aperçu tab (internal notes, vision &
-- positionnement) that was previously plain useState with no persistence at
-- all, lost on every navigation/reload. Mirrors resource_content's shape and
-- RLS pattern exactly (see 2026-07-06-resource-content-supabase-migration-design.md),
-- just keyed by project_id instead of resource_id and loaded on demand per
-- project rather than bulk-preloaded (only one project's Aperçu is open at a
-- time).
--
-- Run once in the Supabase SQL Editor.

create table project_content (
  project_id text primary key references projects(id) on delete cascade,
  studio_id uuid not null references studios(id),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_content enable row level security;

create policy "studio members can manage their project content"
  on project_content for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on project_content to authenticated;
