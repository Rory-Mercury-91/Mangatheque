import type { CSSProperties } from "react";
import { getOwnerColor, getOwnerDisplayName } from "@/constants/ownerColors";
import type { Owner, SeriesFinancials } from "@/types/database";
import { formatCurrency } from "@/utils/ownerDisplay";
import "./WorkSeriesFinancialCards.css";

export interface WorkSeriesFinancialCardsProps {
  financials: SeriesFinancials;
  owners: Owner[];
}

/**
 * @description Cartes financières d'une série sur une seule ligne.
 */
export function WorkSeriesFinancialCards({
  financials,
  owners,
}: WorkSeriesFinancialCardsProps) {
  const sortedOwners = [...owners].sort((a, b) => a.sort_order - b.sort_order);
  const cardCount = 3 + sortedOwners.length;

  return (
    <div
      className="work-series-financial-cards"
      style={{ "--financial-card-count": cardCount } as CSSProperties}
    >
      <article className="work-series-financial-card">
        <span>Valeur catalogue</span>
        <strong>{formatCurrency(financials.catalogValue)}</strong>
      </article>
      <article className="work-series-financial-card work-series-financial-card--paid">
        <span>Total dépensé</span>
        <strong>{formatCurrency(financials.totalPaid)}</strong>
      </article>
      {sortedOwners.map((owner) => {
        const row = financials.perOwner.find((item) => item.ownerId === owner.id);
        const amountPaid = row?.amountPaid ?? 0;
        const mihonSavings = row?.mihonSavings ?? 0;
        return (
          <article
            key={owner.id}
            className="work-series-financial-card work-series-financial-card--owner"
            style={
              { "--owner-color": getOwnerColor(owner.name) } as CSSProperties
            }
          >
            <span>{getOwnerDisplayName(owner.name)}</span>
            <strong>{formatCurrency(amountPaid)}</strong>
            {mihonSavings > 0 ? (
              <small>Mihon −{formatCurrency(mihonSavings)}</small>
            ) : null}
          </article>
        );
      })}
      <article className="work-series-financial-card work-series-financial-card--mihon">
        <span>Mihon</span>
        <strong>{formatCurrency(financials.totalMihonSavings)}</strong>
      </article>
    </div>
  );
}
