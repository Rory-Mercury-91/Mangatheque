import { CoverImage } from "@/components/common/CoverImage";
import type { Work } from "@/types/database";
import "./WorkTile.css";

export interface WorkTileProps {
  work: Work;
  onClick: (workId: string) => void;
}

/**
 * @description Tuile bibliothèque : couverture + titre uniquement.
 */
export function WorkTile({ work, onClick }: WorkTileProps) {
  return (
    <button
      type="button"
      className="work-tile"
      onClick={() => onClick(work.id)}
      aria-label={`Voir ${work.title}`}
    >
      <div className="work-tile-cover">
        <CoverImage url={work.cover_url} alt={work.title} />
      </div>
      <p className="work-tile-title">{work.title}</p>
    </button>
  );
}
