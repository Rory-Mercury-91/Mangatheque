import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import type { RecentAddition } from "@/services/financialService";
import type { Work } from "@/types/database";
import { formatDateTimeFr } from "@/utils/dateFormat";
import "./RecentAdditionsCarousel.css";

export interface RecentAdditionsCarouselProps {
  items: RecentAddition[];
  worksById: Map<string, Work>;
}

/**
 * @description Carrousel horizontal des derniers ajouts (œuvres et tomes).
 */
export function RecentAdditionsCarousel({
  items,
  worksById,
}: RecentAdditionsCarouselProps) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return <p className="recent-carousel-empty">Aucun ajout récent.</p>;
  }

  return (
    <div className="recent-carousel" aria-label="Derniers ajouts">
      <div className="recent-carousel-track">
        {items.map((item) => {
          const work = worksById.get(item.workId);
          return (
            <button
              key={item.entryId}
              type="button"
              className="recent-carousel-card"
              onClick={() => navigate(`/work/${item.workId}`)}
            >
              <div className="recent-carousel-cover">
                <CoverImage
                  url={item.coverUrl ?? work?.cover_url}
                  alt={item.title}
                />
              </div>
              <div className="recent-carousel-body">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
                <time dateTime={item.createdAt}>
                  {formatDateTimeFr(item.createdAt)}
                </time>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
