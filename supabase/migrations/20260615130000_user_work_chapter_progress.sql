-- Progression de lecture au niveau série pour les œuvres suivies par chapitres.

CREATE TABLE user_work_chapter_progress (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  chapters_read INTEGER NOT NULL DEFAULT 0 CHECK (chapters_read >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id)
);

CREATE INDEX idx_user_work_chapter_progress_work_id
  ON user_work_chapter_progress (work_id);

COMMENT ON TABLE user_work_chapter_progress IS
  'Nombre de chapitres lus (suivi série) par compte auth — privé, non partagé.';

ALTER TABLE user_work_chapter_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_work_chapter_progress_select_own" ON user_work_chapter_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

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
