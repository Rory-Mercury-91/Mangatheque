import {
  ANIME_LIST_STATUS_COLORS,
  ANIME_LIST_STATUS_LABELS,
} from "@/constants/animeStatus";
import type { AnimeListStatus } from "@/types/anime";
import type { AnimeStatsSnapshot } from "@/types/animeStats";
import "@/features/reading-stats/ReadingStatusBreakdown.css";

const PRIMARY_STATUSES: AnimeListStatus[] = [
  "plan_to_watch",
  "watching",
  "completed",
];

/** Titres courts des cartes (alignés sur le suivi lectures). */
const STATUS_HEADINGS: Record<AnimeListStatus, string> = {
  plan_to_watch: "Non commencé",
  watching: "En cours",
  completed: "Terminé",
  on_hold: "En pause",
  dropped: "Abandonné",
};

export interface AnimeStatusBreakdownProps {
  snapshot: AnimeStatsSnapshot;
  onStatusClick?: (status: AnimeListStatus) => void;
}

/**
 * @description Répartition des animés par statut de visionnage.
 */
export function AnimeStatusBreakdown({
  snapshot,
  onStatusClick,
}: AnimeStatusBreakdownProps) {
  const cards = [...PRIMARY_STATUSES];
  if (snapshot.statusCounts.on_hold > 0) {
    cards.push("on_hold");
  }
  if (snapshot.statusCounts.dropped > 0) {
    cards.push("dropped");
  }

  return (
    <div className="reading-status-breakdown">
      {cards.map((status) => {
        const count = snapshot.statusCounts[status];
        const clickable = Boolean(onStatusClick);
        const className = [
          "reading-status-card",
          clickable ? "reading-status-card--clickable" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const content = (
          <>
            <span
              className="reading-status-card-dot"
              style={{ background: ANIME_LIST_STATUS_COLORS[status] }}
              aria-hidden
            />
            <span className="reading-status-card-label">
              {STATUS_HEADINGS[status]}
            </span>
            <strong>{count}</strong>
            <span className="reading-status-card-hint">
              {ANIME_LIST_STATUS_LABELS[status]}
            </span>
          </>
        );

        if (!clickable) {
          return (
            <article key={status} className={className}>
              {content}
            </article>
          );
        }

        return (
          <button
            key={status}
            type="button"
            className={className}
            onClick={() => onStatusClick?.(status)}
            aria-label={`Voir les animés : ${ANIME_LIST_STATUS_LABELS[status]}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
