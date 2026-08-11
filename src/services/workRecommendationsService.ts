import { fetchJikanMangaRecommendations } from "@/services/jikan/jikanMangaApi";
import {
  fetchAniListMangaRecommendations,
  resolveAniListIdFromMal,
} from "@/services/tracker/anilistApi";

export type WorkRecommendationSource = "mal" | "anilist";

/** Recommandation manga normalisée pour la fiche détail. */
export interface WorkRecommendation {
  title: string;
  image: string | null;
  malId: number | null;
  anilistId: number | null;
  votes: number;
  source: WorkRecommendationSource;
}

/**
 * @description Charge les recommandations manga : MAL en priorité, AniList en secours.
 * @param malId - Identifiant MyAnimeList (optionnel).
 * @param anilistId - Identifiant AniList (optionnel).
 */
export async function fetchWorkRecommendations(params: {
  malId: number | null;
  anilistId: number | null;
}): Promise<WorkRecommendation[]> {
  const { malId, anilistId } = params;

  if (malId != null) {
    try {
      const malRecs = await fetchJikanMangaRecommendations(malId);
      if (malRecs.length > 0) {
        return malRecs.map((rec) => ({
          title: rec.title,
          image: rec.image,
          malId: rec.malId,
          anilistId: null,
          votes: rec.votes,
          source: "mal" as const,
        }));
      }
    } catch (err) {
      console.error("[reco] Jikan manga :", err);
    }
  }

  let resolvedAniListId = anilistId;
  if (resolvedAniListId == null && malId != null) {
    try {
      resolvedAniListId = await resolveAniListIdFromMal(malId);
    } catch (err) {
      console.error("[reco] Résolution AniList depuis MAL :", err);
    }
  }

  if (resolvedAniListId == null) {
    return [];
  }

  try {
    const aniRecs = await fetchAniListMangaRecommendations(resolvedAniListId);
    return aniRecs.map((rec) => ({
      title: rec.title,
      image: rec.image,
      malId: rec.malId,
      anilistId: rec.anilistId,
      votes: rec.rating,
      source: "anilist" as const,
    }));
  } catch (err) {
    console.error("[reco] AniList manga :", err);
    return [];
  }
}
