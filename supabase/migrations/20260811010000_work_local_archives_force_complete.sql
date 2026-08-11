-- Complétude forcée : plafond local (ex. tomes Kindle hors archive disque).

ALTER TABLE public.work_local_archives
  ADD COLUMN IF NOT EXISTS force_complete boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.work_local_archives.force_complete IS
  'Si vrai, le plafond attendu reste celui stocké (pas le catalogue VF) au rescan.';
