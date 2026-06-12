-- Statut « En attente » (série Nautiljon en pause de publication VF)

ALTER TABLE works DROP CONSTRAINT IF EXISTS works_reading_status_check;

ALTER TABLE works
  ADD CONSTRAINT works_reading_status_check
  CHECK (reading_status IN ('ongoing', 'dropped', 'completed', 'on_hold'));
