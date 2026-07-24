import type { AnimeStatsSnapshot } from "@/types/animeStats";
import "@/features/reading-stats/ReadingStatsOverview.css";

export interface AnimeStatsOverviewProps {
  snapshot: AnimeStatsSnapshot;
}

/**
 * @description Cartes d'aperçu du suivi anime (même look que le suivi lecture).
 */
export function AnimeStatsOverview({ snapshot }: AnimeStatsOverviewProps) {
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
        <span className="reading-stats-card-label">Terminés</span>
        <strong>{snapshot.statusCounts.completed}</strong>
      </article>
    </div>
  );
}
