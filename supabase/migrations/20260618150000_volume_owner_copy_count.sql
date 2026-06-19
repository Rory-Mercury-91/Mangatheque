-- Nombre d'exemplaires physiques par propriétaire sur un même tome.

ALTER TABLE volume_owners
  ADD COLUMN IF NOT EXISTS copy_count INTEGER NOT NULL DEFAULT 1
  CHECK (copy_count >= 1);

COMMENT ON COLUMN volume_owners.copy_count IS
  'Exemplaires achetés par ce propriétaire pour ce tome (prix unitaire × copy_count).';
