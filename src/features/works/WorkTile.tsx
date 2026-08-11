import { CoverImage } from "@/components/common/CoverImage";
import type { Work } from "@/types/database";
import "./WorkTile.css";

export interface WorkTileProps {
  work: Work;
  /** Affiche une étoile si la série est en favori pour au moins un propriétaire. */
  isFavorite?: boolean;
  /**
   * Mode dév : nombre de tomes/chapitres manquants dans l'archive locale.
   * Affiché uniquement si > 0.
   */
  archiveMissingCount?: number | null;
  /** @default lazy — eager pour tuiles préchargées (page suivante). */
  coverLoading?: "lazy" | "eager";
  onClick: (workId: string) => void;
}

/**
 * @description Tuile bibliothèque : couverture + titre uniquement.
 */
export function WorkTile({
  work,
  isFavorite = false,
  archiveMissingCount = null,
  coverLoading = "lazy",
  onClick,
}: WorkTileProps) {
  const showMissingBadge =
    archiveMissingCount != null && archiveMissingCount > 0;

  return (
    <button
      type="button"
      className="work-tile"
      onClick={() => onClick(work.id)}
      aria-label={
        showMissingBadge
          ? `Voir ${work.title} (${archiveMissingCount} manquant${
              archiveMissingCount > 1 ? "s" : ""
            } en archive)`
          : `Voir ${work.title}`
      }
    >
      <div className="work-tile-cover">
        {isFavorite ? (
          <span className="work-tile-favorite" aria-hidden>
            ★
          </span>
        ) : null}
        {showMissingBadge ? (
          <span
            className="work-tile-archive-missing"
            title={`${archiveMissingCount} manquant${
              archiveMissingCount > 1 ? "s" : ""
            } dans l'archive`}
            aria-hidden
          >
            {archiveMissingCount > 99 ? "99+" : archiveMissingCount}
          </span>
        ) : null}
        <CoverImage
          url={work.cover_url}
          alt={work.title}
          variant="tile"
          loading={coverLoading}
        />
      </div>
      <p className="work-tile-title">{work.title}</p>
    </button>
  );
}
