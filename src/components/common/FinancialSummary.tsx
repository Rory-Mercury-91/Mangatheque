import type { CSSProperties } from "react";
import { getOwnerColor, getOwnerDisplayName } from "@/constants/ownerColors";
import { useTouchTabletLayout } from "@/hooks/useTouchTabletLayout";
import { isMobileRuntime } from "@/lib/platform";
import type { GlobalFinancials } from "@/services/financialService";
import "./FinancialSummary.css";

export interface FinancialSummaryProps {
  financials: GlobalFinancials;
  workCount: number;
  /** @description Ouvre la bibliothèque filtrée sur le compte (présent, sans Mihon). */
  onOwnerCardClick?: (ownerId: string) => void;
  /** @description Ouvre la bibliothèque filtrée sur les séries Mihon. */
  onMihonCardClick?: () => void;
}

/**
 * @description Cartes récapitulatives : totaux globaux, dépenses par personne et Mihon.
 */
export function FinancialSummary({
  financials,
  workCount,
  onOwnerCardClick,
  onMihonCardClick,
}: FinancialSummaryProps) {
  const touchTabletLayout = useTouchTabletLayout(isMobileRuntime());
  const format = (n: number) =>
    n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  const cardCount = 2 + financials.perOwner.length + 1;
  const workLabel = `${workCount} série${workCount > 1 ? "s" : ""}`;

  return (
    <div
      className="financial-summary"
      style={{ "--financial-card-count": cardCount } as CSSProperties}
    >
      <div
        className={[
          "financial-cards",
          touchTabletLayout ? "financial-cards--tablet-split" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <article className="financial-card">
          <span className="financial-card-label">Valeur catalogue</span>
          <strong>{format(financials.catalogValue)}</strong>
          <span className="financial-card-sub financial-card-sub--muted">
            {workLabel}
          </span>
        </article>
        <article className="financial-card financial-card--paid">
          <span className="financial-card-label">Total dépensé</span>
          <strong>{format(financials.totalPaid)}</strong>
        </article>
        {financials.perOwner.map((owner) => {
          const ownerLabel = getOwnerDisplayName(owner.ownerName);
          const ownerCardClassName = [
            "financial-card",
            "financial-card--owner",
            onOwnerCardClick ? "financial-card--clickable" : "",
          ]
            .filter(Boolean)
            .join(" ");

          if (onOwnerCardClick) {
            return (
              <button
                key={owner.ownerId}
                type="button"
                className={ownerCardClassName}
                style={
                  {
                    "--owner-color": getOwnerColor(owner.ownerName),
                  } as CSSProperties
                }
                onClick={() => onOwnerCardClick(owner.ownerId)}
                aria-label={`Voir la bibliothèque — ${ownerLabel}, présent sans Mihon`}
              >
                <span className="financial-card-label">{ownerLabel}</span>
                <strong>{format(owner.amountPaid)}</strong>
              </button>
            );
          }

          return (
            <article
              key={owner.ownerId}
              className={ownerCardClassName}
              style={
                {
                  "--owner-color": getOwnerColor(owner.ownerName),
                } as CSSProperties
              }
            >
              <span className="financial-card-label">{ownerLabel}</span>
              <strong>{format(owner.amountPaid)}</strong>
            </article>
          );
        })}
        {onMihonCardClick ? (
          <button
            type="button"
            className="financial-card financial-card--mihon financial-card--clickable"
            onClick={onMihonCardClick}
            aria-label="Voir la bibliothèque — séries Mihon"
          >
            <span className="financial-card-label">Mihon</span>
            <strong>{format(financials.totalMihonSavings)}</strong>
          </button>
        ) : (
          <article className="financial-card financial-card--mihon">
            <span className="financial-card-label">Mihon</span>
            <strong>{format(financials.totalMihonSavings)}</strong>
          </article>
        )}
      </div>
    </div>
  );
}
