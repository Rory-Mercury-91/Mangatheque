import { useEffect, useRef, useState } from "react";
import type { useWorkChapterReadingProgress } from "@/hooks/useWorkChapterReadingProgress";
import "./ChapterReadingProgress.css";

type ChapterProgressState = ReturnType<typeof useWorkChapterReadingProgress>;

export interface ChapterReadingProgressPanelProps {
  progress: ChapterProgressState;
  totalChapters: number;
}

/**
 * @description Normalise la saisie locale avant persistance.
 * @param raw - Valeur brute du champ.
 * @param totalChapters - Plafond VF.
 */
function parseChapterDraft(raw: string, totalChapters: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return 0;
  }
  const next = Number(trimmed);
  if (!Number.isFinite(next) || next < 0) {
    return null;
  }
  return Math.min(Math.floor(next), totalChapters);
}

/**
 * @description Panneau de saisie du nombre de chapitres lus (série sans grille).
 */
export function ChapterReadingProgressPanel({
  progress,
  totalChapters,
}: ChapterReadingProgressPanelProps) {
  const [draft, setDraft] = useState(() => String(progress.chaptersRead));
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraft(String(progress.chaptersRead));
    }
  }, [progress.chaptersRead]);

  if (!progress.enabled) {
    return null;
  }

  const commitDraft = () => {
    const parsed = parseChapterDraft(draft, totalChapters);
    if (parsed == null) {
      setDraft(String(progress.chaptersRead));
      return;
    }

    setDraft(String(parsed));
    if (parsed !== progress.chaptersRead) {
      void progress.persist(parsed);
    }
  };

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
            value={draft}
            disabled={progress.loading}
            aria-label={`Chapitres lus sur ${totalChapters}`}
            onFocus={() => {
              isEditingRef.current = true;
            }}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onBlur={() => {
              isEditingRef.current = false;
              commitDraft();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
          <span className="chapter-reading-progress-total">/ {totalChapters}</span>
        </div>
      </label>
    </div>
  );
}
