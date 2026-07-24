import type { AnimeListStatus } from "@/types/anime";

/** Ligne animé pour listes et carrousel du suivi visionnage. */
export interface AnimeWatchItem {
  animeId: string;
  title: string;
  coverUrl: string | null;
  listStatus: AnimeListStatus;
  episodesWatched: number;
  episodesTotal: number | null;
  progressPercent: number;
  lastActivityAt: string | null;
}

/** Agrégat affiché sur la page suivi anime. */
export interface AnimeStatsSnapshot {
  libraryCount: number;
  statusCounts: Record<AnimeListStatus, number>;
  episodesWatched: number;
  episodesTotalKnown: number;
  allItems: AnimeWatchItem[];
  recentItems: AnimeWatchItem[];
  watchingItems: AnimeWatchItem[];
}
