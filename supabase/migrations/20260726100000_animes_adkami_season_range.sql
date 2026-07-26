-- Plage d'épisodes ADKami par saison + saison prioritaire pour le planning.
ALTER TABLE animes
  ADD COLUMN IF NOT EXISTS adkami_episode_from NUMERIC,
  ADD COLUMN IF NOT EXISTS adkami_episode_to NUMERIC,
  ADD COLUMN IF NOT EXISTS adkami_season_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN animes.adkami_episode_from IS
  'Premier épisode ADKami (absolu) de cette saison MAL.';
COMMENT ON COLUMN animes.adkami_episode_to IS
  'Dernier épisode ADKami (absolu) de cette saison MAL.';
COMMENT ON COLUMN animes.adkami_season_active IS
  'Si true, cette fiche est prioritaire pour le planning (même adkami_id).';

CREATE INDEX IF NOT EXISTS idx_animes_adkami_season_active
  ON animes (adkami_id)
  WHERE adkami_id IS NOT NULL AND adkami_season_active = true;
