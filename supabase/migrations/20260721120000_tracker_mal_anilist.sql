-- Trackers MAL / AniList : IDs œuvre + tokens OAuth par compte auth.

ALTER TABLE works
  ADD COLUMN IF NOT EXISTS mal_id INTEGER,
  ADD COLUMN IF NOT EXISTS anilist_id INTEGER;

COMMENT ON COLUMN works.mal_id IS
  'Identifiant manga MyAnimeList (lien tracker).';
COMMENT ON COLUMN works.anilist_id IS
  'Identifiant media AniList (lien tracker).';

CREATE INDEX IF NOT EXISTS idx_works_mal_id ON works (mal_id)
  WHERE mal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_works_anilist_id ON works (anilist_id)
  WHERE anilist_id IS NOT NULL;

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

COMMENT ON TABLE user_tracker_accounts IS
  'Comptes MAL / AniList liés au compte auth (tokens privés, RLS).';

CREATE INDEX idx_user_tracker_accounts_provider
  ON user_tracker_accounts (provider);

ALTER TABLE user_tracker_accounts ENABLE ROW LEVEL SECURITY;

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
