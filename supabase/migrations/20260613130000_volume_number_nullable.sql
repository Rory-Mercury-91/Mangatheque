-- Tomes hors-série (fanbook, guide…) sans numéro de série

ALTER TABLE volumes
  ALTER COLUMN volume_number DROP NOT NULL;

COMMENT ON COLUMN volumes.volume_number IS
  'Numéro dans la série VF ; NULL pour fanbook / hors-série (libellé dans volume_label).';
