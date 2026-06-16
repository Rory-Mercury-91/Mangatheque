import { CoverImage } from "@/components/common/CoverImage";
import type { Work } from "@/types/database";
import "./WorkTile.css";

export interface WorkTileProps {
  work: Work;
  /** Affiche une étoile si la série est en favori pour au moins un propriétaire. */
  isFavorite?: boolean;
  onClick: (workId: string) => void;
}

/**
 * @description Tuile bibliothèque : couverture + titre uniquement.
 */
export function WorkTile({ work, isFavorite = false, onClick }: WorkTileProps) {
  return (
    <button
      type="button"
      className="work-tile"
      onClick={() => onClick(work.id)}
      aria-label={`Voir ${work.title}`}
    >
      <div className="work-tile-cover">
        {isFavorite ? (
          <span className="work-tile-favorite" aria-hidden>
            ★
          </span>
        ) : null}
        <CoverImage url={work.cover_url} alt={work.title} />
      </div>
      <p className="work-tile-title">{work.title}</p>
    </button>
  );
}
