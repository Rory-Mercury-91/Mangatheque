import { useEffect, useState } from "react";
import { LayoutGrid, List, Plus } from "lucide-react";
import { WorkChapterTrackingPanel } from "@/features/works/WorkChapterTrackingPanel";
import { WorkDetailReadingToolbar } from "@/features/works/WorkDetailReadingToolbar";
import { WorkDetailVolumeCard } from "@/features/works/WorkDetailVolumeCard";
import type { WorkDetailVolumeViewMode } from "@/features/works/workDetailVolumeView";
import type { useWorkChapterReadingProgress } from "@/hooks/useWorkChapterReadingProgress";
import type { useWorkReadingAbandoned } from "@/hooks/useWorkReadingAbandoned";
import type { useWorkReadingProgress } from "@/hooks/useWorkReadingProgress";
import type { Owner } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";
import "@/components/common/MediaSubTabs.css";
import "@/components/common/ghostActionBtn.css";

type ChapterProgress = ReturnType<typeof useWorkChapterReadingProgress>;
type VolumeProgress = ReturnType<typeof useWorkReadingProgress>;
type AbandonedState = ReturnType<typeof useWorkReadingAbandoned>;

export type WorkDetailReadingTab = "volumes" | "chapters";

export interface WorkDetailReadingSectionProps {
  hasVolumeTracking: boolean;
  hasChapterTracking: boolean;
  physicalVolumes: VolumeFormRow[];
  chapterCount: number;
  volumeViewMode: WorkDetailVolumeViewMode;
  onVolumeViewMode: (mode: WorkDetailVolumeViewMode) => void;
  onAddVolume: () => void;
  onEditVolume: (volume: VolumeFormRow) => void;
  ownerById: Map<string, Owner>;
  defaultPrice: number | null;
  chapterMihonOwners: Owner[];
  chapterReading: ChapterProgress;
  readingProgress: VolumeProgress;
  readingAbandoned: AbandonedState;
  keepChapterReadingGap: boolean;
}

/**
 * @description Section « Ma lecture » : tomes et/ou chapitres (onglets si les deux).
 */
export function WorkDetailReadingSection({
  hasVolumeTracking,
  hasChapterTracking,
  physicalVolumes,
  chapterCount,
  volumeViewMode,
  onVolumeViewMode,
  onAddVolume,
  onEditVolume,
  ownerById,
  defaultPrice,
  chapterMihonOwners,
  chapterReading,
  readingProgress,
  readingAbandoned,
  keepChapterReadingGap,
}: WorkDetailReadingSectionProps) {
  const showBoth = hasVolumeTracking && hasChapterTracking;
  const [activeTab, setActiveTab] = useState<WorkDetailReadingTab>(() =>
    hasVolumeTracking ? "volumes" : "chapters",
  );

  useEffect(() => {
    if (showBoth) {
      return;
    }
    setActiveTab(hasVolumeTracking ? "volumes" : "chapters");
  }, [showBoth, hasVolumeTracking]);

  if (!hasVolumeTracking && !hasChapterTracking) {
    return null;
  }

  const showingVolumes =
    hasVolumeTracking && (!showBoth || activeTab === "volumes");
  const showingChapters =
    hasChapterTracking && (!showBoth || activeTab === "chapters");

  const showToolbar =
    (showingChapters && chapterReading.enabled) ||
    (showingVolumes && readingProgress.enabled);

  return (
    <section
      className="work-detail-section"
      id="work-detail-reading"
      aria-labelledby="work-detail-reading-title"
    >
      <div className="work-detail-section-header">
        <div className="work-detail-section-header-main">
          <h2 id="work-detail-reading-title">Ma lecture</h2>
          {showToolbar ? (
            <WorkDetailReadingToolbar
              combinedReadCount={
                (showingChapters && chapterReading.enabled
                  ? chapterReading.chaptersRead
                  : 0) +
                (showingVolumes && readingProgress.enabled
                  ? readingProgress.readCount
                  : 0)
              }
              combinedTotalCount={
                (showingChapters && chapterReading.enabled
                  ? chapterReading.totalChapters
                  : 0) +
                (showingVolumes && readingProgress.enabled
                  ? readingProgress.totalTrackable
                  : 0)
              }
              abandoned={readingAbandoned.isAbandoned}
              abandonedDisabled={
                readingAbandoned.loading ||
                readingAbandoned.saving ||
                !readingAbandoned.enabled
              }
              keepOngoingWhenCaughtUp={keepChapterReadingGap}
              onAbandonedChange={(next) =>
                void readingAbandoned.setAbandoned(next)
              }
              chapterSegment={
                showingChapters && chapterReading.enabled
                  ? {
                      readCount: chapterReading.chaptersRead,
                      totalCount: chapterReading.totalChapters,
                      unitLabel: "chapitres",
                      allRead: chapterReading.allRead,
                      markAllDisabled:
                        chapterReading.loading || chapterReading.saving,
                      onMarkAllRead: () => void chapterReading.markAllAsRead(),
                    }
                  : undefined
              }
              volumeSegment={
                showingVolumes &&
                readingProgress.enabled &&
                readingProgress.totalTrackable > 0
                  ? {
                      readCount: readingProgress.readCount,
                      totalCount: readingProgress.totalTrackable,
                      unitLabel: "tomes",
                      allRead: readingProgress.allRead,
                      markAllDisabled:
                        readingProgress.loading || readingAbandoned.loading,
                      onMarkAllRead: () => void readingProgress.markAllAsRead(),
                    }
                  : undefined
              }
            />
          ) : null}
        </div>

        {showingVolumes ? (
          <div className="work-detail-section-actions">
            {physicalVolumes.length > 0 ? (
              <div
                className="work-detail-volume-view-toggle"
                role="group"
                aria-label="Affichage des tomes"
              >
                <button
                  type="button"
                  className={`ghost-action-btn${
                    volumeViewMode === "grid" ? " ghost-action-btn--active" : ""
                  }`}
                  title="Vue grille"
                  aria-label="Vue grille"
                  aria-pressed={volumeViewMode === "grid"}
                  onClick={() => onVolumeViewMode("grid")}
                >
                  <LayoutGrid size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`ghost-action-btn${
                    volumeViewMode === "list" ? " ghost-action-btn--active" : ""
                  }`}
                  title="Vue liste"
                  aria-label="Vue liste"
                  aria-pressed={volumeViewMode === "list"}
                  onClick={() => onVolumeViewMode("list")}
                >
                  <List size={18} aria-hidden />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="ghost-action-btn ghost-action-btn--accent"
              title="Ajouter un tome"
              aria-label="Ajouter un tome"
              onClick={onAddVolume}
            >
              <Plus size={18} aria-hidden />
              <span className="ghost-action-label">Ajouter un tome</span>
            </button>
          </div>
        ) : null}
      </div>

      {showBoth ? (
        <div
          className="media-sub-tabs work-detail-reading-tabs"
          role="tablist"
          aria-label="Mode de lecture"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "volumes"}
            className={`media-sub-tab${
              activeTab === "volumes" ? " media-sub-tab--active" : ""
            }`}
            onClick={() => setActiveTab("volumes")}
          >
            Tomes ({physicalVolumes.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chapters"}
            className={`media-sub-tab${
              activeTab === "chapters" ? " media-sub-tab--active" : ""
            }`}
            onClick={() => setActiveTab("chapters")}
          >
            Chapitres ({chapterCount})
          </button>
        </div>
      ) : null}

      {showingChapters ? (
        <WorkChapterTrackingPanel
          mihonOwners={chapterMihonOwners}
          progress={chapterReading}
        />
      ) : null}

      {showingVolumes ? (
        physicalVolumes.length === 0 ? (
          <p className="work-detail-empty">Aucun tome enregistré.</p>
        ) : (
          <ul
            className={`work-detail-volumes${
              volumeViewMode === "list" ? " work-detail-volumes--list" : ""
            }`}
          >
            {physicalVolumes.map((vol) => {
              const mihonOwners = (vol.mihonOwnerIds ?? [])
                .map((id) => ownerById.get(id))
                .filter((owner): owner is Owner => Boolean(owner));
              const purchaseOwners = (vol.ownerIds ?? [])
                .map((id) => ownerById.get(id))
                .filter((owner): owner is Owner => Boolean(owner));
              const unitPrice = vol.catalogPrice ?? defaultPrice ?? null;
              return (
                <li
                  key={
                    vol.id ??
                    `${vol.volumeNumber}-${vol.volumeLabel ?? ""}-${vol.editionType}`
                  }
                >
                  <WorkDetailVolumeCard
                    volume={vol}
                    trackingUnit="volume"
                    unitPrice={unitPrice}
                    mihonOwners={mihonOwners}
                    purchaseOwners={purchaseOwners}
                    isRead={vol.id ? readingProgress.isRead(vol.id) : false}
                    isAbandoned={readingAbandoned.isAbandoned}
                    onToggleRead={
                      vol.id && readingProgress.enabled
                        ? () => {
                            void readingProgress.toggleRead(vol.id!).catch(() => {
                              // Revert optimiste déjà géré dans le hook
                            });
                          }
                        : undefined
                    }
                    onEdit={vol.id ? () => onEditVolume(vol) : undefined}
                  />
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </section>
  );
}
