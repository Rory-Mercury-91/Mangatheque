-- Favoris anime par propriétaire du foyer.

CREATE TABLE anime_favorites (
  anime_id UUID NOT NULL REFERENCES animes (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anime_id, owner_id)
);

CREATE INDEX idx_anime_favorites_owner ON anime_favorites (owner_id);

COMMENT ON TABLE anime_favorites IS
  'Favoris animé partagés par propriétaire du foyer.';

ALTER TABLE anime_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anime_favorites_authenticated" ON anime_favorites
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.anime_favorites;
