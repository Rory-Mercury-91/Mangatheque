import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import { getUserReadingStatusColor } from "@/constants/userReadingStatus";
import type { ReadingWorkItem } from "@/types/readingStats";
import { formatDateFr } from "@/utils/dateFormat";
import "./RecentReadingCarousel.css";

export interface RecentReadingCarouselProps {
  items: ReadingWorkItem[];
}

const RECENT_READING_DISPLAY_LIMIT = 6;

/**
 * @description Carrousel des 6 dernières lectures (grille responsive).
 */
export function RecentReadingCarousel({ items }: RecentReadingCarouselProps) {
  const navigate = useNavigate();
  const visibleItems = items.slice(0, RECENT_READING_DISPLAY_LIMIT);

  if (visibleItems.length === 0) {
    return (
      <p className="reading-carousel-empty">
        Aucune lecture récente enregistrée pour ce compte.
      </p>
    );
  }

  return (
    <div className="reading-carousel">
      <div className="reading-carousel-track">
        {visibleItems.map((item) => (
          <button
            key={item.workId}
            type="button"
            className="reading-carousel-card"
            onClick={() => navigate(`/work/${item.workId}`)}
            aria-label={`Ouvrir ${item.title}`}
          >
            <div className="reading-carousel-cover">
              <CoverImage
                url={item.coverUrl}
                alt={item.title}
                variant="tile"
                loading="eager"
              />
              <span
                className="reading-carousel-status"
                style={{ background: getUserReadingStatusColor(item.userReadingStatus) }}
                aria-hidden
              />
            </div>
            <div className="reading-carousel-body">
              <strong>{item.title}</strong>
              <div className="reading-carousel-meta">
                <span className="reading-carousel-progress">
                  {item.progressPercent} %
                </span>
                {item.lastActivityAt ? (
                  <span className="reading-carousel-date">
                    {formatDateFr(item.lastActivityAt.slice(0, 10))}
                  </span>
                ) : (
                  <span className="reading-carousel-date reading-carousel-date--empty" />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
