import type { CSSProperties } from "react";
import "./InfoBadge.css";

export interface InfoBadgeProps {
  label: string;
  color?: string;
}

/**
 * @description Pastille d'information (démographie, statut, etc.).
 */
export function InfoBadge({ label, color }: InfoBadgeProps) {
  return (
    <span
      className="info-badge"
      style={
        color
          ? ({
              "--info-badge-color": color,
            } as CSSProperties)
          : undefined
      }
    >
      {label}
    </span>
  );
}
