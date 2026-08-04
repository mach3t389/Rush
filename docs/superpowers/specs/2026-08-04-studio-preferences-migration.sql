-- Studio preferences scoping: add ui_fonts and portal_accent columns to studios table.
-- Default values match current hardcoded defaults in uiFontsStore.ts and Parametres.tsx.
--
-- This migration moves font family and accent color preferences from global localStorage
-- to per-studio Supabase storage, allowing different studios to have different branding.

ALTER TABLE studios
ADD COLUMN ui_fonts JSONB DEFAULT '{"heading":"''Montserrat'',sans-serif","body":"''Montserrat'',sans-serif"}' NOT NULL,
ADD COLUMN portal_accent TEXT DEFAULT NULL;

-- Add RLS policies (owner and team members can read/write their studio's preferences)
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is studio admin (security definer avoids recursion)
-- Mirrors is_studio_member() pattern from 2026-07-14-studios-rls-recursion-fix-migration.sql
CREATE OR REPLACE FUNCTION is_studio_admin(p_studio_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM studio_members
    WHERE studio_id = p_studio_id
      AND user_id = auth.uid()
      AND access_level IN ('owner', 'admin')
  );
$$;
GRANT EXECUTE ON FUNCTION is_studio_admin(uuid) TO authenticated;

-- Owners can update their studio's prefs
CREATE POLICY "studio_owner_can_update_prefs" ON studios
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Team members (studio_members rows) can read their studio's prefs
-- Uses is_studio_member() helper to avoid infinite recursion (see 2026-07-14 fix)
CREATE POLICY "studio_members_can_read_prefs" ON studios
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR is_studio_member(id)
  );
GRANT SELECT ON studios TO authenticated;

-- Team members can update their studio's prefs if they're admin/owner
-- Uses is_studio_admin() helper to avoid infinite recursion
CREATE POLICY "studio_admin_can_update_prefs" ON studios
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR is_studio_admin(id)
  )
  WITH CHECK (
    auth.uid() = owner_user_id
    OR is_studio_admin(id)
  );
GRANT UPDATE ON studios TO authenticated;
