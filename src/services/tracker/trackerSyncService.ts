import { fetchAniListMangaProgress } from "@/services/tracker/anilistApi";
import { fetchMalMangaProgress } from "@/services/tracker/malApi";
import {
  markAllVolumesRead,
  setChapterProgress,
  setVolumeRead,
} from "@/services/readingProgressService";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";
import { ensureWorkChapterTotalsAtLeast } from "@/services/workService";
import { CHAPTER_SERIES_VOLUME_LABEL } from "@/utils/chapterSeries";
import { resolveWorkTrackingProfile } from "@/utils/workTracking";
import type { Work } from "@/types/database";
import type { TrackerProvider, TrackerSyncResult } from "@/types/tracker";

/**
 * @description Importe la progression tracker d'une œuvre pour le compte connecté.
 * Relève le catalogue local si l'API renvoie plus de chapitres que le total connu.
 */
export async function syncWorkFromTracker(
  work: Work,
  provider: TrackerProvider,
): Promise<TrackerSyncResult> {
  const mediaId = provider === "mal" ? work.mal_id : work.anilist_id;

  if (mediaId == null) {
    return {
      provider,
      workId: work.id,
      workTitle: work.title,
      chaptersApplied: null,
      volumesApplied: null,
      skippedReason: `Aucun ${provider === "mal" ? "MAL ID" : "AniList ID"} renseigné.`,
    };
  }

  const token = await fetchTrackerAccessToken(provider);
  if (!token) {
    return {
      provider,
      workId: work.id,
      workTitle: work.title,
      chaptersApplied: null,
      volumesApplied: null,
      skippedReason: `${provider === "mal" ? "MyAnimeList" : "AniList"} non connecté.`,
    };
  }

  const remote =
    provider === "mal"
      ? await fetchMalMangaProgress(token, mediaId)
      : await fetchAniListMangaProgress(token, mediaId);

  if (!remote) {
    return {
      provider,
      workId: work.id,
      workTitle: work.title,
      chaptersApplied: null,
      volumesApplied: null,
      skippedReason: "Entrée absente de la liste tracker.",
    };
  }

  const profile = resolveWorkTrackingProfile(work);
  let chaptersApplied: number | null = null;
  let volumesApplied: number | null = null;
  let chapterVfTotal: number | null = null;

  if (
    profile.hasChapterTracking &&
    remote.chaptersRead != null &&
    remote.chaptersRead >= 0
  ) {
    // Relève d'abord le catalogue local si l'API est en avance (ex. 122 > 106)
    const totals = await ensureWorkChapterTotalsAtLeast(
      work.id,
      remote.chaptersRead,
    );
    const saved = await setChapterProgress(
      work.id,
      remote.chaptersRead,
      totals.chapterVfCount,
    );
    chaptersApplied = saved.chaptersRead;
    chapterVfTotal = saved.chapterVfTotal;
  }

  if (
    profile.hasVolumeTracking &&
    remote.volumesRead != null &&
    remote.volumesRead > 0
  ) {
    volumesApplied = await applyVolumeReadCount(work.id, remote.volumesRead);
  }

  return {
    provider,
    workId: work.id,
    workTitle: work.title,
    chaptersApplied,
    volumesApplied,
    chapterVfTotal,
  };
}

/**
 * @description Synchronise toutes les œuvres ayant un ID tracker pour un provider.
 */
export async function syncAllWorksFromTracker(
  provider: TrackerProvider,
): Promise<TrackerSyncResult[]> {
  const supabase = getSupabaseClient();
  const column = provider === "mal" ? "mal_id" : "anilist_id";
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .not(column, "is", null)
    .order("title");

  if (error) {
    throw new Error(`Impossible de charger les œuvres : ${error.message}`);
  }

  const results: TrackerSyncResult[] = [];
  for (const work of data ?? []) {
    results.push(await syncWorkFromTracker(work as Work, provider));
  }
  return results;
}

/**
 * @description Marque les N premiers tomes du catalogue comme lus (ordre catalogue).
 * Catalogue complet : tous les tomes physiques, sans filtre possession.
 */
async function applyVolumeReadCount(
  workId: string,
  volumesRead: number,
): Promise<number> {
  const supabase = getSupabaseClient();
  const { data: volumeRows, error } = await supabase
    .from("volumes")
    .select("id, volume_number, volume_label")
    .eq("work_id", workId)
    .order("volume_number", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Impossible de charger les tomes : ${error.message}`);
  }

  const physical = (volumeRows ?? []).filter(
    (row) =>
      !(
        row.volume_number == null &&
        row.volume_label === CHAPTER_SERIES_VOLUME_LABEL
      ),
  );

  if (physical.length === 0) {
    return 0;
  }

  const target = Math.min(volumesRead, physical.length);
  const toMark = physical.slice(0, target).map((row) => row.id);
  const toClear = physical.slice(target).map((row) => row.id);

  if (toMark.length > 0) {
    await markAllVolumesRead(toMark);
  }
  for (const volumeId of toClear) {
    await setVolumeRead(volumeId, false);
  }

  return toMark.length;
}
