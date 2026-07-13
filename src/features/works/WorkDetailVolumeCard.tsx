import { BookCheck, BookOpen, Pencil } from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { OwnerInitialBadge } from "@/components/common/OwnerInitialBadge";
import type { Owner, TrackingUnit } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";
import { formatDateFr } from "@/utils/dateFormat";
import { formatCurrency, formatEditionLabel } from "@/utils/ownerDisplay";
import { formatVolumeTitle } from "@/utils/volumeDisplay";

export interface WorkDetailVolumeCardProps {
  volume: VolumeFormRow;
  trackingUnit: TrackingUnit;
  unitPrice: number | null;
  mihonOwner?: Owner | null;
  purchaseOwners: Owner[];
  isRead?: boolean;
  isAbandoned?: boolean;
  onToggleRead?: () => void;
  onEdit?: () => void;
}

/**
 * @description Carte tome compacte sur la fiche détail (couverture, badge, tarif, dates).
 */
export function WorkDetailVolumeCard({
  volume,
  trackingUnit,
  unitPrice,
  mihonOwner,
  purchaseOwners,
  isRead = false,
  isAbandoned = false,
  onToggleRead,
  onEdit,
}: WorkDetailVolumeCardProps) {
  const volumeTitle = formatVolumeTitle(
    volume.volumeNumber,
    volume.volumeLabel,
    trackingUnit,
  );

  const hasPrice = unitPrice != null && unitPrice > 0;
  const editionLabel = formatEditionLabel(volume.editionType);

  return (
    <article
      className={`work-detail-volume${
        isRead
          ? " work-detail-volume--read"
          : isAbandoned
            ? " work-detail-volume--abandoned"
            : ""
      }`}
    >
      <div className="work-detail-volume-cover-block">
        <div className="work-detail-volume-cover">
          <CoverImage
            url={volume.coverUrl}
            alt={volumeTitle}
            variant="tile"
            zoomable
          />
        </div>
      </div>

      <div className="work-detail-volume-body">
        <div className="work-detail-volume-title-row">
          <span className="work-detail-volume-label">{volumeTitle}</span>
          {onEdit ? (
            <div className="work-detail-volume-actions">
              <button
                type="button"
                className="work-detail-volume-edit-btn"
                title="Modifier le tome"
                aria-label={`Modifier ${volumeTitle}`}
                onClick={onEdit}
              >
                <Pencil size={14} aria-hidden />
              </button>
            </div>
          ) : null}
        </div>

        <div className="work-detail-volume-ownership">
          {mihonOwner ? (
            <OwnerInitialBadge owner={mihonOwner} variant="mihon" />
          ) : null}
          {purchaseOwners.length > 0 ? (
            purchaseOwners.map((owner) => (
              <OwnerInitialBadge
                key={owner.id}
                owner={owner}
                variant="purchase"
              />
            ))
          ) : !mihonOwner ? (
            <span className="work-detail-volume-no-owner">—</span>
          ) : null}
        </div>

        <p className="work-detail-volume-price">
          {hasPrice ? (
            <>
              <strong>{formatCurrency(unitPrice)}</strong>
              <span className="work-detail-volume-price-sep"> · </span>
            </>
          ) : null}
          <span>{editionLabel}</span>
        </p>

        <div className="work-detail-volume-dates">
          {volume.releaseDate ? (
            <p className="work-detail-volume-date-line">
              Sortie {formatDateFr(volume.releaseDate)}
            </p>
          ) : (
            <p className="work-detail-volume-date-line work-detail-volume-date-line--empty">
              Date de sortie non renseignée
            </p>
          )}
        </div>

        {onToggleRead ? (
          <button
            type="button"
            className={`work-detail-volume-read-btn${
              isRead ? " work-detail-volume-read-btn--read" : ""
            }`}
            aria-pressed={isRead}
            title={isRead ? "Marquer comme non lu" : "Marquer comme lu"}
            onClick={onToggleRead}
          >
            {isRead ? (
              <BookCheck size={14} aria-hidden />
            ) : (
              <BookOpen size={14} aria-hidden />
            )}
            {isRead ? "Lu" : "Marquer lu"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
