-- Journal : auteur de la restauration (si différent du suppresseur)

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS restored_by_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_by_email TEXT;
