-- Éditeur VF et format dédiés au suivi chapitres (hybride).

ALTER TABLE works
  ADD COLUMN IF NOT EXISTS publisher_vf_chapter TEXT,
  ADD COLUMN IF NOT EXISTS chapter_price_format TEXT
    CHECK (
      chapter_price_format IS NULL
      OR chapter_price_format IN ('broche', 'numerique')
    );

COMMENT ON COLUMN works.publisher_vf_chapter IS
  'Éditeur VF de l''édition numérique / chapitres (webtoon Mihon).';
COMMENT ON COLUMN works.chapter_price_format IS
  'Format de l''édition chapitres (souvent numérique).';

UPDATE works
SET chapter_price_format = COALESCE(price_format, 'numerique')
WHERE has_chapter_tracking = true
  AND chapter_price_format IS NULL;
