-- ADKami : une même page (même id) regroupe toutes les saisons MAL.
-- Plusieurs fiches animes peuvent donc partager le même adkami_id.

DROP INDEX IF EXISTS idx_animes_adkami_id;

CREATE INDEX IF NOT EXISTS idx_animes_adkami_id
  ON animes (adkami_id)
  WHERE adkami_id IS NOT NULL;

COMMENT ON COLUMN animes.adkami_id IS
  'Identifiant ADKami (agenda). Partagé entre saisons MAL d''une même série.';
