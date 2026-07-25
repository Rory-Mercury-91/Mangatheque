-- Numéros d'épisode ADKami / progression : support des demi-épisodes (ex. 36.5).
ALTER TABLE anime_agenda_entries
  ALTER COLUMN episode_number TYPE NUMERIC
  USING episode_number::numeric;

ALTER TABLE user_anime_progress
  ALTER COLUMN episodes_watched TYPE NUMERIC
  USING episodes_watched::numeric;

ALTER TABLE user_anime_progress
  DROP CONSTRAINT IF EXISTS user_anime_progress_episodes_watched_check;

ALTER TABLE user_anime_progress
  ADD CONSTRAINT user_anime_progress_episodes_watched_check
  CHECK (episodes_watched >= 0);

-- Offset ADKami : peut aussi être un demi (rare, mais cohérent).
ALTER TABLE animes
  ALTER COLUMN adkami_episode_offset TYPE NUMERIC
  USING adkami_episode_offset::numeric;
