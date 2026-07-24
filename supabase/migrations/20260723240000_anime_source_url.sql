-- URL source Nautiljon pour les fiches animé.

ALTER TABLE animes
  ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN animes.source_url IS
  'URL fiche Nautiljon (animé), optionnelle.';
