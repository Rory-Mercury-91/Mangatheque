-- Unité de suivi : tome (défaut) ou chapitre (webtoon numérique)
ALTER TABLE works
  ADD COLUMN IF NOT EXISTS tracking_unit TEXT NOT NULL DEFAULT 'volume'
    CHECK (tracking_unit IN ('volume', 'chapter'));

COMMENT ON COLUMN works.tracking_unit IS
  'Unité de suivi en bibliothèque : volume (broché) ou chapter (webtoon).';
