import { getSupabaseClient } from "@/lib/supabaseClient";
import { fillMissingTrackerIds } from "@/services/tracker/trackerIdResolveService";
import { yieldToMain } from "@/utils/scheduleIdleTask";

/** Pause entre résolutions AniList (rate-limit API publique). */
const ANILIST_RESOLVE_THROTTLE_MS = 350;

export interface PendingTrackerResolveProgress {
  total: number;
  current: number;
  resolved: number;
  unchanged: number;
  errors: number;
  item: string;
}

export interface PendingTrackerResolveResult {
  total: number;
  resolved: number;
  unchanged: number;
  errors: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * @description Met à jour uniquement les IDs trackers d'une œuvre.
 */
export async function patchWorkTrackerIds(
  workId: string,
  ids: { malId: number | null; anilistId: number | null },
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("works")
    .update({
      mal_id: ids.malId,
      anilist_id: ids.anilistId,
    })
    .eq("id", workId);

  if (error) {
    throw new Error(
      `Impossible de mettre à jour les IDs trackers : ${error.message}`,
    );
  }
}

/**
 * @description Résout les IDs MAL ↔ AniList manquants pour les fiches pending_mihon.
 */
export async function resolvePendingMihonTrackerIds(
  onProgress?: (progress: PendingTrackerResolveProgress) => void,
): Promise<PendingTrackerResolveResult> {
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
    (row) =>
      (row.mal_id != null && row.anilist_id == null) ||
      (row.anilist_id != null && row.mal_id == null),
  );

  const result: PendingTrackerResolveResult = {
    total: rows.length,
    resolved: 0,
    unchanged: 0,
    errors: 0,
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const title = String(row.title ?? "Sans titre");
    onProgress?.({
      total: rows.length,
      current: index + 1,
      resolved: result.resolved,
      unchanged: result.unchanged,
      errors: result.errors,
      item: title,
    });
    await yieldToMain();

    try {
      const beforeMal = row.mal_id != null ? Number(row.mal_id) : null;
      const beforeAni =
        row.anilist_id != null ? Number(row.anilist_id) : null;
      const filled = await fillMissingTrackerIds({
        malId: beforeMal,
        anilistId: beforeAni,
      });

      if (filled.malId === beforeMal && filled.anilistId === beforeAni) {
        result.unchanged += 1;
      } else {
        await patchWorkTrackerIds(String(row.id), filled);
        result.resolved += 1;
      }
    } catch (err) {
      console.warn(
        `Résolution trackers impossible pour « ${title} » :`,
        err instanceof Error ? err.message : err,
      );
      result.errors += 1;
    }

    await wait(ANILIST_RESOLVE_THROTTLE_MS);
  }

  onProgress?.({
    total: rows.length,
    current: rows.length,
    resolved: result.resolved,
    unchanged: result.unchanged,
    errors: result.errors,
    item: "Terminé",
  });

  return result;
}
