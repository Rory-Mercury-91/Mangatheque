import type { GlobalFinancials } from "@/services/financialService";
import "./FinancialSummary.css";

export interface FinancialSummaryProps {
  financials: GlobalFinancials;
  compact?: boolean;
}

/**
 * @description Cartes récapitulatives des coûts globaux et par personne.
 */
export function FinancialSummary({
  financials,
  compact = false,
}: FinancialSummaryProps) {
  const format = (n: number) =>
    n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <div className={`financial-summary${compact ? " financial-summary--compact" : ""}`}>
      <div className="financial-cards">
        <article className="financial-card">
          <span className="financial-card-label">Valeur catalogue</span>
          <strong>{format(financials.catalogValue)}</strong>
        </article>
        <article className="financial-card financial-card--paid">
          <span className="financial-card-label">Total dépensé</span>
          <strong>{format(financials.totalPaid)}</strong>
        </article>
        <article className="financial-card financial-card--mihon">
          <span className="financial-card-label">Économie Mihon</span>
          <strong>{format(financials.totalMihonSavings)}</strong>
        </article>
      </div>

      <section className="financial-owners">
        <h3>Par personne</h3>
        <ul className="financial-owner-list">
          {financials.perOwner.map((owner) => (
            <li key={owner.ownerId} className="financial-owner-row">
              <span
                className="financial-owner-name"
                style={{ borderColor: owner.color }}
              >
                {owner.ownerName}
              </span>
              <span className="financial-owner-paid">
                Dépensé : {format(owner.amountPaid)}
              </span>
              {owner.mihonSavings > 0 && (
                <span className="financial-owner-mihon">
                  Mihon : −{format(owner.mihonSavings)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
