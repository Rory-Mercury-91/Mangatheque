-- Autorise le même numéro en Simple et Collector, interdit les doublons même édition.
ALTER TABLE volumes DROP CONSTRAINT IF EXISTS volumes_work_id_volume_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_volumes_work_number_edition
  ON volumes (work_id, volume_number, edition_type)
  WHERE volume_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_volumes_work_label_edition
  ON volumes (work_id, volume_label, edition_type)
  WHERE volume_number IS NULL
    AND volume_label IS NOT NULL
    AND btrim(volume_label) <> '';
