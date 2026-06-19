import { BookCheck } from "lucide-react";
import { InfoBadge } from "@/components/common/InfoBadge";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import {
  deriveUserReadingStatus,
  getUserReadingStatusColor,
  getUserReadingStatusLabel,
} from "@/constants/userReadingStatus";
import "./WorkDetailReadingToolbar.css";

export interface WorkDetailReadingSegment {
  readCount: number;
  totalCount: number;
  unitLabel: string;
  allRead: boolean;
  markAllDisabled?: boolean;
  onMarkAllRead: () => void;
}

export interface WorkDetailReadingToolbarProps {
  /** Compteur combiné pour le badge « Ma lecture ». */
  combinedReadCount: number;
  combinedTotalCount: number;
  abandoned: boolean;
  abandonedDisabled?: boolean;
  onAbandonedChange: (abandoned: boolean) => void;
  chapterSegment?: WorkDetailReadingSegment;
  volumeSegment?: WorkDetailReadingSegment;
}

/**
 * @description Barre « Ma lecture » hybride : badge commun, compteurs et actions par mode.
 */
export function WorkDetailReadingToolbar({
  combinedReadCount,
  combinedTotalCount,
  abandoned,
  abandonedDisabled,
  onAbandonedChange,
  chapterSegment,
  volumeSegment,
}: WorkDetailReadingToolbarProps) {
  const status = deriveUserReadingStatus(
    combinedReadCount,
    combinedTotalCount,
    abandoned,
  );

  const renderSegment = (segment: WorkDetailReadingSegment, prefix: string) => (
    <div className="work-detail-reading-toolbar-segment" key={prefix}>
      <span className="work-detail-reading-toolbar-counter">
        {segment.readCount}/{segment.totalCount} {segment.unitLabel}
      </span>
      <button
        type="button"
        className="work-detail-mark-all-read-btn work-detail-reading-toolbar-mark-all"
        disabled={segment.allRead || segment.markAllDisabled}
        title={
          segment.allRead
            ? `Tous les ${segment.unitLabel} sont déjà lus`
            : `Marquer tous les ${segment.unitLabel} comme lus`
        }
        onClick={segment.onMarkAllRead}
      >
        <BookCheck size={16} aria-hidden />
        {prefix} Tout marquer lu
      </button>
    </div>
  );

  return (
    <div className="work-detail-reading-toolbar">
      <span className="work-detail-reading-toolbar-prefix">Ma lecture :</span>
      <InfoBadge
        label={getUserReadingStatusLabel(status)}
        color={getUserReadingStatusColor(status)}
      />
      {chapterSegment ? renderSegment(chapterSegment, "Chapitres —") : null}
      {volumeSegment ? renderSegment(volumeSegment, "Tomes —") : null}
      <div className="work-detail-reading-toolbar-abandoned">
        <span className="work-detail-reading-toolbar-abandoned-label">
          Abandonnée :
        </span>
        <ToggleSwitch
          checked={abandoned}
          disabled={abandonedDisabled}
          title={
            abandoned
              ? "Retirer le marquage abandonnée"
              : "Marquer la série comme abandonnée"
          }
          onChange={onAbandonedChange}
        />
      </div>
    </div>
  );
}
