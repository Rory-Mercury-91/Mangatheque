-- Animés masqués de la liste personnelle (par compte auth).
-- Le catalogue foyer reste partagé ; seuls affichage / compteurs du user sont filtrés.

CREATE TABLE IF NOT EXISTS user_anime_hidden (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  anime_id UUID NOT NULL REFERENCES animes (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anime_id)
);

CREATE INDEX IF NOT EXISTS idx_user_anime_hidden_anime
  ON user_anime_hidden (anime_id);

COMMENT ON TABLE user_anime_hidden IS
  'Animés masqués de la liste personnelle d''un compte (hors compteurs / grille par défaut).';

ALTER TABLE user_anime_hidden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_anime_hidden_select_household" ON user_anime_hidden
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "user_anime_hidden_insert_own" ON user_anime_hidden
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_anime_hidden_delete_own" ON user_anime_hidden
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_anime_hidden;
