import {
  resolveAniListIdFromMal,
  resolveMalIdFromAniList,
} from "@/services/tracker/anilistApi";

export interface TrackerIdsPair {
  malId: number | null;
  anilistId: number | null;
}

/**
 * @description Complète l'ID tracker manquant via l'API AniList (query publique).
 * Priorise surtout AniList → MAL. N'écrase jamais un ID déjà renseigné.
 * @param ids - Paire actuelle (formulaire).
 * @returns Paire éventuellement enrichie.
 */
export async function fillMissingTrackerIds(
  ids: TrackerIdsPair,
): Promise<TrackerIdsPair> {
  let { malId, anilistId } = ids;

  if (anilistId != null && malId == null) {
    try {
      const resolved = await resolveMalIdFromAniList(anilistId);
      if (resolved != null) {
        malId = resolved;
      }
    } catch (error) {
      console.warn("Résolution MAL depuis AniList impossible :", error);
    }
  }

  if (malId != null && anilistId == null) {
    try {
      const resolved = await resolveAniListIdFromMal(malId);
      if (resolved != null) {
        anilistId = resolved;
      }
    } catch (error) {
      console.warn("Résolution AniList depuis MAL impossible :", error);
    }
  }

  return { malId, anilistId };
}
