-- Supprime la date d'achat (seule la date de sortie VF est conservée).
ALTER TABLE volumes DROP COLUMN IF EXISTS purchase_date;
