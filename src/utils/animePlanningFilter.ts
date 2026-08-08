import type { AnimeAgendaRow } from "@/services/adkamiAgendaSyncService";
import { isAgendaEpisodeWatched } from "@/utils/adkamiAgendaWatched";

export type AnimePlanningFilter =
  | "unwatched"
  | "watched"
  | "library"
  | "all";

export const ANIME_PLANNING_FILTERS: readonly AnimePlanningFilter[] = [
  "unwatched",
  "watched",
  "library",
  "all",
] as const;

export const ANIME_PLANNING_FILTER_LABELS: Record<AnimePlanningFilter, string> =
  {
    unwatched: "À voir",
    watched: "Vu",
    library: "Ma liste",
    all: "Tout",
  };

const FILTER_STORAGE_KEY = "mangatheque.animePlanning.filter";
const DEFAULT_FILTER: AnimePlanningFilter = "unwatched";

/**
 * @description Indique si une sortie agenda est liée à la bibliothèque.
 * @param entry - Ligne agenda.
 */
export function isAgendaEntryInLibrary(entry: AnimeAgendaRow): boolean {
  return Boolean(entry.matched && entry.anime_id);
}

/**
 * @description Indique si l'épisode agenda est considéré comme vu.
 * @param entry - Ligne agenda.
 * @param watchedByAnimeId - Compteurs d'épisodes vus par anime_id.
 */
export function isAgendaEntryWatched(
  entry: AnimeAgendaRow,
  watchedByAnimeId: Map<string, number>,
): boolean {
  if (!entry.anime_id) return false;
  return isAgendaEpisodeWatched(
    entry.episode_number,
    watchedByAnimeId.get(entry.anime_id),
    entry.release_at,
    entry.adkami_episode_offset ?? 0,
  );
}

/**
 * @description Filtre les sorties agenda selon le mode actif.
 * @param entries - Sorties de la semaine.
 * @param filter - Mode de filtre.
 * @param watchedByAnimeId - Compteurs d'épisodes vus.
 */
export function filterAnimeAgendaEntries(
  entries: AnimeAgendaRow[],
  filter: AnimePlanningFilter,
  watchedByAnimeId: Map<string, number>,
): AnimeAgendaRow[] {
  switch (filter) {
    case "unwatched":
      return entries.filter(
        (entry) =>
          isAgendaEntryInLibrary(entry) &&
          !isAgendaEntryWatched(entry, watchedByAnimeId),
      );
    case "watched":
      return entries.filter(
        (entry) =>
          isAgendaEntryInLibrary(entry) &&
          isAgendaEntryWatched(entry, watchedByAnimeId),
      );
    case "library":
      return entries.filter((entry) => isAgendaEntryInLibrary(entry));
    case "all":
      return entries;
    default:
      return entries;
  }
}

export interface AnimePlanningFilterCounts {
  unwatched: number;
  watched: number;
  library: number;
  all: number;
}

/**
 * @description Compte les sorties par mode de filtre.
 * @param entries - Sorties de la semaine.
 * @param watchedByAnimeId - Compteurs d'épisodes vus.
 */
export function countAnimeAgendaByFilter(
  entries: AnimeAgendaRow[],
  watchedByAnimeId: Map<string, number>,
): AnimePlanningFilterCounts {
  let unwatched = 0;
  let watched = 0;
  let library = 0;
  for (const entry of entries) {
    if (!isAgendaEntryInLibrary(entry)) continue;
    library += 1;
    if (isAgendaEntryWatched(entry, watchedByAnimeId)) {
      watched += 1;
    } else {
      unwatched += 1;
    }
  }
  return {
    unwatched,
    watched,
    library,
    all: entries.length,
  };
}

/**
 * @description Lit le filtre Planning mémorisé (défaut : À voir).
 */
export function readAnimePlanningFilter(): AnimePlanningFilter {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (
      raw === "unwatched" ||
      raw === "watched" ||
      raw === "library" ||
      raw === "all"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_FILTER;
}

/**
 * @description Mémorise le filtre Planning actif.
 * @param filter - Mode choisi.
 */
export function writeAnimePlanningFilter(filter: AnimePlanningFilter): void {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, filter);
  } catch {
    /* ignore */
  }
}
