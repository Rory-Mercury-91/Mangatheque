-- Préférences de lecture par compte (ex. série abandonnée).

CREATE TABLE user_work_reading_state (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  is_abandoned BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id)
);

CREATE INDEX idx_user_work_reading_state_work_id
  ON user_work_reading_state (work_id);

COMMENT ON TABLE user_work_reading_state IS
  'État de lecture personnel par série (override abandonnée) — privé par compte.';

ALTER TABLE user_work_reading_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_work_reading_state_select_own" ON user_work_reading_state
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_work_reading_state_insert_own" ON user_work_reading_state
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_work_reading_state_update_own" ON user_work_reading_state
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_work_reading_state_delete_own" ON user_work_reading_state
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
