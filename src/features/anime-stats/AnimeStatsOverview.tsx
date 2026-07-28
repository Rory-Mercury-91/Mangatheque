import { useWatchDurationUnit } from "@/hooks/useWatchDurationUnit";
import { WatchTimeValue } from "@/features/anime-stats/WatchTimeValue";
import type { AnimeStatsSnapshot } from "@/types/animeStats";
import { formatWatchDurationByUnit } from "@/utils/animeWatchTime";
import "@/features/reading-stats/ReadingStatsOverview.css";

export interface AnimeStatsOverviewProps {
  snapshot: AnimeStatsSnapshot;
}

/**
 * @description Cartes d'aperçu du suivi anime (même look que le suivi lecture).
 */
export function AnimeStatsOverview({ snapshot }: AnimeStatsOverviewProps) {
  const [unit] = useWatchDurationUnit();
  const completedWatchLabel = formatWatchDurationByUnit(
    snapshot.completedWatchTimeSeconds,
    unit,
  );

  return (
    <div className="reading-stats-overview">
      <article className="reading-stats-card">
        <span className="reading-stats-card-label">Séries bibliothèque</span>
        <strong>{snapshot.libraryCount}</strong>
      </article>
      <article className="reading-stats-card reading-stats-card--accent">
        <span className="reading-stats-card-label">En cours</span>
        <strong>{snapshot.statusCounts.watching}</strong>
      </article>
      <article className="reading-stats-card">
        <span className="reading-stats-card-label">Épisodes vus</span>
        <strong>
          {snapshot.episodesWatched}
          {snapshot.episodesTotalKnown > 0 ? (
            <>
              <span className="reading-stats-card-sep"> / </span>
              {snapshot.episodesTotalKnown}
            </>
          ) : null}
        </strong>
      </article>
      <article className="reading-stats-card">
        <span className="reading-stats-card-label">Temps visionné</span>
        <WatchTimeValue seconds={snapshot.watchTimeSeconds} variant="stats" />
      </article>
      <article
        className="reading-stats-card"
        title="Temps des fiches au statut Terminé (durée MAL × épisodes)"
      >
        <span className="reading-stats-card-label">Terminés</span>
        <strong>{snapshot.statusCounts.completed}</strong>
        {snapshot.completedWatchTimeSeconds > 0 ? (
          <span className="reading-stats-card-sub">
            {completedWatchLabel}
          </span>
        ) : null}
      </article>
    </div>
  );
}
