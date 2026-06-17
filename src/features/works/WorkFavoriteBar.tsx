import { Star } from "lucide-react";

import { TogglePill } from "@/components/common/TogglePill";
import {
  getOwnerBadgeLabel,
  getOwnerColor,
} from "@/constants/ownerColors";
import type { Owner } from "@/types/database";
import "./WorkFavoriteBar.css";

export interface WorkFavoriteBarProps {
  owners: Owner[];
  favoriteOwnerIds: string[];
  disabled?: boolean;
  onToggle: (ownerId: string, favorited: boolean) => void;
  /** Barre d'actions en tête de fiche détail ou bloc sous le hero. */
  placement?: "header" | "section";
}

/**
 * @description Bascule les favoris d'une série pour les propriétaires passés en props.
 */
export function WorkFavoriteBar({
  owners,
  favoriteOwnerIds,
  disabled = false,
  onToggle,
  placement = "section",
}: WorkFavoriteBarProps) {
  if (placement === "header") {
    const owner = owners[0];
    if (!owner) {
      return null;
    }

    const active = favoriteOwnerIds.includes(owner.id);
    const toggleTitle = active
      ? "Retirer des favoris"
      : "Ajouter aux favoris";

    return (
      <button
        type="button"
        className={`work-favorite-header-btn${active ? " work-favorite-header-btn--active" : ""}`}
        disabled={disabled}
        title={toggleTitle}
        aria-label={toggleTitle}
        aria-pressed={active}
        onClick={() => onToggle(owner.id, !active)}
      >
        <Star
          className="work-favorite-header-btn-star"
          size={18}
          aria-hidden
          fill={active ? "currentColor" : "none"}
          strokeWidth={active ? 0 : 2}
        />
        <span className="work-detail-action-label">Favoris ★</span>
      </button>
    );
  }

  return (
    <section className="work-favorite-bar" aria-label="Favoris par propriétaire">
      <span className="work-favorite-bar-label">Favoris</span>
      <div className="toggle-pill-group">
        {owners.map((owner) => {
          const active = favoriteOwnerIds.includes(owner.id);
          return (
            <TogglePill
              key={`favorite-${owner.id}`}
              label={`★ ${getOwnerBadgeLabel(owner.name)}`}
              color={getOwnerColor(owner.name)}
              showColorWhenIdle
              visualVariant="outline"
              active={active}
              disabled={disabled}
              onClick={() => onToggle(owner.id, !active)}
            />
          );
        })}
      </div>
    </section>
  );
}
