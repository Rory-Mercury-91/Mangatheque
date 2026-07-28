-- Statut d'enrichissement (sas import Mihon → Nautiljon).
ALTER TABLE works
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT NULL
    CHECK (
      enrichment_status IS NULL
      OR enrichment_status IN ('pending_mihon')
    );

COMMENT ON COLUMN works.enrichment_status IS
  'Sas d''import : pending_mihon = fiche créée depuis backup Mihon, à enrichir via Nautiljon.';

CREATE INDEX IF NOT EXISTS works_enrichment_status_idx
  ON works (enrichment_status)
  WHERE enrichment_status IS NOT NULL;
