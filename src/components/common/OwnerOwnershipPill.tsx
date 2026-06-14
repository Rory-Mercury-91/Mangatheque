import { TogglePill } from "@/components/common/TogglePill";
import {
  getOwnerColor,
  getOwnerOwnershipBadgeText,
  getOwnerOwnershipPillLabel,
  MIHON_COLOR,
  type OwnerBadgeVariant,
} from "@/constants/ownerColors";
import type { Owner } from "@/types/database";

export interface OwnerOwnershipPillProps {
  owner: Pick<Owner, "name">;
  variant?: OwnerBadgeVariant;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * @description Pastille d'appartenance propriétaire (achat ou Mihon), style contour discret.
 */
export function OwnerOwnershipPill({
  owner,
  variant = "purchase",
  active,
  disabled,
  onClick,
}: OwnerOwnershipPillProps) {
  return (
    <TogglePill
      label={getOwnerOwnershipPillLabel(owner.name, variant)}
      color={variant === "mihon" ? MIHON_COLOR : getOwnerColor(owner.name)}
      showColorWhenIdle
      visualVariant="outline"
      active={active}
      disabled={disabled}
      title={getOwnerOwnershipBadgeText(owner.name, variant)}
      onClick={onClick}
    />
  );
}
