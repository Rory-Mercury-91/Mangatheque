-- Index sources Mihon/Tachiyomi (catalogue Keiyoushi) + champs catalogue sur works.

CREATE TABLE IF NOT EXISTS public.mihon_sources (
  source_id text PRIMARY KEY,
  source_name text NOT NULL,
  source_lang text NOT NULL,
  source_base_url text,
  extension_name text NOT NULL,
  extension_pkg text NOT NULL,
  extension_version text,
  extension_apk text,
  extension_nsfw boolean NOT NULL DEFAULT false,
  catalog_url text NOT NULL DEFAULT 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mihon_sources IS
  'Index local des sources Mihon/Tachiyomi, alimenté depuis le catalogue Keiyoushi.';

CREATE INDEX IF NOT EXISTS mihon_sources_lang_idx
  ON public.mihon_sources (source_lang);

CREATE INDEX IF NOT EXISTS mihon_sources_base_url_idx
  ON public.mihon_sources (source_base_url);

DROP TRIGGER IF EXISTS mihon_sources_set_updated_at ON public.mihon_sources;
CREATE TRIGGER mihon_sources_set_updated_at
  BEFORE UPDATE ON public.mihon_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mihon_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mihon_sources_select_authenticated" ON public.mihon_sources;
CREATE POLICY "mihon_sources_select_authenticated"
  ON public.mihon_sources FOR SELECT
  TO authenticated
  USING (true);

DROP FUNCTION IF EXISTS public.upsert_mihon_sources(jsonb, text);
CREATE OR REPLACE FUNCTION public.upsert_mihon_sources(
  p_sources jsonb,
  p_catalog_url text DEFAULT 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row jsonb;
BEGIN
  IF p_sources IS NULL OR jsonb_typeof(p_sources) <> 'array' THEN
    RAISE EXCEPTION 'p_sources doit être un tableau JSON';
  END IF;

  FOR v_row IN
    SELECT value FROM jsonb_array_elements(p_sources)
  LOOP
    INSERT INTO public.mihon_sources (
      source_id,
      source_name,
      source_lang,
      source_base_url,
      extension_name,
      extension_pkg,
      extension_version,
      extension_apk,
      extension_nsfw,
      catalog_url,
      fetched_at
    )
    VALUES (
      coalesce(v_row->>'source_id', ''),
      coalesce(v_row->>'source_name', 'Source inconnue'),
      coalesce(v_row->>'source_lang', 'all'),
      nullif(v_row->>'source_base_url', ''),
      coalesce(v_row->>'extension_name', 'Extension inconnue'),
      coalesce(v_row->>'extension_pkg', 'unknown.pkg'),
      nullif(v_row->>'extension_version', ''),
      nullif(v_row->>'extension_apk', ''),
      coalesce((v_row->>'extension_nsfw')::boolean, false),
      coalesce(nullif(p_catalog_url, ''), 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json'),
      now()
    )
    ON CONFLICT (source_id) DO UPDATE SET
      source_name = excluded.source_name,
      source_lang = excluded.source_lang,
      source_base_url = excluded.source_base_url,
      extension_name = excluded.extension_name,
      extension_pkg = excluded.extension_pkg,
      extension_version = excluded.extension_version,
      extension_apk = excluded.extension_apk,
      extension_nsfw = excluded.extension_nsfw,
      catalog_url = excluded.catalog_url,
      fetched_at = excluded.fetched_at;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_mihon_sources(jsonb, text) TO authenticated;

ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS mihon_source_id text NULL,
  ADD COLUMN IF NOT EXISTS mihon_source_name text NULL,
  ADD COLUMN IF NOT EXISTS mihon_catalog_url text NULL;

COMMENT ON COLUMN public.works.mihon_source_id IS
  'Identifiant source Mihon (extension) issu du backup.';
COMMENT ON COLUMN public.works.mihon_source_name IS
  'Nom de la source Mihon résolu via l''index Keiyoushi.';
COMMENT ON COLUMN public.works.mihon_catalog_url IS
  'URL catalogue résolue (baseUrl source + chemin backup).';

CREATE INDEX IF NOT EXISTS works_mihon_source_id_idx
  ON public.works (mihon_source_id)
  WHERE mihon_source_id IS NOT NULL;
