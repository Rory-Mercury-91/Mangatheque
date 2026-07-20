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
 * @description Applique l'écart minimum lu / catalogue pour une série chapitrée en cours.
 * @param chaptersRead - Chapitres lus.
 * @param chaptersTotal - Total catalogue VF.
 */
export function applyOngoingChapterReadingGap(
  chaptersRead: number,
  chaptersTotal: number,
): { chaptersRead: number; chaptersTotal: number } {
  const total = Math.max(0, Math.floor(chaptersTotal));
  const read = Math.max(0, Math.floor(chaptersRead));

  if (total <= 0) {
    return { chaptersRead: read, chaptersTotal: total };
  }

  if (read >= total) {
    return { chaptersRead: total - 1, chaptersTotal: total };
  }

  return { chaptersRead: read, chaptersTotal: total };
}

/**
 * @description Calcule la progression après un +1, avec écart forcé si besoin.
 * @param chaptersRead - Chapitres lus actuels.
 * @param chaptersTotal - Total catalogue actuel.
 * @param keepGap - Conserver 1 d'écart (série En cours).
 */
export function nextChapterProgressAfterIncrement(
  chaptersRead: number,
  chaptersTotal: number,
  keepGap: boolean,
): { chaptersRead: number; catalogueFloor: number; expandCatalogue: boolean } {
  const base = keepGap
    ? applyOngoingChapterReadingGap(chaptersRead, chaptersTotal)
    : {
        chaptersRead: Math.max(0, Math.floor(chaptersRead)),
        chaptersTotal: Math.max(0, Math.floor(chaptersTotal)),
      };

  const nextRead = base.chaptersRead + 1;

  if (keepGap) {
    return {
      chaptersRead: nextRead,
      catalogueFloor: Math.max(base.chaptersTotal, nextRead + 1),
      expandCatalogue: true,
    };
  }

  return {
    chaptersRead: nextRead,
    catalogueFloor: Math.max(base.chaptersTotal, nextRead),
    expandCatalogue: nextRead > base.chaptersTotal,
  };
}
