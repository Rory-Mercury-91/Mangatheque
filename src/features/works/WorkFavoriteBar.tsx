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
}

/**
 * @description Bascule les favoris d'une série par propriétaire du foyer.
 */
export function WorkFavoriteBar({
  owners,
  favoriteOwnerIds,
  disabled = false,
  onToggle,
}: WorkFavoriteBarProps) {
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
