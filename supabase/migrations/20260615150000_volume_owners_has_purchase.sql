-- Mihon et achat physique peuvent coexister sur le même tome (même propriétaire).
ALTER TABLE volume_owners
  ADD COLUMN IF NOT EXISTS has_purchase BOOLEAN;

UPDATE volume_owners
SET has_purchase = NOT has_mihon
WHERE has_purchase IS NULL;

ALTER TABLE volume_owners
  ALTER COLUMN has_purchase SET DEFAULT true;

ALTER TABLE volume_owners
  ALTER COLUMN has_purchase SET NOT NULL;

COMMENT ON COLUMN volume_owners.has_purchase IS
  'Achat physique (participation au coût). Peut être true en même temps que has_mihon.';

COMMENT ON COLUMN volume_owners.has_mihon IS
  'Présence sur le compte Mihon du propriétaire. Si has_purchase est aussi true, le coût reste physique (pas d''économie Mihon).';
