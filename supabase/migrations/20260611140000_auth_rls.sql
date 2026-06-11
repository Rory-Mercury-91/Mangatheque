-- Restriction RLS : seuls les utilisateurs authentifiés peuvent lire/écrire.

DROP POLICY IF EXISTS "owners_all_v1" ON owners;
DROP POLICY IF EXISTS "works_all_v1" ON works;
DROP POLICY IF EXISTS "volumes_all_v1" ON volumes;
DROP POLICY IF EXISTS "volume_owners_all_v1" ON volume_owners;
DROP POLICY IF EXISTS "activity_logs_all_v1" ON activity_logs;

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
