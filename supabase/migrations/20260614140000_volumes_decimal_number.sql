-- Numéros de tome décimaux (ex. 1.5 entre le tome 1 et 2)
ALTER TABLE volumes
  ALTER COLUMN volume_number TYPE NUMERIC(6, 2)
  USING volume_number::numeric;

COMMENT ON COLUMN volumes.volume_number IS
  'Numéro de tome (entier ou décimal, ex. 1.5 pour un intercalaire). NULL si hors-série.';
