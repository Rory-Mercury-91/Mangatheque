import { useState } from "react";
import type { CSSProperties } from "react";
import {
  getOwnerOwnershipBadgeText,
  getOwnerOwnershipPillLabel,
  getOwnerColor,
  MIHON_COLOR,
  type OwnerBadgeVariant,
} from "@/constants/ownerColors";
import { isMobileRuntime } from "@/lib/platform";
import type { Owner } from "@/types/database";
import "./OwnerInitialBadge.css";

export type { OwnerBadgeVariant };

export interface OwnerInitialBadgeProps {
  owner: Pick<Owner, "name">;
  variant?: OwnerBadgeVariant;
}

/**
 * @description Pastille compacte « Achat : … » ou « Mihon : … » (sans doublon de nom).
 */
export function OwnerInitialBadge({
  owner,
  variant = "purchase",
}: OwnerInitialBadgeProps) {
  const mobile = isMobileRuntime();
  const [tipOpen, setTipOpen] = useState(false);
  const tipLabel = getOwnerOwnershipBadgeText(owner.name, variant);
  const text = getOwnerOwnershipPillLabel(owner.name, variant);
  const badgeColor =
    variant === "mihon" ? MIHON_COLOR : getOwnerColor(owner.name);

  const badgeClassName = `owner-initial-badge owner-initial-badge--${variant} owner-initial-badge--labeled`;

  const style = { "--owner-color": badgeColor } as CSSProperties;

  if (mobile) {
    return (
      <span className="owner-initial-badge-wrap">
        <button
          type="button"
          className={`${badgeClassName} owner-initial-badge--interactive`}
          style={style}
          aria-label={tipLabel}
          aria-expanded={tipOpen}
          onClick={() => setTipOpen((open) => !open)}
          onBlur={() => setTipOpen(false)}
        >
          {text}
        </button>
        {tipOpen ? (
          <span className="owner-initial-badge-tip" role="tooltip">
            {tipLabel}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      className={badgeClassName}
      style={style}
      title={tipLabel}
      aria-label={tipLabel}
    >
      {text}
    </span>
  );
}
