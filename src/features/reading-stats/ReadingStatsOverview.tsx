import type { ReadingStatsSnapshot } from "@/types/readingStats";
import "./ReadingStatsOverview.css";

export interface ReadingStatsOverviewProps {
  snapshot: ReadingStatsSnapshot;
}

/**
 * @description Cartes d'aperçu : bibliothèque, possession, tomes et chapitres.
 */
export function ReadingStatsOverview({ snapshot }: ReadingStatsOverviewProps) {
  return (
    <div className="reading-stats-overview">
      <article className="reading-stats-card">
        <span className="reading-stats-card-label">Séries bibliothèque</span>
        <strong>{snapshot.libraryWorkCount}</strong>
      </article>
      <article className="reading-stats-card reading-stats-card--accent">
        <span className="reading-stats-card-label">Séries possédées</span>
        <strong>{snapshot.ownedWorkCount}</strong>
      </article>
      <article className="reading-stats-card">
        <span className="reading-stats-card-label">Tomes lus</span>
        <strong>
          {snapshot.volumesRead}
          <span className="reading-stats-card-sep"> / </span>
          {snapshot.volumesTotal}
        </strong>
      </article>
      <article className="reading-stats-card">
        <span className="reading-stats-card-label">Chapitres lus</span>
        <strong>
          {snapshot.chaptersRead}
          <span className="reading-stats-card-sep"> / </span>
          {snapshot.chaptersTotal}
        </strong>
      </article>
    </div>
  );
}
