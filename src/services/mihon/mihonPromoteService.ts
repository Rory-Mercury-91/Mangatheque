import { getSupabaseClient } from "@/lib/supabaseClient";
import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import {
  fetchJikanMangaMinimal,
  type JikanMangaMinimal,
} from "@/services/jikan/jikanMangaApi";
import { fillMissingTrackerIds } from "@/services/tracker/trackerIdResolveService";
import { persistCoverImageUrl } from "@/utils/coverUrl";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";

export interface PromotePendingMihonResult {
  workId: string;
  title: string;
  enrichedFromJikan: boolean;
}

/**
 * @description Enrichit une fiche pending via Jikan (si MAL connu) puis la sort du sas.
 * Utile quand la série n'existe pas sur Nautiljon.
 * @param workId - Fiche pending_mihon.
 */
export async function promotePendingMihonToLibrary(
  workId: string,
): Promise<PromotePendingMihonResult> {
  const supabase = getSupabaseClient();
  const { data: work, error } = await supabase
    .from("works")
    .select("*")
    .eq("id", workId)
    .single();

  if (error || !work) {
    throw new Error(`Fiche introuvable : ${error?.message ?? workId}`);
  }

  if (work.enrichment_status !== "pending_mihon") {
    throw new Error("Cette fiche n'est pas dans le sas Mihon.");
  }

  let enrichedFromJikan = false;
  let malId = work.mal_id != null ? Number(work.mal_id) : null;
  let anilistId = work.anilist_id != null ? Number(work.anilist_id) : null;

  const filled = await fillMissingTrackerIds({ malId, anilistId });
  malId = filled.malId;
  anilistId = filled.anilistId;

  let jikan: JikanMangaMinimal | null = null;
  if (malId != null) {
    try {
      jikan = await fetchJikanMangaMinimal(malId);
    } catch (err) {
      console.warn(
        `Jikan indisponible pour promotion MAL ${malId} :`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const patch: Record<string, unknown> = {
    mal_id: malId,
    anilist_id: anilistId,
    enrichment_status: null,
    // Date d'ajout = entrée en bibliothèque (pas le passage dans le sas).
    created_at: new Date().toISOString(),
  };

  if (jikan) {
    enrichedFromJikan = true;
    if (!String(work.synopsis ?? "").trim() && jikan.synopsis) {
      patch.synopsis = jikan.synopsis;
    }
    if (!String(work.cover_url ?? "").trim() && jikan.coverUrl) {
      patch.cover_url = persistCoverImageUrl(jikan.coverUrl);
    }
    if (
      (!Array.isArray(work.genres) || work.genres.length === 0) &&
      jikan.genres.length > 0
    ) {
      patch.genres = jikan.genres;
    }
    if (!String(work.demographic_type ?? "").trim() && jikan.demographicType) {
      patch.demographic_type = jikan.demographicType;
    }
    if (work.volumes_vf_count == null && jikan.volumes != null) {
      patch.volumes_vf_count = jikan.volumes;
    }
    if (work.chapters_vf_count == null && jikan.chapters != null) {
      patch.chapters_vf_count = jikan.chapters;
      patch.has_chapter_tracking = true;
    }
    if (jikan.statusLabel) {
      patch.reading_status = normalizeWorkReadingStatus(
        jikan.statusLabel.toLowerCase().includes("finish")
          ? "completed"
          : "ongoing",
      );
    }
  }

  const { error: updateError } = await supabase
    .from("works")
    .update(patch)
    .eq("id", workId);

  if (updateError) {
    throw new Error(
      `Impossible de promouvoir la fiche : ${updateError.message}`,
    );
  }

  requestSupabaseDataReload();

  return {
    workId,
    title: String(work.title ?? "Sans titre"),
    enrichedFromJikan,
  };
}
