import {
  normalizeAnimeAiringStatus,
  normalizeAnimeListStatus,
} from "@/constants/animeStatus";
import type { Anime, UserAnimeProgress } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import type { AnimeStatsSnapshot, AnimeWatchItem } from "@/types/animeStats";
import { computeAnimeWatchedSeconds } from "@/utils/animeWatchTime";

/**
 * @description Pourcentage de visionnage (0–100).
 */
function computeProgressPercent(
  watched: number,
  total: number | null,
): number {
  if (total == null || total <= 0) {
    return watched > 0 ? 1 : 0;
  }
  return Math.min(100, Math.round((watched / total) * 100));
}

/**
 * @description Construit le snapshot du suivi anime pour un profil.
 * @param hiddenAnimeIds - Animés masqués à exclure des compteurs (compte courant).
 * Les séries « Pas encore diffusé » sont exclues des compteurs / carrousels,
 * mais restent dans `allItems` (export).
 */
export function buildAnimeStatsSnapshot(
  animes: Anime[],
  progressByAnimeId: Map<string, UserAnimeProgress>,
  hiddenAnimeIds: Set<string> = new Set(),
): AnimeStatsSnapshot {
  const statusCounts: AnimeStatsSnapshot["statusCounts"] = {
    watching: 0,
    completed: 0,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 0,
  };

  const allItems: AnimeWatchItem[] = [];
  const countedItems: AnimeWatchItem[] = [];
  let episodesWatched = 0;
  let episodesTotalKnown = 0;
  let watchTimeSeconds = 0;
  let completedWatchTimeSeconds = 0;
  const visibleAnimes = animes.filter((anime) => !hiddenAnimeIds.has(anime.id));

  for (const anime of visibleAnimes) {
    const progress = progressByAnimeId.get(anime.id);
    const listStatus = progress
      ? normalizeAnimeListStatus(progress.list_status)
      : "plan_to_watch";
    const watched = progress?.episodes_watched ?? 0;
    const total = anime.episodes;
    const item: AnimeWatchItem = {
      animeId: anime.id,
      title: resolveAnimeDisplayTitle(anime),
      coverUrl: anime.cover_url,
      listStatus,
      episodesWatched: watched,
      episodesTotal: total,
      progressPercent: computeProgressPercent(watched, total),
      lastActivityAt: progress?.updated_at ?? null,
    };
    allItems.push(item);

    if (normalizeAnimeAiringStatus(anime.status) === "not_yet_aired") {
      continue;
    }

    statusCounts[listStatus] += 1;
    episodesWatched += watched;
    const itemWatchSeconds = computeAnimeWatchedSeconds(anime, watched);
    watchTimeSeconds += itemWatchSeconds;
    if (listStatus === "completed") {
      // Terminé sans épisodes vus renseignés : estime via le total catalogue.
      completedWatchTimeSeconds +=
        itemWatchSeconds > 0
          ? itemWatchSeconds
          : computeAnimeWatchedSeconds(anime, total ?? 0);
    }
    if (total != null && total > 0) {
      episodesTotalKnown += total;
    }
    countedItems.push(item);
  }

  const watchingItems = countedItems
    .filter((item) => item.listStatus === "watching")
    .sort((a, b) => {
      const byPercent = b.progressPercent - a.progressPercent;
      if (byPercent !== 0) return byPercent;
      return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
    });

  /**
   * Carrousel « Derniers visionnages » : priorise les séries encore suivies
   * (en cours / en pause), pour éviter qu’un import massif de terminés
   * monopolise les 6 créneaux via updated_at.
   */
  const recentPriority = (status: AnimeWatchItem["listStatus"]): number => {
    if (status === "watching") return 0;
    if (status === "on_hold") return 1;
    if (status === "completed") return 3;
    return 2;
  };

  const recentItems = [...countedItems]
    .filter((item) => item.lastActivityAt != null && item.episodesWatched > 0)
    .sort((a, b) => {
      const byStatus = recentPriority(a.listStatus) - recentPriority(b.listStatus);
      if (byStatus !== 0) return byStatus;
      const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return bTime - aTime;
    })
    .slice(0, 6);

  return {
    libraryCount: countedItems.length,
    statusCounts,
    episodesWatched,
    episodesTotalKnown,
    watchTimeSeconds,
    completedWatchTimeSeconds,
    allItems,
    recentItems,
    watchingItems,
  };
}
