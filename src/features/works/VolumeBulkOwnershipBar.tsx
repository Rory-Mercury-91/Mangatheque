import { OwnerOwnershipPill } from "@/components/common/OwnerOwnershipPill";
import { useTouchTabletLayout } from "@/hooks/useTouchTabletLayout";
import { isMobileRuntime } from "@/lib/platform";
import type { Owner, TrackingUnit } from "@/types/database";
import "./VolumeBulkOwnershipBar.css";

export interface VolumeBulkOwnershipBarProps {
  owners: Owner[];
  trackingUnit: TrackingUnit;
  /** Masque la zone achat (suivi chapitres numérique). */
  purchaseEnabled?: boolean;
  sharedPurchaseOwnerIds: string[];
  sharedMihonOwnerIds: string[];
  onTogglePurchaseOwner: (ownerId: string) => void;
  onToggleMihonOwner: (ownerId: string) => void;
}

/**
 * @description Contrôles globaux d'appartenance (achat / Mihon) pour tous les tomes ou chapitres.
 */
export function VolumeBulkOwnershipBar({
  owners,
  trackingUnit,
  purchaseEnabled = true,
  sharedPurchaseOwnerIds,
  sharedMihonOwnerIds,
  onTogglePurchaseOwner,
  onToggleMihonOwner,
}: VolumeBulkOwnershipBarProps) {
  const touchTabletLayout = useTouchTabletLayout(isMobileRuntime());
  const unitLabel = trackingUnit === "chapter" ? "chapitres" : "tomes";
  const unitLabelSingular = trackingUnit === "chapter" ? "chapitre" : "tome";

  return (
    <section
      className="volume-bulk-ownership-bar"
      aria-label={`Appartenance — tous les ${unitLabel}`}
    >
      <div
        className={[
          "volume-bulk-ownership-grid",
          touchTabletLayout ? "volume-bulk-ownership-grid--tablet" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {purchaseEnabled ? (
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
                onClick={() => onTogglePurchaseOwner(owner.id)}
              />
            ))}
          </div>
        </div>
        ) : null}

        <div className="volume-bulk-ownership-card volume-bulk-ownership-card--mihon">
          <span className="volume-bulk-ownership-title">Mihon — tous les {unitLabel}</span>
          <div className="toggle-pill-group">
            {owners.map((owner) => (
              <OwnerOwnershipPill
                key={`bulk-mihon-${owner.id}`}
                owner={owner}
                variant="mihon"
                mihonNameOnly
                active={sharedMihonOwnerIds.includes(owner.id)}
                onClick={() => onToggleMihonOwner(owner.id)}
              />
            ))}
          </div>
          <p className="volume-bulk-ownership-hint">
            {trackingUnit === "chapter"
              ? "Comptes Mihon pour la lecture numérique — le gain Mihon ne compte qu'une fois."
              : `Applique les comptes Mihon à chaque ${unitLabelSingular} listé (gain compté une seule fois).`}
          </p>
        </div>
      </div>
    </section>
  );
}
