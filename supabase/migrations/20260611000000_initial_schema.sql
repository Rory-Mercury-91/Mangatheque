-- Schéma initial Mangathèque : œuvres, tomes, propriétaires, co-achat et Mihon

-- ---------------------------------------------------------------------------
-- Propriétaires fixes du foyer
-- ---------------------------------------------------------------------------
CREATE TABLE owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO owners (name, color, sort_order) VALUES
  ('Celine', '#ec4899', 1),
  ('Sebastien', '#3b82f6', 2),
  ('Alexandre', '#22c55e', 3);

-- ---------------------------------------------------------------------------
-- Œuvres (manga, webtoon, light novel…)
-- ---------------------------------------------------------------------------
CREATE TABLE works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  -- Genre démographique : shonen, seinen, shojo, josei, kodomomuke, etc.
  demographic_type TEXT,
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
  volume_number INTEGER NOT NULL,
  cover_url TEXT,
  release_date DATE,
  purchase_date DATE,
  -- Renseigné uniquement si price_manual_override = true
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
-- has_mihon = true → ce tome est sur le compte Mihon de owner_id
--   (savoir sur quel Mihon — Celine, Sebastien ou Alexandre — l'œuvre a été téléchargée).
-- Un tome est soit acheté (has_mihon = false), soit sur Mihon (1 seul owner, has_mihon = true).
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
-- RLS (ouverte en v1 — à restreindre quand l'auth sera activée)
-- ---------------------------------------------------------------------------
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_all_v1" ON owners FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "works_all_v1" ON works FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "volumes_all_v1" ON volumes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "volume_owners_all_v1" ON volume_owners FOR ALL USING (true) WITH CHECK (true);
