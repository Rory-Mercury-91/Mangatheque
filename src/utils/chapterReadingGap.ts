import type { WorkReadingStatus } from "@/types/database";

/**
 * @description Indique si le suivi chapitres doit garder 1 d'écart (série encore publiée).
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
 * Série En cours : si on atteint le catalogue, on relève le total (+1 d'écart).
 * @param chaptersRead - Chapitres lus actuels.
 * @param chaptersTotal - Total catalogue actuel.
 * @param keepGap - Conserver 1 d'écart après extension (série En cours).
 */
export function nextChapterProgressAfterIncrement(
  chaptersRead: number,
  chaptersTotal: number,
  keepGap: boolean,
): { chaptersRead: number; catalogueFloor: number; expandCatalogue: boolean } {
  const read = Math.max(0, Math.floor(chaptersRead));
  const total = Math.max(0, Math.floor(chaptersTotal));
  const nextRead = read + 1;

  if (keepGap) {
    const catalogueFloor = Math.max(total, nextRead + 1);
    return {
      chaptersRead: nextRead,
      catalogueFloor,
      expandCatalogue: catalogueFloor > total,
    };
  }

  return {
    chaptersRead: nextRead,
    catalogueFloor: Math.max(total, nextRead),
    expandCatalogue: nextRead > total,
  };
}
