import type { PurchaseRecapPeriod } from "@/services/financialService";
import { formatMonthShortFr } from "@/utils/dateFormat";

const EMPTY_PERIOD = (
  periodKey: string,
): PurchaseRecapPeriod => ({
  periodKey,
  label: formatMonthShortFr(periodKey),
  totalPaid: 0,
  volumeCount: 0,
  volumes: [],
});

/**
 * @description Extrait les années présentes dans le récapitulatif, triées.
 */
export function extractPurchaseYears(periods: PurchaseRecapPeriod[]): number[] {
  const years = new Set<number>();
  for (const period of periods) {
    const year = Number(period.periodKey.slice(0, 4));
    if (!Number.isNaN(year)) {
      years.add(year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

/**
 * @description Choisit l'année affichée par défaut (année courante si achats, sinon la plus récente).
 */
export function resolveDefaultPurchaseYear(
  periods: PurchaseRecapPeriod[],
): number {
  const years = extractPurchaseYears(periods);
  if (years.length === 0) {
    return new Date().getFullYear();
  }

  const currentYear = new Date().getFullYear();
  if (years.includes(currentYear)) {
    return currentYear;
  }

  return years[years.length - 1];
}

/**
 * @description Construit les 12 mois d'une année avec les données agrégées existantes.
 */
export function buildPurchaseMonthsForYear(
  year: number,
  periods: PurchaseRecapPeriod[],
): PurchaseRecapPeriod[] {
  const periodByKey = new Map(
    periods.map((period) => [period.periodKey, period]),
  );

  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const periodKey = `${year}-${month}`;
    const existing = periodByKey.get(periodKey);
    if (!existing) {
      return EMPTY_PERIOD(periodKey);
    }

    return {
      ...existing,
      label: formatMonthShortFr(periodKey),
    };
  });
}
