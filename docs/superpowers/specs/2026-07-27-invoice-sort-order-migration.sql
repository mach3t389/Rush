-- Backs Invoice.sortOrder (app/src/data/financeStore.ts) — manual
-- drag-to-reorder position for invoices in the Finances table, set the
-- first time a user reorders a row. Nullable: existing invoices keep
-- their current (insertion) order until reordered at least once.
--
-- Run once in the Supabase SQL Editor.

alter table invoices add column sort_order integer;
