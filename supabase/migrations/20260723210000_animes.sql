-- Catalogue animé foyer + progression visionnage par compte auth.

CREATE TABLE animes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mal_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  title_en TEXT,
  title_ja TEXT,
  title_fr TEXT,
  cover_url TEXT,
  media_type TEXT,
  source TEXT,
  status TEXT,
  season TEXT,
  year INTEGER,
  episodes INTEGER,
  duration_seconds INTEGER,
  broadcast_day TEXT,
  broadcast_time TEXT,
  rating TEXT,
  nsfw TEXT,
  synopsis TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  themes TEXT[] NOT NULL DEFAULT '{}',
  demographics TEXT[] NOT NULL DEFAULT '{}',
  explicit_genres TEXT[] NOT NULL DEFAULT '{}',
  studios TEXT[] NOT NULL DEFAULT '{}',
  streaming JSONB NOT NULL DEFAULT '[]'::jsonb,
  pictures JSONB NOT NULL DEFAULT '[]'::jsonb,
  related JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT animes_mal_id_unique UNIQUE (mal_id)
);

CREATE INDEX idx_animes_title ON animes (title);
CREATE INDEX idx_animes_year ON animes (year) WHERE year IS NOT NULL;
CREATE INDEX idx_animes_status ON animes (status) WHERE status IS NOT NULL;

COMMENT ON TABLE animes IS
  'Catalogue animé du foyer (métadonnées MAL/Jikan, sans possession).';

CREATE TABLE user_anime_progress (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  anime_id UUID NOT NULL REFERENCES animes (id) ON DELETE CASCADE,
  list_status TEXT NOT NULL DEFAULT 'plan_to_watch'
    CHECK (list_status IN (
      'watching',
      'completed',
      'on_hold',
      'dropped',
      'plan_to_watch'
    )),
  episodes_watched INTEGER NOT NULL DEFAULT 0
    CHECK (episodes_watched >= 0),
  started_at DATE,
  finished_at DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anime_id)
);

CREATE INDEX idx_user_anime_progress_anime
  ON user_anime_progress (anime_id);
CREATE INDEX idx_user_anime_progress_status
  ON user_anime_progress (list_status);

COMMENT ON TABLE user_anime_progress IS
  'Visionnage animé : lecture foyer (SELECT), écriture réservée au compte auth.';

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS animes_updated_at ON animes;
CREATE TRIGGER animes_updated_at
  BEFORE UPDATE ON animes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_anime_progress_updated_at ON user_anime_progress;
CREATE TRIGGER user_anime_progress_updated_at
  BEFORE UPDATE ON user_anime_progress
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE animes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_anime_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "animes_authenticated" ON animes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "user_anime_progress_select_household" ON user_anime_progress
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "user_anime_progress_insert_own" ON user_anime_progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_anime_progress_update_own" ON user_anime_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_anime_progress_delete_own" ON user_anime_progress
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.animes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_anime_progress;
