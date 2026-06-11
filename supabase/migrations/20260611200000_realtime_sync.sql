-- Active la synchronisation temps réel Supabase pour les données partagées du foyer.
alter publication supabase_realtime add table public.owners;
alter publication supabase_realtime add table public.works;
alter publication supabase_realtime add table public.volumes;
alter publication supabase_realtime add table public.volume_owners;
