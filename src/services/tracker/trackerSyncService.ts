import {
  fetchAniListMangaProgress,
  pushAniListMangaProgress,
} from "@/services/tracker/anilistApi";
import {
  fetchMalMangaProgress,
  pushMalMangaProgress,
} from "@/services/tracker/malApi";
import {
  fetchChapterProgressDetail,
  fetchReadVolumeIdsForWork,
  markAllVolumesRead,
  setChapterProgress,
  setVolumeRead,
} from "@/services/readingProgressService";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
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

type ProgressSource = {
  label: "local" | TrackerProvider;
  chaptersRead: number | null;
  volumesRead: number | null;
  status: string | null;
  updatedAtMs: number | null;
};

/**
 * @description Synchronise une œuvre avec un tracker (pull + push bidirectionnel).
 * Départage MAL / AniList / local par horodatage (dernière MAJ gagne), puis aligne les autres.
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

  return syncWorkBidirectional(work, provider);
}

/**
 * @description Applique une progression cible sur l'app.
 * @param forceExact - Si true, peut baisser le local (dernière MAJ gagne).
 */
async function applyRemoteProgressToWork(
  work: Work,
  provider: TrackerProvider,
  remote: TrackerRemoteProgress,
  options?: { forceExact?: boolean },
): Promise<TrackerSyncResult> {
  const forceExact = options?.forceExact === true;
  const profile = resolveWorkTrackingProfile(work);
  let chaptersApplied: number | null = null;
  let volumesApplied: number | null = null;
  let chapterVfTotal: number | null = null;

  if (
    profile.hasChapterTracking &&
    remote.chaptersRead != null &&
    remote.chaptersRead >= 0
  ) {
    const localDetail = await fetchChapterProgressDetail(work.id);
    const targetChapters = forceExact
      ? remote.chaptersRead
      : Math.max(localDetail.chaptersRead, remote.chaptersRead);

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
    remote.volumesRead >= 0
  ) {
    volumesApplied = await applyVolumeReadCount(work.id, remote.volumesRead, {
      onlyIncrease: !forceExact,
    });
  }

  requestSupabaseDataReload();

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
 * @description Sync bidirectionnelle : dernière source modifiée gagne, puis push d'alignement.
 */
async function syncWorkBidirectional(
  work: Work,
  preferredProvider: TrackerProvider,
): Promise<TrackerSyncResult> {
  const malToken =
    work.mal_id != null ? await fetchTrackerAccessToken("mal") : null;
  const anilistToken =
    work.anilist_id != null
      ? await fetchTrackerAccessToken("anilist")
      : null;

  if (!malToken && !anilistToken) {
    return {
      provider: preferredProvider,
      workId: work.id,
      workTitle: work.title,
      chaptersApplied: null,
      volumesApplied: null,
      remoteChapters: null,
      skippedReason: "Aucun tracker connecté pour cette série.",
    };
  }

  const remotes: TrackerRemoteProgress[] = [];
  /** Providers dont l'API a répondu (même si absents de la liste perso). */
  const readableProviders = new Set<TrackerProvider>();
  /** Providers réellement présents sur la liste perso (progression connue). */
  const onListProviders = new Set<TrackerProvider>();

  if (malToken && work.mal_id != null) {
    try {
      const remote = await fetchMalMangaProgress(malToken, work.mal_id);
      readableProviders.add("mal");
      if (remote) {
        onListProviders.add("mal");
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
      readableProviders.add("anilist");
      if (remote) {
        onListProviders.add("anilist");
        remotes.push(remote);
      }
    } catch (err) {
      console.warn(`Sync AniList « ${work.title} » :`, err);
    }
  }

  const profile = resolveWorkTrackingProfile(work);
  const localChapterDetail = profile.hasChapterTracking
    ? await fetchChapterProgressDetail(work.id)
    : { chaptersRead: 0, updatedAtMs: null };
  const localVolumeMeta = profile.hasVolumeTracking
    ? await fetchLocalPhysicalVolumeReadMeta(work.id)
    : { count: 0, updatedAtMs: null };

  const sources: ProgressSource[] = [
    {
      label: "local",
      chaptersRead: profile.hasChapterTracking
        ? localChapterDetail.chaptersRead
        : null,
      volumesRead: profile.hasVolumeTracking ? localVolumeMeta.count : null,
      status: null,
      updatedAtMs: maxNullableTimestamp([
        localChapterDetail.updatedAtMs,
        localVolumeMeta.updatedAtMs,
      ]),
    },
    ...remotes.map((remote) => ({
      label: remote.provider as ProgressSource["label"],
      chaptersRead: remote.chaptersRead,
      volumesRead: remote.volumesRead,
      status: remote.status,
      updatedAtMs: remote.updatedAtMs,
    })),
  ];

  const winner = pickLatestProgressSource(sources);
  if (!winner) {
    return {
      provider: preferredProvider,
      workId: work.id,
      workTitle: work.title,
      chaptersApplied: null,
      volumesApplied: null,
      remoteChapters: null,
      skippedReason: "Aucune progression distante ni locale à synchroniser.",
    };
  }

  const targetChapters = winner.chaptersRead;
  const targetVolumes = winner.volumesRead;

  const merged: TrackerRemoteProgress = {
    provider: preferredProvider,
    mediaId:
      preferredProvider === "mal"
        ? (work.mal_id ?? remotes[0]?.mediaId ?? 0)
        : (work.anilist_id ?? remotes[0]?.mediaId ?? 0),
    chaptersRead: targetChapters,
    volumesRead: targetVolumes,
    status: winner.status,
    updatedAtMs: winner.updatedAtMs,
  };

  const applied = await applyRemoteProgressToWork(
    work,
    preferredProvider,
    merged,
    { forceExact: true },
  );

  const pushResult = await pushProgressToLaggingTrackers({
    work,
    malToken,
    anilistToken,
    remotes,
    readableProviders,
    onListProviders,
    targetChapters,
    targetVolumes,
  });

  return {
    ...applied,
    pushedProviders: pushResult.pushed,
    pushErrors: pushResult.errors.length > 0 ? pushResult.errors : undefined,
  };
}

/**
 * @description Pousse la progression cible vers chaque tracker à aligner.
 */
async function pushProgressToLaggingTrackers(params: {
  work: Work;
  malToken: string | null;
  anilistToken: string | null;
  remotes: TrackerRemoteProgress[];
  readableProviders: Set<TrackerProvider>;
  onListProviders: Set<TrackerProvider>;
  targetChapters: number | null;
  targetVolumes: number | null;
}): Promise<{ pushed: TrackerProvider[]; errors: string[] }> {
  const {
    work,
    malToken,
    anilistToken,
    remotes,
    readableProviders,
    onListProviders,
    targetChapters,
    targetVolumes,
  } = params;
  const pushed: TrackerProvider[] = [];
  const errors: string[] = [];

  const malRemote = remotes.find((r) => r.provider === "mal");
  if (malToken && work.mal_id != null && readableProviders.has("mal")) {
    const needsPush = trackerNeedsPush(
      malRemote,
      onListProviders.has("mal"),
      targetChapters,
      targetVolumes,
    );
    if (needsPush) {
      try {
        const createEntry = !onListProviders.has("mal");
        await pushMalMangaProgress(malToken, work.mal_id, {
          chaptersRead: targetChapters,
          volumesRead: targetVolumes,
          status: createEntry ? "reading" : null,
        });
        pushed.push("mal");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Push MAL impossible.";
        console.warn(`Push MAL « ${work.title} » :`, err);
        errors.push(`MAL : ${message}`);
      }
    }
  }

  // AniList : tentative de push dès qu'on a token + ID (création si absente).
  if (anilistToken && work.anilist_id != null) {
    const onList = onListProviders.has("anilist");
    const anilistRemote = remotes.find((r) => r.provider === "anilist");
    const needsPush = trackerNeedsPush(
      anilistRemote,
      onList,
      targetChapters,
      targetVolumes,
    );
    if (needsPush) {
      try {
        await pushAniListMangaProgress(anilistToken, work.anilist_id, {
          chaptersRead: targetChapters,
          volumesRead: targetVolumes,
          // Status obligatoire pour créer l'entrée
          status: onList ? null : "CURRENT",
        });
        pushed.push("anilist");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Push AniList impossible.";
        console.warn(`Push AniList « ${work.title} » :`, err);
        errors.push(`AniList : ${message}`);
      }
    }
  }

  return { pushed, errors };
}

/**
 * @description True si le tracker doit être aligné sur la cible.
 */
function trackerNeedsPush(
  remote: TrackerRemoteProgress | undefined,
  onList: boolean,
  targetChapters: number | null,
  targetVolumes: number | null,
): boolean {
  if (targetChapters == null && targetVolumes == null) {
    return false;
  }
  // Absente de la liste perso : créer l'entrée si progression cible > 0
  if (!onList || !remote) {
    return (
      (targetChapters != null && targetChapters > 0) ||
      (targetVolumes != null && targetVolumes > 0)
    );
  }
  if (
    targetChapters != null &&
    targetChapters !== (remote.chaptersRead ?? 0)
  ) {
    return true;
  }
  if (
    targetVolumes != null &&
    targetVolumes !== (remote.volumesRead ?? 0)
  ) {
    return true;
  }
  return false;
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
 * @description Sync fusionnée MAL + AniList (dernière MAJ gagne) puis push d'alignement.
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
    const preferred: TrackerProvider =
      anilistToken && work.anilist_id != null ? "anilist" : "mal";
    try {
      results.push(await syncWorkBidirectional(work, preferred));
    } catch (err) {
      console.warn(`Sync bidirectionnelle « ${work.title} » :`, err);
    }
  }

  return results;
}

/**
 * @description Choisit la source la plus récente ; si aucun horodatage, repli sur le max.
 */
function pickLatestProgressSource(
  sources: ProgressSource[],
): ProgressSource | null {
  const usable = sources.filter(
    (source) => source.chaptersRead != null || source.volumesRead != null,
  );
  if (usable.length === 0) {
    return null;
  }

  const dated = usable.filter((source) => source.updatedAtMs != null);
  if (dated.length > 0) {
    return dated.reduce((best, current) =>
      (current.updatedAtMs ?? 0) >= (best.updatedAtMs ?? 0) ? current : best,
    );
  }

  // Aucun horodatage : ancien comportement max (sécurité)
  return {
    label: "local",
    chaptersRead: maxNullable(usable.map((s) => s.chaptersRead)),
    volumesRead: maxNullable(usable.map((s) => s.volumesRead)),
    status: usable.find((s) => s.status)?.status ?? null,
    updatedAtMs: null,
  };
}

/**
 * @description Max d'horodatages nullable.
 */
function maxNullableTimestamp(
  values: Array<number | null | undefined>,
): number | null {
  return maxNullable(values);
}

/**
 * @description Compte les tomes physiques lus + dernière date de lecture.
 */
async function fetchLocalPhysicalVolumeReadMeta(
  workId: string,
): Promise<{ count: number; updatedAtMs: number | null }> {
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
    return { count: 0, updatedAtMs: null };
  }

  const physicalIds = physical.map((row) => row.id);
  const readIds = await fetchReadVolumeIdsForWork(workId);
  const readPhysicalIds = physicalIds.filter((id) => readIds.has(id));
  if (readPhysicalIds.length === 0) {
    return { count: 0, updatedAtMs: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { count: readPhysicalIds.length, updatedAtMs: null };
  }

  const { data: readRows, error: readError } = await supabase
    .from("user_volume_reads")
    .select("read_at")
    .eq("user_id", user.id)
    .in("volume_id", readPhysicalIds);

  if (readError) {
    return { count: readPhysicalIds.length, updatedAtMs: null };
  }

  let updatedAtMs: number | null = null;
  for (const row of readRows ?? []) {
    if (!row.read_at) {
      continue;
    }
    const ms = Date.parse(row.read_at);
    if (!Number.isFinite(ms)) {
      continue;
    }
    updatedAtMs = updatedAtMs == null ? ms : Math.max(updatedAtMs, ms);
  }

  return { count: readPhysicalIds.length, updatedAtMs };
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
