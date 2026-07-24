import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import type { AnimeWatchItem } from "@/types/animeStats";
import "@/features/reading-stats/ReadingProgressList.css";

export interface AnimeProgressListProps {
  items: AnimeWatchItem[];
  /**
   * @description Incrémente d'un épisode vu.
   */
  onIncrementEpisode?: (item: AnimeWatchItem) => void | Promise<void>;
}

/**
 * @description Liste des animés en cours avec barre de progression.
 */
export function AnimeProgressList({
  items,
  onIncrementEpisode,
}: AnimeProgressListProps) {
  const navigate = useNavigate();
  const [busyAnimeId, setBusyAnimeId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="reading-progress-empty">
        Aucun animé en cours pour ce filtre.
      </p>
    );
  }

  const handleIncrement = async (item: AnimeWatchItem) => {
    if (!onIncrementEpisode || busyAnimeId) return;
    setBusyAnimeId(item.animeId);
    try {
      await onIncrementEpisode(item);
    } finally {
      setBusyAnimeId(null);
    }
  };

  return (
    <ul className="reading-progress-list">
      {items.map((item) => {
        const canIncrement = Boolean(onIncrementEpisode);
        const busy = busyAnimeId === item.animeId;
        const totalLabel =
          item.episodesTotal != null ? String(item.episodesTotal) : "?";

        return (
          <li key={item.animeId}>
            <div
              className={`reading-progress-row${
                canIncrement ? " reading-progress-row--with-action" : ""
              }`}
            >
              <button
                type="button"
                className="reading-progress-main"
                onClick={() => navigate(`/anime/${item.animeId}`)}
              >
                <div className="reading-progress-cover">
                  <CoverImage
                    url={item.coverUrl}
                    alt={item.title}
                    variant="tile"
                    loading="lazy"
                  />
                </div>
                <div className="reading-progress-info">
                  <strong>{item.title}</strong>
                  <div className="reading-progress-meta">
                    <span>
                      Ép. {item.episodesWatched}/{totalLabel}
                    </span>
                  </div>
                  <div className="reading-progress-bar" aria-hidden>
                    <span style={{ width: `${item.progressPercent}%` }} />
                  </div>
                </div>
                <span className="reading-progress-percent">
                  {item.progressPercent} %
                </span>
              </button>
              {canIncrement ? (
                <button
                  type="button"
                  className="reading-progress-plus-one"
                  disabled={busy || busyAnimeId != null}
                  title="Ajouter 1 épisode vu"
                  aria-label={`Ajouter 1 épisode vu à ${item.title}`}
                  onClick={() => void handleIncrement(item)}
                >
                  {busy ? "…" : "+1"}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
