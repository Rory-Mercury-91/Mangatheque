import type { WebtoonPlanningEntry } from "@/services/workReleaseScheduleService";

/**
 * @description Parse une date ISO AAAA-MM-JJ en Date locale.
 */
export function parseLocalIsoDate(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    return null;
  }
  return new Date(
    Number.parseInt(m[1]!, 10),
    Number.parseInt(m[2]!, 10) - 1,
    Number.parseInt(m[3]!, 10),
  );
}

/**
 * @description Métadonnées chapitre / plateforme pour une carte planning.
 */
export function formatWebtoonPlanningMeta(entry: WebtoonPlanningEntry): string {
  const parts: string[] = [];
  if (entry.chapterLabel) {
    parts.push(`Ch. ${entry.chapterLabel}`);
  }
  if (entry.platformLabel) {
    parts.push(entry.platformLabel);
  }
  return parts.length > 0 ? parts.join(" · ") : "Sortie prévue";
}
