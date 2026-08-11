/** Jours de la semaine : 0 = Lundi … 6 = Dimanche. */
export const RELEASE_WEEKDAY_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
  short: string;
}> = [
  { value: 0, label: "Lundi", short: "Lun" },
  { value: 1, label: "Mardi", short: "Mar" },
  { value: 2, label: "Mercredi", short: "Mer" },
  { value: 3, label: "Jeudi", short: "Jeu" },
  { value: 4, label: "Vendredi", short: "Ven" },
  { value: 5, label: "Samedi", short: "Sam" },
  { value: 6, label: "Dimanche", short: "Dim" },
];

/**
 * @description Sérialise les jours cochés (ex. "0,2,4").
 */
export function serializeReleaseWeekdays(days: number[]): string {
  return [...new Set(days.filter((d) => d >= 0 && d <= 6))]
    .sort((a, b) => a - b)
    .join(",");
}

/**
 * @description Parse une valeur stockée ou une liste déjà numérique.
 */
export function parseReleaseWeekdays(
  raw: string | number[] | undefined | null,
): number[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.filter((n) => Number.isFinite(n) && n >= 0 && n <= 6))].sort(
      (a, b) => a - b,
    );
  }
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}

/**
 * @description Libellé FR des jours (« Lundi, Mercredi et Vendredi »).
 */
export function formatReleaseWeekdaysText(days: number[]): string {
  const labels = days
    .map((d) => RELEASE_WEEKDAY_OPTIONS.find((o) => o.value === d)?.label)
    .filter((l): l is string => Boolean(l));
  if (labels.length === 0) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0]!;
  }
  if (labels.length === 2) {
    return `${labels[0]} et ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

/**
 * @description Convertit une Date en ISO AAAA-MM-JJ (minuit local).
 */
export function dateToIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @description Parse une saisie relative (« 7 », « 7 j », « 7 jours »).
 */
export function parseDaysOffsetInput(raw: string): number | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return null;
  }
  const m = trimmed.match(/^\+?(\d+)\s*(?:j|jours?)?$/i);
  if (!m) {
    return null;
  }
  const days = Number.parseInt(m[1]!, 10);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

/**
 * @description Aujourd'hui (minuit local) + N jours → AAAA-MM-JJ.
 */
export function addDaysFromTodayIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return dateToIsoLocal(d);
}

/**
 * @description Résout ISO ou offset « X j » en AAAA-MM-JJ.
 */
export function resolveStoredDateValue(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "";
  }
  const days = parseDaysOffsetInput(trimmed);
  if (days !== null) {
    return addDaysFromTodayIso(days);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * @description Nombre de jours entre aujourd'hui et une date ISO.
 */
export function isoDateToDaysFromToday(isoDate: string): number | null {
  const resolved = resolveStoredDateValue(isoDate);
  const m = resolved.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return null;
  }
  const target = new Date(
    Number.parseInt(m[1]!, 10),
    Number.parseInt(m[2]!, 10) - 1,
    Number.parseInt(m[3]!, 10),
    0,
    0,
    0,
    0,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * @description Prochain jour de sortie strictement après fromIso.
 */
export function computeNextReleaseDate(
  fromIso: string,
  weekdays: number[],
): string | null {
  if (!fromIso || weekdays.length === 0) {
    return null;
  }
  const m = fromIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return null;
  }
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  const start = new Date(
    Number.parseInt(m[1]!, 10),
    Number.parseInt(m[2]!, 10) - 1,
    Number.parseInt(m[3]!, 10),
    0,
    0,
    0,
    0,
  );
  const candidate = new Date(start);
  candidate.setDate(candidate.getDate() + 1);
  for (let i = 0; i < 14; i += 1) {
    const jsDay = candidate.getDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;
    if (sorted.includes(weekday)) {
      return dateToIsoLocal(candidate);
    }
    candidate.setDate(candidate.getDate() + 1);
  }
  return null;
}

/**
 * @description Prochain jour de sortie dans le mois suivant (mode mensuel).
 */
export function computeNextMonthlyReleaseDate(
  fromIso: string,
  weekdays: number[],
): string | null {
  if (!fromIso || weekdays.length === 0) {
    return null;
  }
  const m = fromIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return null;
  }
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  const anchor = new Date(
    Number.parseInt(m[1]!, 10),
    Number.parseInt(m[2]!, 10) - 1,
    Number.parseInt(m[3]!, 10),
    0,
    0,
    0,
    0,
  );
  const nextMonthStart = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const month = nextMonthStart.getMonth();
  for (let day = 1; day <= 31; day += 1) {
    const candidate = new Date(
      nextMonthStart.getFullYear(),
      month,
      day,
      0,
      0,
      0,
      0,
    );
    if (candidate.getMonth() !== month) {
      break;
    }
    const jsDay = candidate.getDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;
    if (sorted.includes(weekday)) {
      return dateToIsoLocal(candidate);
    }
  }
  return null;
}

/**
 * @description Prochaine date selon mode hebdo ou mensuel.
 */
export function computeNextReleaseDateByMode(
  fromIso: string,
  weekdays: number[],
  monthly: boolean,
): string | null {
  return monthly
    ? computeNextMonthlyReleaseDate(fromIso, weekdays)
    : computeNextReleaseDate(fromIso, weekdays);
}

/**
 * @description True si la date ISO (ou offset) est strictement avant aujourd'hui.
 */
export function isReleaseDatePassed(dateIso: string): boolean {
  const resolved = resolveStoredDateValue(dateIso);
  const m = resolved.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return false;
  }
  const target = new Date(
    Number.parseInt(m[1]!, 10),
    Number.parseInt(m[2]!, 10) - 1,
    Number.parseInt(m[3]!, 10),
    0,
    0,
    0,
    0,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() > target.getTime();
}

/**
 * @description Prochain chapitre = actuel + 1 si entier.
 */
export function computeNextChapter(current: string): string {
  const trimmed = (current || "").trim();
  if (!trimmed) {
    return "";
  }
  if (/^\d+$/.test(trimmed)) {
    return String(Number.parseInt(trimmed, 10) + 1);
  }
  return trimmed;
}
