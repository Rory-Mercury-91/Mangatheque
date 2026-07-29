import { getSupabaseClient } from "@/lib/supabaseClient";
import { searchJikanMangaByTitle } from "@/services/jikan/jikanMangaApi";
import {
  attachWorkMihonSource,
  fetchWorkMihonSources,
} from "@/services/mihon/workMihonSourceService";
import { patchWorkTrackerIds } from "@/services/mihon/mihonTrackerResolveService";
import { fillMissingTrackerIds } from "@/services/tracker/trackerIdResolveService";
import { deleteWork, fetchLocalWorkMalIdMap } from "@/services/workService";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import { yieldToMain } from "@/utils/scheduleIdleTask";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";

/** Pause entre recherches Jikan. */
const JIKAN_SEARCH_THROTTLE_MS = 500;

export interface PendingTitleResolveProgress {
  total: number;
  current: number;
  linked: number;
  ambiguous: number;
  unchanged: number;
  merged: number;
  errors: number;
  item: string;
}

export interface PendingTitleResolveResult {
  total: number;
  linked: number;
  ambiguous: number;
  unchanged: number;
  merged: number;
  errors: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * @description Fusionne les sources Mihon de `fromWorkId` vers `intoWorkId` puis supprime le doublon.
 */
async function mergePendingDuplicateWorks(
  intoWorkId: string,
  fromWorkId: string,
): Promise<void> {
  if (intoWorkId === fromWorkId) return;
  const sources = await fetchWorkMihonSources(fromWorkId);
  for (const source of sources) {
    await attachWorkMihonSource(intoWorkId, {
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      catalogUrl: source.catalogUrl,
    });
  }
  await deleteWork(
    fromWorkId,
    "Fusion automatique sas Mihon (même MAL après résolution titre)",
  );
}

/**
 * @description Phase 2 : recherche MAL via Jikan pour les pending sans tracker.
 * Auto-lie uniquement si le titre normalisé correspond exactement à un résultat.
 * Les cas ambigus restent dans le sas pour confirmation manuelle.
 * Fusionne ensuite les doublons partageant le même MAL.
 */
export async function resolvePendingMihonTitlesViaJikan(
  onProgress?: (progress: PendingTitleResolveProgress) => void,
): Promise<PendingTitleResolveResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("works")
    .select("id, title, mal_id, anilist_id")
    .eq("enrichment_status", "pending_mihon")
    .order("title");

  if (error) {
    throw new Error(
      `Impossible de lister le sas Mihon : ${error.message}`,
    );
  }

  const rows = (data ?? []).filter(
    (row) => row.mal_id == null && row.anilist_id == null,
  );

  const result: PendingTitleResolveResult = {
    total: rows.length,
    linked: 0,
    ambiguous: 0,
    unchanged: 0,
    merged: 0,
    errors: 0,
  };

  const malMap = await fetchLocalWorkMalIdMap();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const title = String(row.title ?? "Sans titre");
    const workId = String(row.id);
    onProgress?.({
      total: rows.length,
      current: index + 1,
      linked: result.linked,
      ambiguous: result.ambiguous,
      unchanged: result.unchanged,
      merged: result.merged,
      errors: result.errors,
      item: title,
    });
    await yieldToMain();

    try {
      const hits = await searchJikanMangaByTitle(title);
      const needle = normalizeTitleForComparison(title);
      const exactHits = hits.filter(
        (hit) => normalizeTitleForComparison(hit.title) === needle,
      );

      if (exactHits.length === 0) {
        result.unchanged += 1;
      } else if (exactHits.length > 1) {
        result.ambiguous += 1;
      } else {
        const hit = exactHits[0]!;
        const filled = await fillMissingTrackerIds({
          malId: hit.malId,
          anilistId: null,
        });

        const existingWorkId = malMap.get(filled.malId ?? hit.malId);
        if (existingWorkId && existingWorkId !== workId) {
          await mergePendingDuplicateWorks(existingWorkId, workId);
          result.merged += 1;
          result.linked += 1;
        } else {
          await patchWorkTrackerIds(workId, filled);
          if (filled.malId != null) {
            malMap.set(filled.malId, workId);
          }
          result.linked += 1;
        }
      }
    } catch (err) {
      console.warn(
        `Résolution titre impossible pour « ${title} » :`,
        err instanceof Error ? err.message : err,
      );
      result.errors += 1;
    }

    await wait(JIKAN_SEARCH_THROTTLE_MS);
  }

  onProgress?.({
    total: rows.length,
    current: rows.length,
    linked: result.linked,
    ambiguous: result.ambiguous,
    unchanged: result.unchanged,
    merged: result.merged,
    errors: result.errors,
    item: "Terminé",
  });

  requestSupabaseDataReload();
  return result;
}
