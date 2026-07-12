-- Adds the approver-assignment column to the existing clients table. Run
-- once in the Supabase SQL editor. No RLS/grant changes needed — clients
-- already has full RLS + grants from its original migration, and this is
-- just a new nullable column on that same table.

alter table clients add column approver_id text;
