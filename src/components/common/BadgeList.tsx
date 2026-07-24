import "./BadgeList.css";
import { formatMediaTagLabel } from "@/constants/mediaTags";

export interface BadgeListProps {
  items: string[];
  emptyLabel?: string;
  /** Variante visuelle des pastilles. */
  variant?: "default" | "tag";
}

/**
 * @description Affiche genres et thèmes sous forme de badges.
 */
export function BadgeList({
  items,
  emptyLabel = "—",
  variant = "default",
}: BadgeListProps) {
  if (items.length === 0) {
    return <span className="badge-empty">{emptyLabel}</span>;
  }

  return (
    <div className={`badge-list${variant === "tag" ? " badge-list--tag" : ""}`}>
      {items.map((item) => (
        <span
          key={item}
          className={`badge${variant === "tag" ? " badge--tag" : ""}`}
        >
          {formatMediaTagLabel(item)}
        </span>
      ))}
    </div>
  );
}
