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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN owners.badge_label IS
  'Texte affiché sur les pastilles (1–4 car.). Null = initiale du prénom.';

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
  volumes_vf_count INTEGER,
  volumes_vo_total INTEGER,
  default_price NUMERIC(10, 2),
  price_format TEXT NOT NULL DEFAULT 'broche'
    CHECK (price_format IN ('broche', 'numerique')),
  synopsis TEXT,
  cover_url TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_works_title ON works (title);

-- ---------------------------------------------------------------------------
-- Tomes
-- ---------------------------------------------------------------------------
CREATE TABLE volumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  volume_number INTEGER,
  volume_label TEXT,
  cover_url TEXT,
  release_date DATE,
  purchase_date DATE,
  purchase_price NUMERIC(10, 2),
  price_manual_override BOOLEAN NOT NULL DEFAULT false,
  edition_type TEXT NOT NULL DEFAULT 'classic'
    CHECK (edition_type IN ('classic', 'collector')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_id, volume_number)
);

CREATE INDEX idx_volumes_work_id ON volumes (work_id);

-- ---------------------------------------------------------------------------
-- Propriétaires par tome (achat physique et/ou compte Mihon)
-- has_mihon = true → tome sur le compte Mihon de owner_id (0 € dépensé).
-- Calcul financier : src/services/volumePriceService.ts
-- ---------------------------------------------------------------------------
CREATE TABLE volume_owners (
  volume_id UUID NOT NULL REFERENCES volumes (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners (id) ON DELETE CASCADE,
  has_mihon BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (volume_id, owner_id)
);

CREATE INDEX idx_volume_owners_owner ON volume_owners (owner_id);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_email ON profiles (email);

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
ALTER TABLE volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_authenticated" ON owners
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "works_authenticated" ON works
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "volumes_authenticated" ON volumes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "volume_owners_authenticated" ON volume_owners
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

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

-- ---------------------------------------------------------------------------
-- Synchronisation temps réel (desktop + mobile)
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.owners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.works;
ALTER PUBLICATION supabase_realtime ADD TABLE public.volumes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.volume_owners;
