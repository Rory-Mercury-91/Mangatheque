import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/common/Modal";
import type { PurchaseRecapPeriod } from "@/services/financialService";
import { formatDateFr, formatMonthYearFr } from "@/utils/dateFormat";
import { formatVolumeTitle } from "@/utils/volumeDisplay";
import "./PurchaseRecapMonthModal.css";

export interface PurchaseRecapMonthModalProps {
  period: PurchaseRecapPeriod | null;
  onClose: () => void;
}

const formatCurrency = (amount: number) =>
  amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/**
 * @description Modale listant les tomes achetés sur un mois donné.
 */
export function PurchaseRecapMonthModal({
  period,
  onClose,
}: PurchaseRecapMonthModalProps) {
  const navigate = useNavigate();

  if (!period) {
    return null;
  }

  const title = `Achats — ${formatMonthYearFr(period.periodKey)}`;

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="purchase-recap-modal">
        <p className="purchase-recap-modal-summary">
          <strong>{formatCurrency(period.totalPaid)}</strong>
          {" · "}
          {period.volumeCount} tome{period.volumeCount > 1 ? "s" : ""}
        </p>

        {period.volumes.length === 0 ? (
          <p className="purchase-recap-modal-empty">Aucun achat ce mois-ci.</p>
        ) : (
          <ul className="purchase-recap-modal-list">
            {period.volumes.map((volume) => {
              const volumeTitle = formatVolumeTitle(
                volume.volumeNumber,
                volume.volumeLabel,
                volume.trackingUnit,
              );

              return (
                <li key={volume.volumeId}>
                  <button
                    type="button"
                    className="purchase-recap-modal-item"
                    onClick={() => {
                      onClose();
                      navigate(`/work/${volume.workId}`);
                    }}
                  >
                    <span className="purchase-recap-modal-item-main">
                      <strong>{volume.workTitle}</strong>
                      <span>{volumeTitle}</span>
                    </span>
                    <span className="purchase-recap-modal-item-meta">
                      <span>{formatCurrency(volume.amountPaid)}</span>
                      <time dateTime={volume.purchaseDate}>
                        {formatDateFr(volume.purchaseDate)}
                      </time>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
