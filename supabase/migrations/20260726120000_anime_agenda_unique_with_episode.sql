-- Si la contrainte (adkami_id, release_at) a déjà été appliquée, on la rétablit
-- avec le n° d'épisode pour autoriser 2 sorties distinctes au même horaire.
ALTER TABLE anime_agenda_entries
  DROP CONSTRAINT IF EXISTS anime_agenda_entries_unique;

ALTER TABLE anime_agenda_entries
  ADD CONSTRAINT anime_agenda_entries_unique
    UNIQUE (adkami_id, episode_number, release_at);
