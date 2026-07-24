/** Historique agenda conservé (jours). */
export const ADKAMI_AGENDA_HISTORY_DAYS = 365;

/**
 * @description Lundi 00:00 local de la semaine contenant `date`.
 */
export function startOfWeekMonday(date: Date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 dimanche … 6 samedi
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * @description Ajoute `weeks` semaines à un lundi (copie).
 */
export function addWeeks(monday: Date, weeks: number): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/**
 * @description Fin exclusive de la semaine (lundi suivant 00:00).
 */
export function endOfWeekExclusive(monday: Date): Date {
  return addWeeks(monday, 1);
}

/**
 * @description Format ADKami `YY-MM-DD` (paramètre ?date=).
 */
export function formatAdkamiAgendaDate(monday: Date): string {
  const yy = String(monday.getFullYear() % 100).padStart(2, "0");
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * @description Parse `YY-MM-DD` ADKami vers Date locale (minuit).
 */
export function parseAdkamiAgendaDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = 2000 + Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * @description Plus ancien lundi navigable (historique ~1 an).
 */
export function getEarliestNavigableMonday(now: Date = new Date()): Date {
  const limit = new Date(now);
  limit.setDate(limit.getDate() - ADKAMI_AGENDA_HISTORY_DAYS);
  return startOfWeekMonday(limit);
}

/**
 * @description Indique si on peut aller à la semaine précédente.
 */
export function canGoToPreviousWeek(weekMonday: Date, now: Date = new Date()): boolean {
  return weekMonday.getTime() > getEarliestNavigableMonday(now).getTime();
}

/**
 * @description Libellé FR de la plage lundi–dimanche.
 */
export function formatWeekRangeLabel(weekMonday: Date): string {
  const sunday = new Date(weekMonday);
  sunday.setDate(sunday.getDate() + 6);
  const sameMonth = weekMonday.getMonth() === sunday.getMonth();
  const sameYear = weekMonday.getFullYear() === sunday.getFullYear();

  if (sameMonth && sameYear) {
    return `${weekMonday.getDate()}–${sunday.getDate()} ${weekMonday.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}`;
  }
  if (sameYear) {
    return `${weekMonday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${weekMonday.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} – ${sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
}

/**
 * @description Index jour 0=lundi … 6=dimanche pour une date dans la semaine.
 */
export function weekdayIndexFromMonday(date: Date, weekMonday: Date): number | null {
  const start = weekMonday.getTime();
  const end = endOfWeekExclusive(weekMonday).getTime();
  const t = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  if (t < start || t >= end) return null;
  return Math.round((t - start) / (24 * 60 * 60 * 1000));
}

/**
 * @description Date locale (jour civil) pour une colonne du calendrier.
 */
export function dateForWeekday(weekMonday: Date, weekdayIndex: number): Date {
  const d = new Date(weekMonday);
  d.setDate(d.getDate() + weekdayIndex);
  return d;
}
