import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import type { ReadingWorkItem } from "@/types/readingStats";
import "./ReadingProgressList.css";

export interface ReadingProgressListProps {
  items: ReadingWorkItem[];
  /**
   * @description Incrémente d'un chapitre lu pour une série en cours.
   * Affiché uniquement si la série a un suivi chapitres.
   */
  onIncrementChapter?: (item: ReadingWorkItem) => void | Promise<void>;
}

/**
 * @description Liste des séries en cours avec barre de progression.
 */
export function ReadingProgressList({
  items,
  onIncrementChapter,
}: ReadingProgressListProps) {
  const navigate = useNavigate();
  const [busyWorkId, setBusyWorkId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="reading-progress-empty">
        Aucune série en cours pour ce filtre.
      </p>
    );
  }

  const handleIncrement = async (item: ReadingWorkItem) => {
    if (!onIncrementChapter || busyWorkId) {
      return;
    }
    setBusyWorkId(item.workId);
    try {
      await onIncrementChapter(item);
    } finally {
      setBusyWorkId(null);
    }
  };

  return (
    <ul className="reading-progress-list">
      {items.map((item) => {
        const canIncrementChapter =
          Boolean(onIncrementChapter) && item.chaptersTotal > 0;
        const expandsTotal = item.chaptersRead >= item.chaptersTotal;
        const busy = busyWorkId === item.workId;

        return (
          <li key={item.workId}>
            <div
              className={`reading-progress-row${
                canIncrementChapter ? " reading-progress-row--with-action" : ""
              }`}
            >
              <button
                type="button"
                className="reading-progress-main"
                onClick={() => navigate(`/work/${item.workId}`)}
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
                    {item.volumesTotal > 0 ? (
                      <span>
                        Tomes {item.volumesRead}/{item.volumesTotal}
                      </span>
                    ) : null}
                    {item.volumesTotal > 0 && item.chaptersTotal > 0 ? (
                      <span className="reading-progress-meta-sep"> · </span>
                    ) : null}
                    {item.chaptersTotal > 0 ? (
                      <span>
                        Chap. {item.chaptersRead}/{item.chaptersTotal}
                      </span>
                    ) : null}
                  </div>
                  <div className="reading-progress-bar" aria-hidden>
                    <span style={{ width: `${item.progressPercent}%` }} />
                  </div>
                </div>
                <span className="reading-progress-percent">
                  {item.progressPercent} %
                </span>
              </button>
              {canIncrementChapter ? (
                <button
                  type="button"
                  className="reading-progress-plus-one"
                  disabled={busy || busyWorkId != null}
                  title={
                    expandsTotal
                      ? "Ajouter 1 chapitre lu et relever le total catalogue"
                      : "Ajouter 1 chapitre lu"
                  }
                  aria-label={
                    expandsTotal
                      ? `Ajouter 1 chapitre lu à ${item.title} et relever le total`
                      : `Ajouter 1 chapitre lu à ${item.title}`
                  }
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
