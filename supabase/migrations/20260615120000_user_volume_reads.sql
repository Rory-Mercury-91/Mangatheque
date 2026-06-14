-- Historique de lecture privé par compte (non partagé entre utilisateurs).

CREATE TABLE user_volume_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  volume_id UUID NOT NULL REFERENCES volumes (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, volume_id)
);

CREATE INDEX idx_user_volume_reads_user_id ON user_volume_reads (user_id);
CREATE INDEX idx_user_volume_reads_volume_id ON user_volume_reads (volume_id);

COMMENT ON TABLE user_volume_reads IS
  'Tomes marqués comme lus par chaque compte auth (privé, RLS par user_id).';

ALTER TABLE user_volume_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_volume_reads_select_own" ON user_volume_reads
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_volume_reads_insert_own" ON user_volume_reads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_volume_reads_update_own" ON user_volume_reads
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_volume_reads_delete_own" ON user_volume_reads
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
