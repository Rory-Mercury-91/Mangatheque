/**
 * @description Affiche une date au format français JJ-MM-AAAA.
 * @param isoDate Date ISO (YYYY-MM-DD) ou chaîne parseable.
 * @returns Date formatée ou chaîne vide si absente.
 */
export function formatDateFr(isoDate: string | null | undefined): string {
  if (!isoDate?.trim()) {
    return "";
  }

  const raw = isoDate.trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * @description Affiche une date-heure au format français (JJ/MM/AAAA, HH:mm).
 * @param isoDateTime Horodatage ISO.
 * @returns Chaîne localisée française.
 */
/**
 * @description Affiche un mois au format court français (ex. « juin 2026 »).
 * @param periodKey Clé période YYYY-MM.
 */
export function formatMonthYearFr(periodKey: string): string {
  const match = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return periodKey;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return periodKey;
  }

  return date.toLocaleDateString("fr-FR", {
    month: "short",
    year: "numeric",
  });
}

export function formatDateTimeFr(isoDateTime: string | null | undefined): string {
  if (!isoDateTime?.trim()) {
    return "";
  }

  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return isoDateTime;
  }

  return parsed.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
