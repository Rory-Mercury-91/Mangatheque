import { CoverImage } from "@/components/common/CoverImage";
import type { Anime } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import "@/features/works/WorkTile.css";

export interface AnimeTileProps {
  anime: Anime;
  isFavorite?: boolean;
  coverLoading?: "lazy" | "eager";
  onClick: (animeId: string) => void;
}

/**
 * @description Tuile bibliothèque animé : couverture + titre d'affichage.
 */
export function AnimeTile({
  anime,
  isFavorite = false,
  coverLoading = "lazy",
  onClick,
}: AnimeTileProps) {
  const title = resolveAnimeDisplayTitle(anime);
  return (
    <button
      type="button"
      className="work-tile"
      onClick={() => onClick(anime.id)}
      aria-label={`Voir ${title}`}
    >
      <div className="work-tile-cover">
        {isFavorite ? (
          <span className="work-tile-favorite" aria-hidden>
            ★
          </span>
        ) : null}
        <CoverImage
          url={anime.cover_url}
          alt={title}
          variant="tile"
          loading={coverLoading}
        />
      </div>
      <p className="work-tile-title">{title}</p>
    </button>
  );
}
