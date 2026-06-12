import type { PurchaseRecapPeriod } from "@/services/financialService";
import "./PurchaseRecapChart.css";

export interface PurchaseRecapChartProps {
  periods: PurchaseRecapPeriod[];
}

const formatCurrency = (amount: number) =>
  amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/**
 * @description Graphique en barres des dépenses d'achat par mois.
 */
export function PurchaseRecapChart({ periods }: PurchaseRecapChartProps) {
  if (periods.length === 0) {
    return (
      <p className="purchase-recap-empty">
        Aucun achat daté. Renseignez la date d&apos;achat sur vos tomes pour
        voir le récapitulatif.
      </p>
    );
  }

  const maxPaid = Math.max(...periods.map((period) => period.totalPaid), 1);
  const totalPaid = periods.reduce((sum, period) => sum + period.totalPaid, 0);
  const totalVolumes = periods.reduce(
    (sum, period) => sum + period.volumeCount,
    0,
  );

  return (
    <div className="purchase-recap">
      <div className="purchase-recap-summary">
        <span>
          <strong>{formatCurrency(totalPaid)}</strong> dépensés sur la période
        </span>
        <span className="purchase-recap-summary-meta">
          {totalVolumes} tome{totalVolumes > 1 ? "s" : ""} daté
          {totalVolumes > 1 ? "s" : ""}
        </span>
      </div>

      <div
        className="purchase-recap-chart"
        role="img"
        aria-label="Graphique des dépenses mensuelles"
      >
        {periods.map((period) => {
          const heightPercent = Math.max(
            (period.totalPaid / maxPaid) * 100,
            period.volumeCount > 0 ? 6 : 0,
          );
          const tooltip = `${period.label} — ${formatCurrency(period.totalPaid)} · ${period.volumeCount} tome${period.volumeCount > 1 ? "s" : ""}`;

          return (
            <div key={period.periodKey} className="purchase-recap-column">
              <span className="purchase-recap-value" title={tooltip}>
                {period.totalPaid > 0 ? formatCurrency(period.totalPaid) : "—"}
              </span>
              <div className="purchase-recap-bar-track" title={tooltip}>
                <div
                  className="purchase-recap-bar"
                  style={{ height: `${heightPercent}%` }}
                />
              </div>
              <span className="purchase-recap-label" title={tooltip}>
                {period.label}
              </span>
              <span className="purchase-recap-count">
                {period.volumeCount} t.
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
