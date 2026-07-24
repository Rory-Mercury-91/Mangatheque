-- Section ADKami (anime / hentai / drama…) pour construire la bonne URL fiche.

ALTER TABLE animes
  ADD COLUMN IF NOT EXISTS adkami_section TEXT;

UPDATE animes
SET adkami_section = 'anime'
WHERE adkami_id IS NOT NULL
  AND (adkami_section IS NULL OR trim(adkami_section) = '');

COMMENT ON COLUMN animes.adkami_section IS
  'Segment d''URL ADKami : anime, hentai, drama… (défaut anime).';
