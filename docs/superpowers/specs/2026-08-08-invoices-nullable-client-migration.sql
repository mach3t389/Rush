-- docs/superpowers/specs/2026-08-08-invoices-nullable-client-migration.sql
-- À coller et exécuter manuellement dans Supabase → SQL Editor.
-- Permet à une facture d'exister sans client (projets financés sans client,
-- ex. subventions) — voir docs/superpowers/specs/2026-08-08-project-modules-optional-design.md
alter table public.invoices alter column client_id drop not null;
