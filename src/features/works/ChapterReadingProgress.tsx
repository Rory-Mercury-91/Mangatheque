import type { useWorkChapterReadingProgress } from "@/hooks/useWorkChapterReadingProgress";
import "./ChapterReadingProgress.css";

type ChapterProgressState = ReturnType<typeof useWorkChapterReadingProgress>;

export interface ChapterReadingProgressPanelProps {
  progress: ChapterProgressState;
  totalChapters: number;
}

/**
 * @description Panneau de saisie du nombre de chapitres lus (série sans grille).
 */
export function ChapterReadingProgressPanel({
  progress,
  totalChapters,
}: ChapterReadingProgressPanelProps) {
  if (!progress.enabled) {
    return null;
  }

  return (
    <div className="chapter-reading-progress">
      <label className="chapter-reading-progress-field">
        <span className="chapter-reading-progress-label">Chapitres lus</span>
        <div className="chapter-reading-progress-input-row">
          <input
            type="number"
            min={0}
            max={totalChapters}
            step={1}
            value={progress.chaptersRead}
            disabled={progress.loading || progress.saving}
            aria-label={`Chapitres lus sur ${totalChapters}`}
            onChange={(event) => {
              const raw = event.target.value.trim();
              const next = raw === "" ? 0 : Number(raw);
              if (Number.isNaN(next)) {
                return;
              }
              void progress.persist(next);
            }}
          />
          <span className="chapter-reading-progress-total">/ {totalChapters}</span>
        </div>
      </label>
    </div>
  );
}
