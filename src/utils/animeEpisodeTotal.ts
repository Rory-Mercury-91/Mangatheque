import { normalizeEpisodeCount } from "@/utils/adkamiAgendaWatched";

/** Total d'épisodes provisoire (1 cour) si MAL/Jikan ne le publient pas encore. */
export const DEFAULT_UNKNOWN_ANIME_EPISODE_TOTAL = 12;

const MEDIA_WITHOUT_DEFAULT = new Set(["movie", "music"]);

/**
 * @description Indique si le total API est inconnu (null, NaN ou ≤ 0 — cas MAL « Unknown »).
 */
export function isUnknownAnimeEpisodeTotal(
  episodes: number | null | undefined,
): boolean {
  const n = Number(episodes);
  return !Number.isFinite(n) || n <= 0;
}

/**
 * @description Résout le total d'épisodes catalogue.
 * Si l'API fournit un total > 0, il est conservé (ajustement à la hausse ou à la baisse).
 * Sinon, pour les formats série (TV, ONA…), applique le défaut 12.
 * Films / musique : laisse null si inconnu.
 * @param episodes - Total brut MAL/Jikan/XML (0 = inconnu côté MAL).
 * @param mediaType - Type média (`tv`, `movie`…).
 */
export function resolveAnimeEpisodeTotal(
  episodes: number | null | undefined,
  mediaType?: string | null,
): number | null {
  if (!isUnknownAnimeEpisodeTotal(episodes)) {
    return normalizeEpisodeCount(Number(episodes));
  }
  const media = (mediaType ?? "tv").trim().toLowerCase().replace(/\s+/g, "_");
  if (MEDIA_WITHOUT_DEFAULT.has(media)) {
    return null;
  }
  return DEFAULT_UNKNOWN_ANIME_EPISODE_TOTAL;
}

/**
 * @description Fusionne total local et total API.
 * L'API gagne dès qu'elle connaît le total ; sinon on conserve le local ou le défaut 12.
 */
export function mergeAnimeEpisodeTotal(
  existing: number | null | undefined,
  fromApi: number | null | undefined,
  mediaType?: string | null,
): number | null {
  if (!isUnknownAnimeEpisodeTotal(fromApi)) {
    return resolveAnimeEpisodeTotal(fromApi, mediaType);
  }
  if (!isUnknownAnimeEpisodeTotal(existing)) {
    return normalizeEpisodeCount(Number(existing));
  }
  return resolveAnimeEpisodeTotal(null, mediaType);
}
