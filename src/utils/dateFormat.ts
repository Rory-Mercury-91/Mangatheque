/**
 * @description Parse une saisie flexible : ISO, JJ-MM-AAAA ou raccourci J-M-A (ex. 4-6-26).
 * @param raw Texte saisi par l'utilisateur.
 * @returns Date ISO YYYY-MM-DD ou null si invalide.
 */
export function parseFlexibleDateInput(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) {
    return null;
  }

  const trimmed = raw.trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return buildIsoDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const parts = trimmed.split(/[-/.]/).map((part) => part.trim());
  if (parts.length !== 3 || parts.some((part) => !/^\d{1,4}$/.test(part))) {
    return null;
  }

  const nums = parts.map((part) => Number(part));
  if (nums.some((value) => Number.isNaN(value))) {
    return null;
  }

  let day: number;
  let month: number;
  let year: number;

  if (parts[0].length === 4) {
    [year, month, day] = nums;
  } else {
    [day, month, year] = nums;
  }

  return buildIsoDate(year, month, day);
}

/**
 * @description Affiche une date ISO en saisie compacte J-M-A (ex. 4-6-26).
 * @param isoDate Date ISO stockée.
 */
export function formatDateInputCompact(
  isoDate: string | null | undefined,
): string {
  const normalized = normalizeIsoDate(isoDate);
  if (!normalized) {
    return isoDate?.trim() ?? "";
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return isoDate?.trim() ?? "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const shortYear = String(year).slice(-2);
  return `${day}-${month}-${shortYear}`;
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (year >= 0 && year < 100) {
    year += 2000;
  }

  if (year < 1900 || year > 2100) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * @description Normalise une date ISO (YYYY-MM-DD), corrige les années courtes (ex. 0023 → 2023).
 * @param isoDate Date saisie ou stockée.
 * @returns Date ISO valide ou null si illisible.
 */
export function normalizeIsoDate(
  isoDate: string | null | undefined,
): string | null {
  if (!isoDate?.trim()) {
    return null;
  }

  const trimmed = isoDate.trim();
  const isoPrefix = trimmed.match(/^(\d{1,4})-(\d{2})-(\d{2})/);
  if (isoPrefix && isoPrefix[1].length === 4) {
    return buildIsoDate(
      Number(isoPrefix[1]),
      Number(isoPrefix[2]),
      Number(isoPrefix[3]),
    );
  }

  return parseFlexibleDateInput(trimmed);
}

/**
 * @description Extrait la clé mensuelle YYYY-MM à partir d'une date d'achat.
 * @param isoDate Date ISO d'achat.
 */
export function isoDateToPeriodKey(isoDate: string): string | null {
  const normalized = normalizeIsoDate(isoDate);
  if (!normalized) {
    return null;
  }

  const periodKey = normalized.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(periodKey) ? periodKey : null;
}

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
  // Placeholders MAL / ADKami (0000-00-00)
  if (/^0000-00-00/.test(raw)) {
    return "";
  }

  const normalized = normalizeIsoDate(isoDate);
  if (normalized) {
    const [, year, month, day] =
      normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
    if (year && month && day) {
      return `${day}-${month}-${year}`;
    }
  }

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

/**
 * @description Affiche uniquement le mois (ex. « janv. ») pour une clé YYYY-MM.
 * @param periodKey Clé période YYYY-MM.
 */
export function formatMonthShortFr(periodKey: string): string {
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

  return date.toLocaleDateString("fr-FR", { month: "short" });
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
