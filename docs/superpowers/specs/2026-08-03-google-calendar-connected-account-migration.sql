-- Adds columns to store which Google account is connected per studio, so
-- Paramètres > Intégrations can show the email/name next to the
-- "Connecté" status — without this, two organisations both showing
-- "Connecté" looked identical even though each has its own independent
-- Google account (confirmed via a live data check, 2026-08-03: no bug,
-- just no visibility into which account is which).
--
-- Run this once, in Supabase -> SQL Editor.

alter table public.google_calendar_connections
  add column if not exists connected_google_email text,
  add column if not exists connected_google_name text;
