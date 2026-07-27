-- Backs Project.overviewTemplateId (app/src/types/index.ts) — quel
-- ResourceTemplate de type 'overview' est actuellement appliqué à ce
-- projet. Même nature que folder_structure_template_id (une simple
-- référence texte, pas de contrainte FK car les ResourceTemplate
-- built-in n'ont pas de ligne DB).
--
-- Run once in the Supabase SQL Editor.

alter table projects add column overview_template_id text;
