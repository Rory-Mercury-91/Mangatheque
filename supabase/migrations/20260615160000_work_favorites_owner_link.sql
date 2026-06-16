-- Favoris partagés par propriétaire du foyer.
CREATE TABLE work_favorites (
  work_id UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, owner_id)
);

CREATE INDEX idx_work_favorites_owner ON work_favorites (owner_id);

ALTER TABLE work_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_favorites_authenticated" ON work_favorites
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.work_favorites;

-- Lien optionnel propriétaire métier ↔ compte Supabase.
ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS linked_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_linked_user_id
  ON owners (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

COMMENT ON COLUMN owners.linked_user_id IS
  'Compte Supabase associé au propriétaire (journal, favoris par défaut, etc.).';
