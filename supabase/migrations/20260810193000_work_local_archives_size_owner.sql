-- Poids disque + propriétaire (plusieurs PC / membres du foyer).

ALTER TABLE public.work_local_archives
  ADD COLUMN IF NOT EXISTS size_bytes bigint NOT NULL DEFAULT 0;

ALTER TABLE public.work_local_archives
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.owners (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.work_local_archives.size_bytes IS
  'Taille totale de l''archive locale en octets (dossier ou fichier).';

COMMENT ON COLUMN public.work_local_archives.owner_id IS
  'Propriétaire du PC / compte qui a rangé l''archive (Alex, Céline…).';

-- Une archive par couple œuvre × propriétaire (chemins distincts par machine).
ALTER TABLE public.work_local_archives
  DROP CONSTRAINT IF EXISTS work_local_archives_work_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS work_local_archives_work_owner_unique
  ON public.work_local_archives (work_id, owner_id)
  WHERE owner_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS work_local_archives_work_null_owner_unique
  ON public.work_local_archives (work_id)
  WHERE owner_id IS NULL;

CREATE INDEX IF NOT EXISTS work_local_archives_owner_id_idx
  ON public.work_local_archives (owner_id);
