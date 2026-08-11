-- Calendrier / attente de parution (webtoon, etc.) — sans Discord.

CREATE TABLE IF NOT EXISTS public.work_release_schedules (
  work_id uuid PRIMARY KEY REFERENCES public.works (id) ON DELETE CASCADE,
  schedule_status text NOT NULL DEFAULT 'ongoing',
  progress_current text,
  chapter_next_release text,
  date_next_release date,
  release_weekdays integer[] NOT NULL DEFAULT '{}',
  release_monthly boolean NOT NULL DEFAULT false,
  progress_total text,
  date_series_end date,
  date_season_end date,
  season_number text,
  chapter_control_enabled boolean NOT NULL DEFAULT true,
  official_site_label text,
  official_site_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_release_schedules_status_check CHECK (
    schedule_status IN (
      'ongoing',
      'ongoing_paid',
      'season_pause',
      'completed',
      'abandoned'
    )
  )
);

COMMENT ON TABLE public.work_release_schedules IS
  'Rythme et prochaine sortie plateforme (webtoon…) liés à une œuvre.';

CREATE INDEX IF NOT EXISTS work_release_schedules_next_date_idx
  ON public.work_release_schedules (date_next_release)
  WHERE date_next_release IS NOT NULL
    AND schedule_status = 'ongoing'
    AND chapter_control_enabled = true;

ALTER TABLE public.work_release_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_release_schedules_all_authenticated"
  ON public.work_release_schedules;
CREATE POLICY "work_release_schedules_all_authenticated"
  ON public.work_release_schedules
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
