-- Suivi hybride : tomes et/ou chapitres sur une même œuvre.

ALTER TABLE works
  ADD COLUMN IF NOT EXISTS chapters_vf_count INTEGER,
  ADD COLUMN IF NOT EXISTS chapters_vo_total INTEGER,
  ADD COLUMN IF NOT EXISTS has_volume_tracking BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_chapter_tracking BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN works.chapters_vf_count IS
  'Chapitres VF parus (webtoon numérique / Mihon).';
COMMENT ON COLUMN works.chapters_vo_total IS
  'Chapitres VO total.';
COMMENT ON COLUMN works.has_volume_tracking IS
  'Suivi par tomes physiques (table volumes, hors placeholder chapitres).';
COMMENT ON COLUMN works.has_chapter_tracking IS
  'Suivi par chapitres (progression user_work_chapter_progress, Mihon).';

-- Migrer les séries chapitres existantes.
UPDATE works
SET
  has_volume_tracking = false,
  has_chapter_tracking = true,
  chapters_vf_count = volumes_vf_count,
  chapters_vo_total = volumes_vo_total,
  volumes_vf_count = NULL,
  volumes_vo_total = NULL
WHERE tracking_unit = 'chapter';

-- Séries tomes : valeurs par défaut déjà correctes (has_volume true, has_chapter false).

CREATE INDEX IF NOT EXISTS idx_works_chapter_tracking
  ON works (has_chapter_tracking)
  WHERE has_chapter_tracking = true;
