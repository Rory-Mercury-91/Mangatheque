import type { UserReadingStatus } from "@/constants/userReadingStatus";
import {
  getUserReadingStatusColor,
  getUserReadingStatusLabel,
} from "@/constants/userReadingStatus";
import type { ReadingStatsSnapshot } from "@/types/readingStats";
import "./ReadingStatusBreakdown.css";

const PRIMARY_STATUSES: UserReadingStatus[] = [
  "to_read",
  "ongoing",
  "completed",
];

const STATUS_HEADINGS: Record<UserReadingStatus, string> = {
  to_read: "Non commencé",
  ongoing: "En cours",
  completed: "Terminé",
  abandoned: "Abandonnée",
};

export interface ReadingStatusBreakdownProps {
  snapshot: ReadingStatsSnapshot;
  onStatusClick?: (status: UserReadingStatus) => void;
}

/**
 * @description Répartition des séries par statut « Ma lecture ».
 */
export function ReadingStatusBreakdown({
  snapshot,
  onStatusClick,
}: ReadingStatusBreakdownProps) {
  const cards = [...PRIMARY_STATUSES];
  if (snapshot.statusCounts.abandoned > 0) {
    cards.push("abandoned");
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
              style={{ background: getUserReadingStatusColor(status) }}
              aria-hidden
            />
            <span className="reading-status-card-label">
              {STATUS_HEADINGS[status]}
            </span>
            <strong>{count}</strong>
            <span className="reading-status-card-hint">
              {getUserReadingStatusLabel(status)}
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
            aria-label={`Voir les séries : ${STATUS_HEADINGS[status]}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
