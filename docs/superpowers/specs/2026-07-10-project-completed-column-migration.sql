-- Adds the "marked completed" column (project Aperçu tab toggle) to the
-- existing projects table. Run once in the Supabase SQL editor. No RLS/grant
-- changes needed — projects already has full RLS + grants from its
-- original migration, and this is just a new column on that same table.

alter table projects add column completed boolean not null default false;
