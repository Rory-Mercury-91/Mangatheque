-- Sources Mihon rattachées à une œuvre (multi-sources / regroupement sas).

CREATE TABLE IF NOT EXISTS public.work_mihon_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.works (id) ON DELETE CASCADE,
  source_id text NOT NULL,
  source_name text,
  catalog_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_mihon_sources_work_source_unique UNIQUE (work_id, source_id)
);

COMMENT ON TABLE public.work_mihon_sources IS
  'Sources Mihon liées à une même œuvre (ex. MangaDex + Japscan + Raijin).';

CREATE INDEX IF NOT EXISTS work_mihon_sources_work_id_idx
  ON public.work_mihon_sources (work_id);

CREATE INDEX IF NOT EXISTS work_mihon_sources_source_id_idx
  ON public.work_mihon_sources (source_id);

ALTER TABLE public.work_mihon_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_mihon_sources_all_authenticated" ON public.work_mihon_sources;
CREATE POLICY "work_mihon_sources_all_authenticated"
  ON public.work_mihon_sources
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Reprend les colonnes dénormalisées existantes.
INSERT INTO public.work_mihon_sources (work_id, source_id, source_name, catalog_url)
SELECT
  id,
  mihon_source_id,
  mihon_source_name,
  mihon_catalog_url
FROM public.works
WHERE mihon_source_id IS NOT NULL
  AND trim(mihon_source_id) <> ''
ON CONFLICT (work_id, source_id) DO NOTHING;
