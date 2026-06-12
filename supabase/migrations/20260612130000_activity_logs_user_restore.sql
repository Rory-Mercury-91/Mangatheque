-- Journal : auteur de l'action et marquage des restaurations

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id);
