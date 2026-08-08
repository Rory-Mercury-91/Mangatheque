import type { WorkReadingStatus } from "@/types/database";

/**
 * @description Indique si une série chapitres encore publiée (« En cours »)
 * peut relever le catalogue au +1 et rester « En cours » à 100 %.
 * @param workStatus - Statut VF / publication de l'œuvre.
 * @param hasChapterTracking - L'œuvre suit des chapitres.
 */
export function shouldKeepChapterReadingGap(
  workStatus: WorkReadingStatus | null | undefined,
  hasChapterTracking: boolean,
): boolean {
  return hasChapterTracking && workStatus === "ongoing";
}

/**
 * @description Calcule la progression après un +1.
 * Si on dépasse le catalogue, releve lus et total au même niveau (pas d'écart forcé).
 * @param chaptersRead - Chapitres lus actuels.
 * @param chaptersTotal - Total catalogue actuel.
 */
export function nextChapterProgressAfterIncrement(
  chaptersRead: number,
  chaptersTotal: number,
): { chaptersRead: number; catalogueFloor: number; expandCatalogue: boolean } {
  const read = Math.max(0, Math.floor(chaptersRead));
  const total = Math.max(0, Math.floor(chaptersTotal));
  const nextRead = read + 1;
  const catalogueFloor = Math.max(total, nextRead);

  return {
    chaptersRead: nextRead,
    catalogueFloor,
    expandCatalogue: nextRead > total,
  };
}
