-- Sync planning Nautiljon : suivi des notifications par utilisateur

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS planning_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.planning_seen_at IS
  'Horodatage de la dernière consultation des mises à jour planning Nautiljon.';

CREATE INDEX IF NOT EXISTS idx_activity_logs_planning
  ON activity_logs (created_at DESC)
  WHERE action_type IN ('planning_volume_create', 'planning_volume_update');
