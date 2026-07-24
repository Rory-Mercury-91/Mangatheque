import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import { ANIME_LIST_STATUS_COLORS } from "@/constants/animeStatus";
import type { AnimeWatchItem } from "@/types/animeStats";
import { formatDateFr } from "@/utils/dateFormat";
import "@/features/reading-stats/RecentReadingCarousel.css";

export interface AnimeRecentCarouselProps {
  items: AnimeWatchItem[];
}

const DISPLAY_LIMIT = 6;

/**
 * @description Carrousel des derniers animés visionnés.
 */
export function AnimeRecentCarousel({ items }: AnimeRecentCarouselProps) {
  const navigate = useNavigate();
  const visibleItems = items.slice(0, DISPLAY_LIMIT);

  if (visibleItems.length === 0) {
    return (
      <p className="reading-carousel-empty">
        Aucun visionnage récent enregistré pour ce compte.
      </p>
    );
  }

  return (
    <div className="reading-carousel">
      <div className="reading-carousel-track">
        {visibleItems.map((item) => (
          <button
            key={item.animeId}
            type="button"
            className="reading-carousel-card"
            onClick={() => navigate(`/anime/${item.animeId}`)}
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
                style={{ background: ANIME_LIST_STATUS_COLORS[item.listStatus] }}
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
