-- Index de saison ADKami (dernier segment d'URL) pour le matching multi-saisons.
ALTER TABLE animes
  ADD COLUMN IF NOT EXISTS adkami_season_index INTEGER;

COMMENT ON COLUMN animes.adkami_season_index IS
  'N° de saison ADKami (segment URL). Null = non renseigné / legacy.';

CREATE INDEX IF NOT EXISTS idx_animes_adkami_id_season
  ON animes (adkami_id, adkami_season_index)
  WHERE adkami_id IS NOT NULL;
