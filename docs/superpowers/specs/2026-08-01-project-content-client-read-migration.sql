-- 2026-08-01 — Aperçu client : Vision + modules personnalisés maintenant
-- affichés sur ClientProjectApercu.tsx, via getProjectContent(), le même
-- store que le studio (app/src/data/projectContentStore.ts). L'unique
-- policy RLS existante sur project_content (2026-07-27-project-content-
-- migration.sql) ne couvre que les membres du studio
-- (`studio_id in (select my_studio_ids())`) — un contact client externe
-- n'a jamais de ligne studio_members, donc cette lecture échoue
-- silencieusement pour un vrai compte client (fonctionne en session démo,
-- qui ne passe jamais par Supabase, ce qui masque le problème).
--
-- Additive uniquement — ne touche à aucune policy existante. Réutilise
-- is_client_contact_for_project(project_id), déjà créée par
-- 2026-07-25-client-dashboard-events-rls-migration.sql pour exactement ce
-- même besoin (lecture client d'une table scopée par studio, filtrée par
-- projet accessible au contact).
--
-- MANUAL STEP REQUIRED: paste this into Supabase → SQL Editor and run it.
-- Nothing in this project applies migrations automatically — see
-- CLAUDE.md's "Migrations Supabase" section.

drop policy if exists "project_content_select_client_access" on project_content;
create policy "project_content_select_client_access" on project_content
  for select
  using (is_client_contact_for_project(project_id));

grant select on public.project_content to authenticated;
