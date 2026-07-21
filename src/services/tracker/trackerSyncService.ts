import { fetchAniListMangaProgress } from "@/services/tracker/anilistApi";
import { fetchMalMangaProgress } from "@/services/tracker/malApi";
import {
  fetchChapterProgress,
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
import type {
  TrackerProvider,
  TrackerRemoteProgress,
  TrackerSyncResult,
} from "@/types/tracker";

/**
 * @description Importe la progression tracker d'une œuvre pour le compte connecté.
 * Ne baisse jamais la progression locale : applique max(local, remote).
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
      remoteChapters: null,
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
      remoteChapters: null,
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
      remoteChapters: null,
      skippedReason: "Entrée absente de la liste tracker.",
    };
  }

  return applyRemoteProgressToWork(work, provider, remote);
}

/**
 * @description Applique une progression distante (déjà fetch) sans baisser le local.
 */
async function applyRemoteProgressToWork(
  work: Work,
  provider: TrackerProvider,
  remote: TrackerRemoteProgress,
): Promise<TrackerSyncResult> {
  const profile = resolveWorkTrackingProfile(work);
  let chaptersApplied: number | null = null;
  let volumesApplied: number | null = null;
  let chapterVfTotal: number | null = null;

  if (
    profile.hasChapterTracking &&
    remote.chaptersRead != null &&
    remote.chaptersRead >= 0
  ) {
    const localChapters = await fetchChapterProgress(work.id);
    const targetChapters = Math.max(localChapters, remote.chaptersRead);

    const totals = await ensureWorkChapterTotalsAtLeast(
      work.id,
      Math.max(targetChapters, profile.chapterVfCount ?? 0),
    );
    const saved = await setChapterProgress(
      work.id,
      targetChapters,
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
    volumesApplied = await applyVolumeReadCount(work.id, remote.volumesRead, {
      onlyIncrease: true,
    });
  }

  return {
    provider,
    workId: work.id,
    workTitle: work.title,
    chaptersApplied,
    volumesApplied,
    chapterVfTotal,
    remoteChapters: remote.chaptersRead,
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
 * @description Sync fusionnée MAL + AniList : pour chaque œuvre, prend le max des progressions.
 * Évite qu'un MAL à 106 écrase un AniList à 122.
 */
export async function syncAllWorksFromAllLinkedTrackers(): Promise<
  TrackerSyncResult[]
> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .or("mal_id.not.is.null,anilist_id.not.is.null")
    .order("title");

  if (error) {
    throw new Error(`Impossible de charger les œuvres : ${error.message}`);
  }

  const malToken = await fetchTrackerAccessToken("mal");
  const anilistToken = await fetchTrackerAccessToken("anilist");

  if (!malToken && !anilistToken) {
    return [];
  }

  const results: TrackerSyncResult[] = [];

  for (const raw of data ?? []) {
    const work = raw as Work;
    const remotes: TrackerRemoteProgress[] = [];

    if (malToken && work.mal_id != null) {
      try {
        const remote = await fetchMalMangaProgress(malToken, work.mal_id);
        if (remote) {
          remotes.push(remote);
        }
      } catch (err) {
        console.warn(`Sync MAL « ${work.title} » :`, err);
      }
    }

    if (anilistToken && work.anilist_id != null) {
      try {
        const remote = await fetchAniListMangaProgress(
          anilistToken,
          work.anilist_id,
        );
        if (remote) {
          remotes.push(remote);
        }
      } catch (err) {
        console.warn(`Sync AniList « ${work.title} » :`, err);
      }
    }

    if (remotes.length === 0) {
      continue;
    }

    const merged: TrackerRemoteProgress = {
      provider: remotes.some((r) => r.provider === "anilist")
        ? "anilist"
        : "mal",
      mediaId: remotes[0]!.mediaId,
      chaptersRead: maxNullable(remotes.map((r) => r.chaptersRead)),
      volumesRead: maxNullable(remotes.map((r) => r.volumesRead)),
      status: remotes.find((r) => r.status)?.status ?? null,
    };

    results.push(await applyRemoteProgressToWork(work, merged.provider, merged));
  }

  return results;
}

/**
 * @description Max de nombres nullable.
 */
function maxNullable(values: Array<number | null | undefined>): number | null {
  let max: number | null = null;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) {
      continue;
    }
    max = max == null ? value : Math.max(max, value);
  }
  return max;
}

/**
 * @description Marque les N premiers tomes du catalogue comme lus (ordre catalogue).
 * @param onlyIncrease - Si true, ne retire jamais des tomes déjà lus au-delà de N.
 */
async function applyVolumeReadCount(
  workId: string,
  volumesRead: number,
  options?: { onlyIncrease?: boolean },
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

  if (toMark.length > 0) {
    await markAllVolumesRead(toMark);
  }

  if (!options?.onlyIncrease) {
    const toClear = physical.slice(target).map((row) => row.id);
    for (const volumeId of toClear) {
      await setVolumeRead(volumeId, false);
    }
  }

  return toMark.length;
}
