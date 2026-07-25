-- Décalage entre la numérotation ADKami (saisons fusionnées) et le compteur MAL / local.
-- Ex. saison 4 : épisode ADKami 84 avec offset 68 ⇒ épisode local 16.
ALTER TABLE animes
  ADD COLUMN IF NOT EXISTS adkami_episode_offset INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN animes.adkami_episode_offset IS
  'Soustrait du numéro ADKami pour obtenir l''épisode local (MAL).';
