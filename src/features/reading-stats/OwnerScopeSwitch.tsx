import type { CSSProperties } from "react";
import { getOwnerColor, getOwnerDisplayName } from "@/constants/ownerColors";
import type { Owner } from "@/types/database";
import type { ReadingStatsOwnerScope } from "@/types/readingStats";
import "./OwnerScopeSwitch.css";

export interface OwnerScopeSwitchProps {
  owners: Owner[];
  value: ReadingStatsOwnerScope;
  onChange: (scope: ReadingStatsOwnerScope) => void;
}

/**
 * @description Sélecteur pour le compteur « séries possédées » (achat ou Mihon).
 */
export function OwnerScopeSwitch({
  owners,
  value,
  onChange,
}: OwnerScopeSwitchProps) {
  return (
    <div
      className="owner-scope-switch"
      role="group"
      aria-label="Filtrer les séries possédées"
    >      <button
        type="button"
        className={`owner-scope-pill${value === "all" ? " owner-scope-pill--active" : ""}`}
        onClick={() => onChange("all")}
      >
        Tous
      </button>
      {owners.map((owner) => {
        const active = value === owner.id;
        return (
          <button
            key={owner.id}
            type="button"
            className={`owner-scope-pill${active ? " owner-scope-pill--active" : ""}`}
            style={
              active
                ? ({ "--owner-color": getOwnerColor(owner.name) } as CSSProperties)
                : undefined
            }
            onClick={() => onChange(owner.id)}
          >
            {getOwnerDisplayName(owner.name)}
          </button>
        );
      })}
    </div>
  );
}
