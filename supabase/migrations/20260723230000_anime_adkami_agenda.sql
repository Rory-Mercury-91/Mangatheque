-- Lien ADKami + cache agenda hebdomadaire (sorties d'épisodes).

ALTER TABLE animes
  ADD COLUMN IF NOT EXISTS adkami_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_animes_adkami_id
  ON animes (adkami_id)
  WHERE adkami_id IS NOT NULL;

COMMENT ON COLUMN animes.adkami_id IS
  'Identifiant ADKami (agenda). Partagé entre saisons MAL d''une même série.';

CREATE TABLE anime_agenda_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adkami_id INTEGER NOT NULL,
  anime_id UUID REFERENCES animes (id) ON DELETE CASCADE,
  episode_number INTEGER,
  episode_label TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  release_at TIMESTAMPTZ NOT NULL,
  day_label TEXT,
  cover_url TEXT,
  page_url TEXT,
  matched BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT anime_agenda_entries_unique
    UNIQUE (adkami_id, episode_number, release_at)
);

CREATE INDEX idx_anime_agenda_release ON anime_agenda_entries (release_at);
CREATE INDEX idx_anime_agenda_anime ON anime_agenda_entries (anime_id)
  WHERE anime_id IS NOT NULL;

COMMENT ON TABLE anime_agenda_entries IS
  'Sorties d''épisodes ADKami de la semaine, liées au catalogue foyer si match.';

ALTER TABLE anime_agenda_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anime_agenda_entries_authenticated" ON anime_agenda_entries
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.anime_agenda_entries;
