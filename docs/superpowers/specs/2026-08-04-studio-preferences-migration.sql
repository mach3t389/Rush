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

-- Owners can update their studio's prefs
CREATE POLICY "studio_owner_can_update_prefs" ON studios
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Team members (studio_members rows) can read their studio's prefs
CREATE POLICY "studio_members_can_read_prefs" ON studios
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM studio_members
      WHERE studio_members.studio_id = studios.id
        AND studio_members.user_id = auth.uid()
    )
  );

-- Team members can update their studio's prefs if they're admin/owner
CREATE POLICY "studio_admin_can_update_prefs" ON studios
  FOR UPDATE
  USING (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM studio_members
      WHERE studio_members.studio_id = studios.id
        AND studio_members.user_id = auth.uid()
        AND studio_members.access_level IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM studio_members
      WHERE studio_members.studio_id = studios.id
        AND studio_members.user_id = auth.uid()
        AND studio_members.access_level IN ('owner', 'admin')
    )
  );
