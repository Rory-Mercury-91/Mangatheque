-- Archives locales rattachées à une œuvre (chemin PC + complétude + poids).

CREATE TABLE IF NOT EXISTS public.work_local_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.works (id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.owners (id) ON DELETE SET NULL,
  root_path text NOT NULL,
  demographic_folder text NOT NULL,
  status_folder text NOT NULL,
  expected_count integer,
  received_count integer NOT NULL DEFAULT 0,
  missing_count integer,
  unit text NOT NULL DEFAULT 'volume',
  size_bytes bigint NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_local_archives_unit_check CHECK (unit IN ('volume', 'chapter'))
);

COMMENT ON TABLE public.work_local_archives IS
  'Chemin d''archive locale (desktop) lié à une œuvre, avec compteurs et poids disque.';

CREATE INDEX IF NOT EXISTS work_local_archives_work_id_idx
  ON public.work_local_archives (work_id);

CREATE INDEX IF NOT EXISTS work_local_archives_owner_id_idx
  ON public.work_local_archives (owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS work_local_archives_work_owner_unique
  ON public.work_local_archives (work_id, owner_id)
  WHERE owner_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS work_local_archives_work_null_owner_unique
  ON public.work_local_archives (work_id)
  WHERE owner_id IS NULL;

ALTER TABLE public.work_local_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_local_archives_all_authenticated" ON public.work_local_archives;
CREATE POLICY "work_local_archives_all_authenticated"
  ON public.work_local_archives
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
