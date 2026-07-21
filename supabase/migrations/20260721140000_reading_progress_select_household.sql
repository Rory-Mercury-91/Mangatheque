-- Lecture foyer : SELECT partagé, écritures toujours privées au compte auth.

DROP POLICY IF EXISTS "user_volume_reads_select_own" ON user_volume_reads;
CREATE POLICY "user_volume_reads_select_household" ON user_volume_reads
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "user_work_chapter_progress_select_own" ON user_work_chapter_progress;
CREATE POLICY "user_work_chapter_progress_select_household" ON user_work_chapter_progress
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "user_work_reading_state_select_own" ON user_work_reading_state;
CREATE POLICY "user_work_reading_state_select_household" ON user_work_reading_state
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE user_volume_reads IS
  'Tomes lus : lecture visible au foyer (SELECT), écriture réservée au propriétaire auth.';

COMMENT ON TABLE user_work_chapter_progress IS
  'Progression chapitres : lecture visible au foyer (SELECT), écriture réservée au propriétaire auth.';

COMMENT ON TABLE user_work_reading_state IS
  'État abandonnée : lecture visible au foyer (SELECT), écriture réservée au propriétaire auth.';
