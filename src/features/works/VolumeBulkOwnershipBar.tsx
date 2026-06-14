import { OwnerOwnershipPill } from "@/components/common/OwnerOwnershipPill";
import type { Owner, TrackingUnit } from "@/types/database";import "./VolumeBulkOwnershipBar.css";

export interface VolumeBulkOwnershipBarProps {
  owners: Owner[];
  trackingUnit: TrackingUnit;
  sharedPurchaseOwnerIds: string[];
  sharedMihonOwnerId: string | null;
  onTogglePurchaseOwner: (ownerId: string) => void;
  onApplyMihon: (ownerId: string | null) => void;
}

/**
 * @description Contrôles globaux d'appartenance (achat / Mihon) pour tous les tomes ou chapitres.
 */
export function VolumeBulkOwnershipBar({
  owners,
  trackingUnit,
  sharedPurchaseOwnerIds,
  sharedMihonOwnerId,
  onTogglePurchaseOwner,
  onApplyMihon,
}: VolumeBulkOwnershipBarProps) {
  const unitLabel = trackingUnit === "chapter" ? "chapitres" : "tomes";
  const unitLabelSingular = trackingUnit === "chapter" ? "chapitre" : "tome";

  return (
    <section
      className="volume-bulk-ownership-bar"
      aria-label={`Appartenance — tous les ${unitLabel}`}
    >
      <div className="volume-bulk-ownership-grid">
        <div className="volume-bulk-ownership-card volume-bulk-ownership-card--purchase">
          <span className="volume-bulk-ownership-title">
            Achat — tous les {unitLabel}
          </span>
          <div className="toggle-pill-group">
            {owners.map((owner) => (
              <OwnerOwnershipPill
                key={`bulk-purchase-${owner.id}`}
                owner={owner}
                variant="purchase"
                active={sharedPurchaseOwnerIds.includes(owner.id)}
                disabled={sharedMihonOwnerId != null}
                onClick={() => onTogglePurchaseOwner(owner.id)}
              />
            ))}
          </div>
        </div>

        <div className="volume-bulk-ownership-card volume-bulk-ownership-card--mihon">
          <span className="volume-bulk-ownership-title">Mihon — tous les {unitLabel}</span>
          <div className="toggle-pill-group">
            {owners.map((owner) => (
              <OwnerOwnershipPill
                key={`bulk-mihon-${owner.id}`}
                owner={owner}
                variant="mihon"
                active={sharedMihonOwnerId === owner.id}
                onClick={() =>
                  onApplyMihon(sharedMihonOwnerId === owner.id ? null : owner.id)
                }
              />
            ))}
          </div>
          <p className="volume-bulk-ownership-hint">
            {trackingUnit === "chapter"
              ? "Une seule ligne « Série numérique » — le compteur VF reste sur la fiche série."
              : `Applique le compte Mihon à chaque ${unitLabelSingular} listé.`}
          </p>
        </div>
      </div>
    </section>
  );
}
