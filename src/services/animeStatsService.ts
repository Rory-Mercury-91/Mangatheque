import { normalizeAnimeListStatus } from "@/constants/animeStatus";
import type { Anime, UserAnimeProgress } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import type { AnimeStatsSnapshot, AnimeWatchItem } from "@/types/animeStats";

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
 */
export function buildAnimeStatsSnapshot(
  animes: Anime[],
  progressByAnimeId: Map<string, UserAnimeProgress>,
): AnimeStatsSnapshot {
  const statusCounts: AnimeStatsSnapshot["statusCounts"] = {
    watching: 0,
    completed: 0,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 0,
  };

  const allItems: AnimeWatchItem[] = [];
  let episodesWatched = 0;
  let episodesTotalKnown = 0;

  for (const anime of animes) {
    const progress = progressByAnimeId.get(anime.id);
    const listStatus = progress
      ? normalizeAnimeListStatus(progress.list_status)
      : "plan_to_watch";
    const watched = progress?.episodes_watched ?? 0;
    const total = anime.episodes;
    statusCounts[listStatus] += 1;
    episodesWatched += watched;
    if (total != null && total > 0) {
      episodesTotalKnown += total;
    }

    allItems.push({
      animeId: anime.id,
      title: resolveAnimeDisplayTitle(anime),
      coverUrl: anime.cover_url,
      listStatus,
      episodesWatched: watched,
      episodesTotal: total,
      progressPercent: computeProgressPercent(watched, total),
      lastActivityAt: progress?.updated_at ?? null,
    });
  }

  const watchingItems = allItems
    .filter((item) => item.listStatus === "watching")
    .sort((a, b) => {
      const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return bTime - aTime;
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

  const recentItems = [...allItems]
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
    libraryCount: animes.length,
    statusCounts,
    episodesWatched,
    episodesTotalKnown,
    allItems,
    recentItems,
    watchingItems,
  };
}
