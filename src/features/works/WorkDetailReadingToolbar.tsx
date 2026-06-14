import { BookCheck } from "lucide-react";
import { InfoBadge } from "@/components/common/InfoBadge";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import {
  deriveUserReadingStatus,
  getUserReadingStatusColor,
  getUserReadingStatusLabel,
} from "@/constants/userReadingStatus";
import "./WorkDetailReadingToolbar.css";

export interface WorkDetailReadingToolbarProps {
  readCount: number;
  totalCount: number;
  unitLabel: string;
  allRead: boolean;
  markAllDisabled?: boolean;
  abandoned: boolean;
  abandonedDisabled?: boolean;
  onMarkAllRead: () => void;
  onAbandonedChange: (abandoned: boolean) => void;
}

/**
 * @description Barre « Ma lecture » : badge, compteur, tout marquer lu, toggle abandonnée.
 */
export function WorkDetailReadingToolbar({
  readCount,
  totalCount,
  unitLabel,
  allRead,
  markAllDisabled,
  abandoned,
  abandonedDisabled,
  onMarkAllRead,
  onAbandonedChange,
}: WorkDetailReadingToolbarProps) {
  const status = deriveUserReadingStatus(readCount, totalCount, abandoned);

  return (
    <div className="work-detail-reading-toolbar">
      <span className="work-detail-reading-toolbar-prefix">Ma lecture :</span>
      <InfoBadge
        label={getUserReadingStatusLabel(status)}
        color={getUserReadingStatusColor(status)}
      />
      <span className="work-detail-reading-toolbar-counter">
        {readCount}/{totalCount} {unitLabel}
      </span>
      <span className="work-detail-reading-toolbar-sep" aria-hidden>
        ·
      </span>
      <button
        type="button"
        className="work-detail-mark-all-read-btn work-detail-reading-toolbar-mark-all"
        disabled={allRead || markAllDisabled}
        title={
          allRead
            ? "Tout est déjà marqué lu"
            : `Marquer tous les ${unitLabel} comme lus pour mon compte`
        }
        onClick={onMarkAllRead}
      >
        <BookCheck size={16} aria-hidden />
        Tout marquer lu
      </button>
      <span className="work-detail-reading-toolbar-sep" aria-hidden>
        ·
      </span>
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
