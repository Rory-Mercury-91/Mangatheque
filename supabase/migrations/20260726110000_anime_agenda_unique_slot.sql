-- Déduplique uniquement les vrais doublons (même id + horaire + n° d'épisode).
-- Deux épisodes distincts au même horaire (ex. Bai Ri Cheng Wang 3 et 4) restent.
ALTER TABLE anime_agenda_entries
  DROP CONSTRAINT IF EXISTS anime_agenda_entries_unique;

DELETE FROM anime_agenda_entries a
USING anime_agenda_entries b
WHERE a.adkami_id = b.adkami_id
  AND a.release_at = b.release_at
  AND a.id <> b.id
  AND COALESCE(a.episode_number, -1) = COALESCE(b.episode_number, -1)
  AND a.id::text < b.id::text;

ALTER TABLE anime_agenda_entries
  ADD CONSTRAINT anime_agenda_entries_unique
    UNIQUE (adkami_id, episode_number, release_at);
