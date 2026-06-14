import { useEffect, useMemo, useState } from "react";
import type { PurchaseRecapPeriod } from "@/services/financialService";
import { PurchaseRecapMonthModal } from "@/features/dashboard/PurchaseRecapMonthModal";
import {
  buildPurchaseMonthsForYear,
  extractPurchaseYears,
  resolveDefaultPurchaseYear,
} from "@/features/dashboard/purchaseRecapUtils";
import { formatVolumeTitle } from "@/utils/volumeDisplay";
import "./PurchaseRecapChart.css";

export interface PurchaseRecapChartProps {
  periods: PurchaseRecapPeriod[];
}

const TOOLTIP_VOLUME_LIMIT = 4;

const formatCurrency = (amount: number) =>
  amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Affiche le libellé mois sur deux lignes pour le graphique mobile. */
function splitPeriodLabel(label: string): { primary: string; secondary?: string } {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { primary: parts[0], secondary: parts.slice(1).join(" ") };
  }
  return { primary: label };
}

interface MonthTooltipProps {
  period: PurchaseRecapPeriod;
}

/** Infobulle au survol d'une colonne mensuelle. */
function MonthTooltip({ period }: MonthTooltipProps) {
  if (period.volumeCount === 0) {
    return (
      <div className="purchase-recap-tooltip" role="tooltip">
        <span className="purchase-recap-tooltip-title">{period.label}</span>
        <span className="purchase-recap-tooltip-empty">Aucun achat</span>
      </div>
    );
  }

  const previewVolumes = period.volumes.slice(0, TOOLTIP_VOLUME_LIMIT);
  const remainingCount = period.volumeCount - previewVolumes.length;

  return (
    <div className="purchase-recap-tooltip" role="tooltip">
      <span className="purchase-recap-tooltip-title">
        {period.label} — {formatCurrency(period.totalPaid)} · {period.volumeCount}{" "}
        tome{period.volumeCount > 1 ? "s" : ""}
      </span>
      <ul className="purchase-recap-tooltip-list">
        {previewVolumes.map((volume) => (
          <li key={volume.volumeId}>
            {volume.workTitle} —{" "}
            {formatVolumeTitle(
              volume.volumeNumber,
              volume.volumeLabel,
              volume.trackingUnit,
            )}
          </li>
        ))}
      </ul>
      {remainingCount > 0 ? (
        <span className="purchase-recap-tooltip-more">
          + {remainingCount} autre{remainingCount > 1 ? "s" : ""}
        </span>
      ) : null}
      <span className="purchase-recap-tooltip-hint">Cliquer pour le détail</span>
    </div>
  );
}

/**
 * @description Graphique en barres des dépenses d'achat par mois (filtré par année).
 */
export function PurchaseRecapChart({ periods }: PurchaseRecapChartProps) {
  const availableYears = useMemo(
    () => extractPurchaseYears(periods),
    [periods],
  );
  const [selectedYear, setSelectedYear] = useState(() =>
    resolveDefaultPurchaseYear(periods),
  );
  const [modalPeriod, setModalPeriod] = useState<PurchaseRecapPeriod | null>(
    null,
  );

  useEffect(() => {
    if (periods.length === 0) {
      return;
    }

    setSelectedYear((current) =>
      availableYears.includes(current)
        ? current
        : resolveDefaultPurchaseYear(periods),
    );
  }, [periods, availableYears]);

  const yearPeriods = useMemo(
    () => buildPurchaseMonthsForYear(selectedYear, periods),
    [periods, selectedYear],
  );

  if (periods.length === 0) {
    return (
      <p className="purchase-recap-empty">
        Aucun achat daté. Renseignez la date d&apos;achat sur vos tomes pour
        voir le récapitulatif.
      </p>
    );
  }

  const maxPaid = Math.max(...yearPeriods.map((period) => period.totalPaid), 1);
  const totalPaid = yearPeriods.reduce((sum, period) => sum + period.totalPaid, 0);
  const totalVolumes = yearPeriods.reduce(
    (sum, period) => sum + period.volumeCount,
    0,
  );

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    setModalPeriod(null);
  };

  return (
    <>
      <div className="purchase-recap">
        <div className="purchase-recap-toolbar">
          <label className="purchase-recap-year-field">
            <span className="purchase-recap-year-label">Année</span>
            <select
              className="purchase-recap-year-select"
              value={selectedYear}
              aria-label="Année du récapitulatif d'achat"
              onChange={(event) => handleYearChange(Number(event.target.value))}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <div className="purchase-recap-summary">
            <span>
              <strong>{formatCurrency(totalPaid)}</strong> dépensés en {selectedYear}
            </span>
            <span className="purchase-recap-summary-meta">
              {totalVolumes} tome{totalVolumes > 1 ? "s" : ""} daté
              {totalVolumes > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div
          className="purchase-recap-chart"
          role="img"
          aria-label={`Graphique des dépenses mensuelles pour ${selectedYear}`}
        >
          {yearPeriods.map((period) => {
            const heightPercent = Math.max(
              (period.totalPaid / maxPaid) * 100,
              period.volumeCount > 0 ? 6 : 0,
            );
            const labelParts = splitPeriodLabel(period.label);
            const isInteractive = period.volumeCount > 0;

            return (
              <div
                key={period.periodKey}
                className={`purchase-recap-column${isInteractive ? " purchase-recap-column--interactive" : ""}`}
              >
                <MonthTooltip period={period} />

                <span className="purchase-recap-value">
                  {period.totalPaid > 0 ? formatCurrency(period.totalPaid) : "—"}
                </span>

                {isInteractive ? (
                  <button
                    type="button"
                    className="purchase-recap-bar-track"
                    aria-label={`${period.label} : ${formatCurrency(period.totalPaid)}, ${period.volumeCount} tome${period.volumeCount > 1 ? "s" : ""}. Voir le détail.`}
                    onClick={() => setModalPeriod(period)}
                  >
                    <div
                      className="purchase-recap-bar"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </button>
                ) : (
                  <div className="purchase-recap-bar-track purchase-recap-bar-track--empty">
                    <div
                      className="purchase-recap-bar purchase-recap-bar--empty"
                      style={{ height: period.volumeCount > 0 ? `${heightPercent}%` : "0" }}
                    />
                  </div>
                )}

                <span className="purchase-recap-label">
                  <span className="purchase-recap-label-line">{labelParts.primary}</span>
                  {labelParts.secondary ? (
                    <span className="purchase-recap-label-line purchase-recap-label-line--sub">
                      {labelParts.secondary}
                    </span>
                  ) : null}
                </span>
                <span className="purchase-recap-count">
                  {period.volumeCount > 0 ? `${period.volumeCount} t.` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <PurchaseRecapMonthModal
        period={modalPeriod}
        onClose={() => setModalPeriod(null)}
      />
    </>
  );
}
