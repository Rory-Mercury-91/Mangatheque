import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import type { ReadingWorkItem } from "@/types/readingStats";
import "./ReadingProgressList.css";

export interface ReadingProgressListProps {
  items: ReadingWorkItem[];
}

/**
 * @description Liste des séries en cours avec barre de progression.
 */
export function ReadingProgressList({ items }: ReadingProgressListProps) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <p className="reading-progress-empty">
        Aucune série en cours pour ce filtre.
      </p>
    );
  }

  return (
    <ul className="reading-progress-list">
      {items.map((item) => (
        <li key={item.workId}>
          <button
            type="button"
            className="reading-progress-row"
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
            <span className="reading-progress-percent">{item.progressPercent} %</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
