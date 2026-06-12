import type { CSSProperties } from "react";
import {
  getOwnerBadgeText,
  getOwnerColor,
  getOwnerDisplayName,
  MIHON_COLOR,
  type OwnerBadgeVariant,
} from "@/constants/ownerColors";
import type { Owner } from "@/types/database";
import "./OwnerInitialBadge.css";

export type { OwnerBadgeVariant };

export interface OwnerInitialBadgeProps {
  owner: Pick<Owner, "name">;
  variant?: OwnerBadgeVariant;
}

/**
 * @description Pastille compacte avec libellé fixe (achat ou Mihon).
 */
export function OwnerInitialBadge({
  owner,
  variant = "purchase",
}: OwnerInitialBadgeProps) {
  const displayName = getOwnerDisplayName(owner.name);
  const title =
    variant === "mihon" ? `Mihon — ${displayName}` : `Achat — ${displayName}`;
  const text = getOwnerBadgeText(owner.name, variant);
  const badgeColor =
    variant === "mihon" ? MIHON_COLOR : getOwnerColor(owner.name);

  return (
    <span
      className={`owner-initial-badge owner-initial-badge--${variant}${
        text.length > 1 ? " owner-initial-badge--wide" : ""
      }`}
      style={{ "--owner-color": badgeColor } as CSSProperties}
      title={title}
      aria-label={title}
    >
      {text}
    </span>
  );
}
