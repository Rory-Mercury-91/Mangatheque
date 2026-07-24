-- Mangathèque — schéma complet (création d'un projet Supabase vierge)
-- Exécuter une seule fois dans le SQL Editor Supabase.
-- Prérequis : projet Supabase avec Auth activée.

-- ---------------------------------------------------------------------------
-- Propriétaires fixes du foyer
-- ---------------------------------------------------------------------------
CREATE TABLE owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  badge_label TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  linked_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN owners.badge_label IS
  'Texte affiché sur les pastilles (1–4 car.). Null = initiale du prénom.';

COMMENT ON COLUMN owners.linked_user_id IS
  'Compte Supabase associé au propriétaire (journal, favoris par défaut, etc.).';

CREATE UNIQUE INDEX idx_owners_linked_user_id
  ON owners (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

INSERT INTO owners (name, color, sort_order) VALUES
  ('Céline', '#ec4899', 1),
  ('Sébastien', '#3b82f6', 2),
  ('Alexandre', '#22c55e', 3);

-- ---------------------------------------------------------------------------
-- Œuvres (manga, webtoon, light novel…)
-- ---------------------------------------------------------------------------
CREATE TABLE works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  demographic_type TEXT,
  reading_status TEXT NOT NULL DEFAULT 'ongoing'
    CHECK (reading_status IN ('ongoing', 'dropped', 'completed', 'on_hold')),
  genres TEXT[] NOT NULL DEFAULT '{}',
  themes TEXT[] NOT NULL DEFAULT '{}',
  publisher_vf TEXT,
  publisher_vf_chapter TEXT,
  volumes_vf_count INTEGER,
  volumes_vo_total INTEGER,
  chapters_vf_count INTEGER,
  chapters_vo_total INTEGER,
  has_volume_tracking BOOLEAN NOT NULL DEFAULT true,
  has_chapter_tracking BOOLEAN NOT NULL DEFAULT false,
  tracking_unit TEXT NOT NULL DEFAULT 'volume'
    CHECK (tracking_unit IN ('volume', 'chapter')),
  default_price NUMERIC(10, 2),
  price_format TEXT NOT NULL DEFAULT 'broche'
    CHECK (price_format IN ('broche', 'numerique')),
  chapter_price_format TEXT
    CHECK (
      chapter_price_format IS NULL
      OR chapter_price_format IN ('broche', 'numerique')
    ),
  synopsis TEXT,
  cover_url TEXT,
  source_url TEXT,
  mal_id INTEGER,
  anilist_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_works_title ON works (title);
CREATE INDEX idx_works_chapter_tracking ON works (has_chapter_tracking)
  WHERE has_chapter_tracking = true;
CREATE INDEX idx_works_mal_id ON works (mal_id) WHERE mal_id IS NOT NULL;
CREATE INDEX idx_works_anilist_id ON works (anilist_id) WHERE anilist_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Animés (catalogue foyer, sans possession)
-- ---------------------------------------------------------------------------
CREATE TABLE animes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mal_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  title_en TEXT,
  title_ja TEXT,
  title_fr TEXT,
  cover_url TEXT,
  media_type TEXT,
  source TEXT,
  status TEXT,
  season TEXT,
  year INTEGER,
  episodes INTEGER,
  duration_seconds INTEGER,
  broadcast_day TEXT,
  broadcast_time TEXT,
  rating TEXT,
  nsfw TEXT,
  synopsis TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  themes TEXT[] NOT NULL DEFAULT '{}',
  demographics TEXT[] NOT NULL DEFAULT '{}',
  explicit_genres TEXT[] NOT NULL DEFAULT '{}',
  studios TEXT[] NOT NULL DEFAULT '{}',
  streaming JSONB NOT NULL DEFAULT '[]'::jsonb,
  pictures JSONB NOT NULL DEFAULT '[]'::jsonb,
  related JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  adkami_id INTEGER,
  adkami_section TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT animes_mal_id_unique UNIQUE (mal_id)
);

CREATE INDEX idx_animes_title ON animes (title);
CREATE INDEX idx_animes_adkami_id ON animes (adkami_id) WHERE adkami_id IS NOT NULL;

CREATE TABLE user_anime_progress (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  anime_id UUID NOT NULL REFERENCES animes (id) ON DELETE CASCADE,
  list_status TEXT NOT NULL DEFAULT 'plan_to_watch'
    CHECK (list_status IN (
      'watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch'
    )),
  episodes_watched INTEGER NOT NULL DEFAULT 0 CHECK (episodes_watched >= 0),
  started_at DATE,
  finished_at DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anime_id)
);

CREATE INDEX idx_user_anime_progress_anime ON user_anime_progress (anime_id);

-- ---------------------------------------------------------------------------
-- Tomes
-- ---------------------------------------------------------------------------
CREATE TABLE volumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  volume_number NUMERIC(6, 2),
  volume_label TEXT,
  cover_url TEXT,
  release_date DATE,
  purchase_price NUMERIC(10, 2),
  price_manual_override BOOLEAN NOT NULL DEFAULT false,
  edition_type TEXT NOT NULL DEFAULT 'classic'
    CHECK (edition_type IN ('classic', 'collector')),
  shared_purchase BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_volumes_work_number_edition
  ON volumes (work_id, volume_number, edition_type)
  WHERE volume_number IS NOT NULL;

CREATE UNIQUE INDEX idx_volumes_work_label_edition
  ON volumes (work_id, volume_label, edition_type)
  WHERE volume_number IS NULL
    AND volume_label IS NOT NULL
    AND btrim(volume_label) <> '';

CREATE INDEX idx_volumes_work_id ON volumes (work_id);

COMMENT ON COLUMN volumes.shared_purchase IS
  'Co-achat partagé : coût divisé entre les acheteurs si plusieurs comptes.';

-- ---------------------------------------------------------------------------
-- Propriétaires par tome (achat physique et/ou compte Mihon)
-- has_mihon = présence sur Mihon ; has_purchase = participation au coût physique.
-- Les deux peuvent être true pour le même propriétaire (coût physique, pas d'économie Mihon).
-- Calcul financier : src/services/volumePriceService.ts
-- ---------------------------------------------------------------------------
CREATE TABLE volume_owners (
  volume_id UUID NOT NULL REFERENCES volumes (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  has_mihon BOOLEAN NOT NULL DEFAULT false,
  has_purchase BOOLEAN NOT NULL DEFAULT true,
  copy_count INTEGER NOT NULL DEFAULT 1 CHECK (copy_count >= 1),
  PRIMARY KEY (volume_id, owner_id)
);

COMMENT ON COLUMN volume_owners.has_mihon IS
  'Présence sur le compte Mihon du propriétaire. Si has_purchase est aussi true, le coût reste physique.';

COMMENT ON COLUMN volume_owners.has_purchase IS
  'Achat physique (participation au coût). Peut être true en même temps que has_mihon.';

COMMENT ON COLUMN volume_owners.copy_count IS
  'Exemplaires achetés par ce propriétaire (coût = prix unitaire × copy_count).';

CREATE INDEX idx_volume_owners_owner ON volume_owners (owner_id);

-- ---------------------------------------------------------------------------
-- Favoris partagés par propriétaire du foyer
-- ---------------------------------------------------------------------------
CREATE TABLE work_favorites (
  work_id UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, owner_id)
);

CREATE INDEX idx_work_favorites_owner ON work_favorites (owner_id);

-- ---------------------------------------------------------------------------
-- Favoris anime par propriétaire du foyer
-- ---------------------------------------------------------------------------
CREATE TABLE anime_favorites (
  anime_id UUID NOT NULL REFERENCES animes (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anime_id, owner_id)
);

CREATE INDEX idx_anime_favorites_owner ON anime_favorites (owner_id);

-- ---------------------------------------------------------------------------
-- Agenda ADKami (sorties d'épisodes de la semaine)
-- ---------------------------------------------------------------------------
CREATE TABLE anime_agenda_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adkami_id INTEGER NOT NULL,
  anime_id UUID REFERENCES animes (id) ON DELETE CASCADE,
  episode_number INTEGER,
  episode_label TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  release_at TIMESTAMPTZ NOT NULL,
  day_label TEXT,
  cover_url TEXT,
  page_url TEXT,
  matched BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT anime_agenda_entries_unique
    UNIQUE (adkami_id, episode_number, release_at)
);

CREATE INDEX idx_anime_agenda_release ON anime_agenda_entries (release_at);
CREATE INDEX idx_anime_agenda_anime ON anime_agenda_entries (anime_id)
  WHERE anime_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Journal des actions sensibles (suppressions, restaurations…)
-- ---------------------------------------------------------------------------
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_title TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  user_email TEXT,
  restored_at TIMESTAMPTZ,
  restored_by_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  restored_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_created_at ON activity_logs (created_at DESC);
CREATE INDEX idx_activity_logs_action_type ON activity_logs (action_type);
CREATE INDEX idx_activity_logs_user_id ON activity_logs (user_id);

-- ---------------------------------------------------------------------------
-- Profils des comptes du foyer (filtres journal, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  planning_seen_at TIMESTAMPTZ,
  library_default_sort TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_email ON profiles (email);

-- ---------------------------------------------------------------------------
-- Lecture privée par compte (non partagée entre utilisateurs)
-- ---------------------------------------------------------------------------
CREATE TABLE user_volume_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  volume_id UUID NOT NULL REFERENCES volumes (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, volume_id)
);

CREATE INDEX idx_user_volume_reads_user_id ON user_volume_reads (user_id);
CREATE INDEX idx_user_volume_reads_volume_id ON user_volume_reads (volume_id);

CREATE TABLE user_work_chapter_progress (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  chapters_read INTEGER NOT NULL DEFAULT 0 CHECK (chapters_read >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id)
);

CREATE INDEX idx_user_work_chapter_progress_work_id
  ON user_work_chapter_progress (work_id);

-- ---------------------------------------------------------------------------
-- Trackers MAL / AniList (tokens privés par compte auth)
-- ---------------------------------------------------------------------------
CREATE TABLE user_tracker_accounts (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('mal', 'anilist')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  external_user_id TEXT,
  external_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

CREATE INDEX idx_user_tracker_accounts_provider
  ON user_tracker_accounts (provider);

-- ---------------------------------------------------------------------------
-- Mise à jour automatique de updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER works_updated_at
  BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER volumes_updated_at
  BEFORE UPDATE ON volumes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Profil auto-créé à l'inscription
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Comptes déjà inscrits avant l'exécution de ce script
INSERT INTO profiles (id, email)
SELECT id, email
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;

-- ---------------------------------------------------------------------------
-- Row Level Security (utilisateurs authentifiés uniquement)
-- ---------------------------------------------------------------------------
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE animes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_anime_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE anime_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE anime_agenda_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_volume_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_work_chapter_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tracker_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_authenticated" ON owners
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "works_authenticated" ON works
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "animes_authenticated" ON animes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "user_anime_progress_select_household" ON user_anime_progress
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "user_anime_progress_insert_own" ON user_anime_progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_anime_progress_update_own" ON user_anime_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_anime_progress_delete_own" ON user_anime_progress
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "volumes_authenticated" ON volumes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "volume_owners_authenticated" ON volume_owners
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "work_favorites_authenticated" ON work_favorites
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anime_favorites_authenticated" ON anime_favorites
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anime_agenda_entries_authenticated" ON anime_agenda_entries
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "activity_logs_authenticated" ON activity_logs
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "profiles_read_authenticated" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "user_volume_reads_select_household" ON user_volume_reads
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "user_volume_reads_insert_own" ON user_volume_reads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_volume_reads_update_own" ON user_volume_reads
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_volume_reads_delete_own" ON user_volume_reads
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_work_chapter_progress_select_household" ON user_work_chapter_progress
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "user_work_chapter_progress_insert_own" ON user_work_chapter_progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_work_chapter_progress_update_own" ON user_work_chapter_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_work_chapter_progress_delete_own" ON user_work_chapter_progress
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_tracker_accounts_select_own" ON user_tracker_accounts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_tracker_accounts_insert_own" ON user_tracker_accounts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_tracker_accounts_update_own" ON user_tracker_accounts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_tracker_accounts_delete_own" ON user_tracker_accounts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Synchronisation temps réel (desktop + mobile)
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.owners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.works;
ALTER PUBLICATION supabase_realtime ADD TABLE public.animes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_anime_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE public.volumes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.volume_owners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_favorites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.anime_favorites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.anime_agenda_entries;
