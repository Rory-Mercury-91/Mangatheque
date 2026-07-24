-- Œuvres (manga) masquées de la liste personnelle (par compte auth).
-- Le catalogue foyer reste partagé ; seuls affichage / compteurs du user sont filtrés.

CREATE TABLE IF NOT EXISTS user_work_hidden (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id)
);

CREATE INDEX IF NOT EXISTS idx_user_work_hidden_work
  ON user_work_hidden (work_id);

COMMENT ON TABLE user_work_hidden IS
  'Œuvres masquées de la liste personnelle d''un compte (hors compteurs / grille par défaut).';

ALTER TABLE user_work_hidden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_work_hidden_select_household" ON user_work_hidden
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "user_work_hidden_insert_own" ON user_work_hidden
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_work_hidden_delete_own" ON user_work_hidden
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_work_hidden;
