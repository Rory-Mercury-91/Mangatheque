-- Statut de lecture d'une œuvre (affiché sur la fiche détail)
ALTER TABLE works
  ADD COLUMN IF NOT EXISTS reading_status TEXT NOT NULL DEFAULT 'ongoing'
  CHECK (reading_status IN ('ongoing', 'dropped', 'completed'));
