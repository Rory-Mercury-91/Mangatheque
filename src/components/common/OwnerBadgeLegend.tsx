import { OwnerInitialBadge } from "@/components/common/OwnerInitialBadge";
import type { Owner } from "@/types/database";
import "./OwnerBadgeLegend.css";

const SAMPLE_OWNER: Pick<Owner, "name"> = {
  name: "Alexandre",
};

type OwnerBadgeLegendProps = {
  /** Propriétaire utilisé pour l'exemple visuel (sinon pastille générique). */
  sampleOwner?: Pick<Owner, "name">;
  compact?: boolean;
};

/**
 * @description Explique la différence visuelle entre pastille achat et Mihon.
 */
export function OwnerBadgeLegend({
  sampleOwner = SAMPLE_OWNER,
  compact = false,
}: OwnerBadgeLegendProps) {
  return (
    <div
      className={`owner-badge-legend${compact ? " owner-badge-legend--compact" : ""}`}
      aria-label="Légende des pastilles propriétaire"
    >
      <span className="owner-badge-legend-title">Légende</span>
      <ul className="owner-badge-legend-list">
        <li>
          <OwnerInitialBadge owner={sampleOwner} variant="purchase" />
          <span>
            <strong>Achat</strong> — pastille pleine (couleur de fond)
          </span>
        </li>
        <li>
          <OwnerInitialBadge owner={sampleOwner} variant="mihon" />
          <span>
            <strong>Mihon</strong> — pastille contour cyan
          </span>
        </li>
      </ul>
    </div>
  );
}
