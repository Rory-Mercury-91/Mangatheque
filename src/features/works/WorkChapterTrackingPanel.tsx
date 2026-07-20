import { OwnerInitialBadge } from "@/components/common/OwnerInitialBadge";
import { ChapterReadingProgressPanel } from "@/features/works/ChapterReadingProgress";
import type { useWorkChapterReadingProgress } from "@/hooks/useWorkChapterReadingProgress";
import type { Owner } from "@/types/database";
import "./WorkChapterTrackingPanel.css";

type ChapterProgressState = ReturnType<typeof useWorkChapterReadingProgress>;

export interface WorkChapterTrackingPanelProps {
  mihonOwner: Owner | null | undefined;
  progress: ChapterProgressState;
}

/**
 * @description Bloc suivi chapitres : compte Mihon et progression lue (numérique).
 */
export function WorkChapterTrackingPanel({
  mihonOwner,
  progress,
}: WorkChapterTrackingPanelProps) {
  return (
    <section className="work-chapter-tracking-panel" aria-label="Suivi chapitres">
      <div className="work-chapter-tracking-row">
        <span className="work-chapter-tracking-label">Disponible sur</span>
        {mihonOwner ? (
          <OwnerInitialBadge owner={mihonOwner} variant="mihon" />
        ) : (
          <span className="work-chapter-tracking-empty">
            Aucun compte Mihon — renseignez via « Modifier ».
          </span>
        )}
      </div>
      <ChapterReadingProgressPanel
        progress={progress}
        totalChapters={progress.totalChapters}
      />
    </section>
  );
}
