-- Verrouillage du mapping MAL ↔ ADKami (fiche contrôlée / validée).
ALTER TABLE animes
  ADD COLUMN IF NOT EXISTS adkami_mapping_validated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN animes.adkami_mapping_validated IS
  'true = mapping ADKami contrôlé : la fiche est exclue des listes d''attribution des autres pages ADKami.';

CREATE INDEX IF NOT EXISTS idx_animes_adkami_mapping_validated
  ON animes (adkami_id)
  WHERE adkami_mapping_validated = true AND adkami_id IS NOT NULL;
