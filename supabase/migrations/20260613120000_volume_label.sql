-- Libellé optionnel pour tomes hors numérotation (fanbook, guide, etc.)

ALTER TABLE volumes
  ADD COLUMN IF NOT EXISTS volume_label TEXT;

COMMENT ON COLUMN volumes.volume_label IS
  'Libellé affiché si le tome n''a pas de numéro de série classique (ex. fanbook).';
