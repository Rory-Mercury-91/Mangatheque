import type { CSSProperties } from "react";
import { getOwnerColor, getOwnerDisplayName } from "@/constants/ownerColors";
import type { GlobalFinancials } from "@/services/financialService";
import "./FinancialSummary.css";

export interface FinancialSummaryProps {
  financials: GlobalFinancials;
  workCount: number;
}

/**
 * @description Cartes récapitulatives : totaux globaux, dépenses par personne et Mihon.
 */
export function FinancialSummary({
  financials,
  workCount,
}: FinancialSummaryProps) {
  const format = (n: number) =>
    n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  const cardCount = 2 + financials.perOwner.length + 1;
  const workLabel = `${workCount} série${workCount > 1 ? "s" : ""}`;

  return (
    <div
      className="financial-summary"
      style={{ "--financial-card-count": cardCount } as CSSProperties}
    >
      <div className="financial-cards">
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
        {financials.perOwner.map((owner) => (
          <article
            key={owner.ownerId}
            className="financial-card financial-card--owner"
            style={
              { "--owner-color": getOwnerColor(owner.ownerName) } as CSSProperties
            }
          >
            <span className="financial-card-label">
              {getOwnerDisplayName(owner.ownerName)}
            </span>
            <strong>{format(owner.amountPaid)}</strong>
            {owner.mihonSavings > 0 ? (
              <span className="financial-card-sub financial-card-sub--mihon">
                Mihon −{format(owner.mihonSavings)}
              </span>
            ) : null}
          </article>
        ))}
        <article className="financial-card financial-card--mihon">
          <span className="financial-card-label">Mihon</span>
          <strong>{format(financials.totalMihonSavings)}</strong>
        </article>
      </div>
    </div>
  );
}
