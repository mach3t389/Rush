-- Follow-up to 2026-08-03-full-multiorg-rls-audit-round2.sql: that batch
-- opened role changes and studio branding to admins (my_admin_studio_ids())
-- but deliberately left member removal owner-only pending confirmation.
-- Confirmed with the user: admins should be able to remove a member too,
-- same as changing their role — never the owner's own row.
--
-- Run this once, in Supabase -> SQL Editor. Idempotent.

alter policy members_delete_by_owner on public.studio_members
  using (
    (studio_id in (select studios.id from public.studios where studios.owner_user_id = auth.uid()))
    or (studio_id in (select my_admin_studio_ids()) and is_owner = false)
  );
