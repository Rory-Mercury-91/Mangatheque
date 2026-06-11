import type { CSSProperties } from "react";
import type { Owner } from "@/types/database";
import { getOwnerBadgeText } from "@/utils/ownerDisplay";
import "./OwnerInitialBadge.css";

export type OwnerBadgeVariant = "purchase" | "mihon";

export interface OwnerInitialBadgeProps {
  owner: Pick<Owner, "name" | "color" | "badge_label">;
  variant?: OwnerBadgeVariant;
}

/**
 * @description Pastille compacte avec texte personnalisé ou initiale (achat ou Mihon).
 */
export function OwnerInitialBadge({
  owner,
  variant = "purchase",
}: OwnerInitialBadgeProps) {
  const title =
    variant === "mihon" ? `Mihon — ${owner.name}` : `Achat — ${owner.name}`;
  const text = getOwnerBadgeText(owner);

  return (
    <span
      className={`owner-initial-badge owner-initial-badge--${variant}${
        text.length > 1 ? " owner-initial-badge--wide" : ""
      }`}
      style={{ "--owner-color": owner.color } as CSSProperties}
      title={title}
      aria-label={title}
    >
      {text}
    </span>
  );
}
