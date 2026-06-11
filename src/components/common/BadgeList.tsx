import "./BadgeList.css";

export interface BadgeListProps {
  items: string[];
  emptyLabel?: string;
}

/**
 * @description Affiche genres et thèmes sous forme de badges.
 */
export function BadgeList({ items, emptyLabel = "—" }: BadgeListProps) {
  if (items.length === 0) {
    return <span className="badge-empty">{emptyLabel}</span>;
  }

  return (
    <div className="badge-list">
      {items.map((item) => (
        <span key={item} className="badge">
          {item}
        </span>
      ))}
    </div>
  );
}
