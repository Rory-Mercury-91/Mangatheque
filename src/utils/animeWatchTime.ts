/**
 * Utilitaires de temps de visionnage (durée MAL × épisodes).
 */

/** Unité d’affichage du temps visionné. */
export type WatchDurationUnit = "months" | "days" | "hours";

export const WATCH_DURATION_UNITS: Array<{
  id: WatchDurationUnit;
  label: string;
  title: string;
}> = [
  { id: "months", label: "Mois", title: "Afficher en mois" },
  { id: "days", label: "Jours", title: "Afficher en jours" },
  { id: "hours", label: "Heures", title: "Afficher en heures" },
];

const MONTH_SECONDS = 30 * 24 * 3600;
const DAY_SECONDS = 24 * 3600;
const HOUR_SECONDS = 3600;

/**
 * @description Durée d’un épisode en secondes (null si inconnue / invalide).
 */
export function animeEpisodeDurationSeconds(
  anime: { duration_seconds?: number | null },
): number | null {
  const duration = Number(anime.duration_seconds);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return duration;
}

/**
 * @description Secondes visionnées pour une fiche (épisodes vus × durée épisode).
 * @param episodesWatched - Progression (demi-épisodes supportés).
 */
export function computeAnimeWatchedSeconds(
  anime: { duration_seconds?: number | null },
  episodesWatched: number,
): number {
  const duration = animeEpisodeDurationSeconds(anime);
  const watched = Number(episodesWatched);
  if (duration == null || !Number.isFinite(watched) || watched <= 0) {
    return 0;
  }
  return watched * duration;
}

/**
 * @description Agrège le temps visionné sur un catalogue + progressions.
 * Ignore les fiches sans durée MAL connue.
 */
export function sumAnimeWatchedSeconds(
  entries: Array<{
    anime: { duration_seconds?: number | null };
    episodesWatched: number;
  }>,
): number {
  let total = 0;
  for (const entry of entries) {
    total += computeAnimeWatchedSeconds(entry.anime, entry.episodesWatched);
  }
  return total;
}

/**
 * @description Libellé FR compact d’une durée de visionnage (auto).
 * Ex. `45 min`, `12 h 30`, `42 j 6 h`.
 */
export function formatWatchDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (seconds < 60) {
    return seconds <= 0 ? "0 min" : `${seconds} s`;
  }

  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 48) {
    return remMinutes > 0
      ? `${totalHours} h ${remMinutes} min`
      : `${totalHours} h`;
  }

  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days} j ${remHours} h` : `${days} j`;
}

/**
 * @description Formate le temps visionné dans une unité choisie (M / J / H).
 */
export function formatWatchDurationByUnit(
  totalSeconds: number,
  unit: WatchDurationUnit,
): string {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (unit === "hours") {
    return `${formatWatchAmount(seconds / HOUR_SECONDS)} h`;
  }
  if (unit === "days") {
    return `${formatWatchAmount(seconds / DAY_SECONDS)} j`;
  }
  return `${formatWatchAmount(seconds / MONTH_SECONDS)} m`;
}

/**
 * @description Nombre lisible (1 décimale si &lt; 10, sinon entier).
 */
function formatWatchAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 10) {
    return value.toLocaleString("fr-FR", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    });
  }
  return Math.round(value).toLocaleString("fr-FR");
}

/**
 * @description Indique si la clé est une unité de durée valide.
 */
export function isWatchDurationUnit(value: string): value is WatchDurationUnit {
  return value === "months" || value === "days" || value === "hours";
}
