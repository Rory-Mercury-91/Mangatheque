-- Entrées du sas Mihon marquées « ignorées » : ne pas réinjecter à l'import.

CREATE TABLE IF NOT EXISTS public.mihon_ignored_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_normalized text NOT NULL,
  mal_id integer,
  anilist_id integer,
  catalog_keys text[] NOT NULL DEFAULT '{}',
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mihon_ignored_entries IS
  'Séries exclues du sas Mihon : l''import backup les ignore définitivement jusqu''à restauration.';

CREATE INDEX IF NOT EXISTS mihon_ignored_entries_mal_id_idx
  ON public.mihon_ignored_entries (mal_id)
  WHERE mal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mihon_ignored_entries_anilist_id_idx
  ON public.mihon_ignored_entries (anilist_id)
  WHERE anilist_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mihon_ignored_entries_title_normalized_idx
  ON public.mihon_ignored_entries (title_normalized);

CREATE INDEX IF NOT EXISTS mihon_ignored_entries_catalog_keys_gin_idx
  ON public.mihon_ignored_entries USING gin (catalog_keys);

ALTER TABLE public.mihon_ignored_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mihon_ignored_entries_all_authenticated" ON public.mihon_ignored_entries;
CREATE POLICY "mihon_ignored_entries_all_authenticated"
  ON public.mihon_ignored_entries
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
