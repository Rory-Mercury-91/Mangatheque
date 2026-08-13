import {
  fetchAniListMangaProgress,
  fetchAniListMangaProgressMap,
  pushAniListMangaProgress,
} from "@/services/tracker/anilistApi";
import {
  fetchMalMangaProgress,
  fetchMalMangaProgressMap,
  pushMalMangaProgress,
} from "@/services/tracker/malApi";
import {
  clearVolumeReads,
  fetchChapterProgressDetail,
  fetchReadVolumeIdsForWork,
  markAllVolumesRead,
  setChapterProgress,
} from "@/services/readingProgressService";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";
import { ensureWorkChapterTotalsAtLeast } from "@/services/workService";
import { CHAPTER_SERIES_VOLUME_LABEL } from "@/utils/chapterSeries";
import {
  areTrackerListStatusesEquivalent,
  isTrackerPlanToReadStatus,
  mapTrackerStatusForProvider,
  normalizeTrackerRemoteProgress,
} from "@/utils/trackerReadingStatus";
import { resolveWorkTrackingProfile } from "@/utils/workTracking";
import { yieldToMain } from "@/utils/scheduleIdleTask";
import type { Work } from "@/types/database";
import type {
  TrackerProvider,
  TrackerRemoteProgress,
  TrackerSyncProgressCallback,
  TrackerSyncResult,
} from "@/types/tracker";

/**
 * Cache de progressions distantes préchargées (listes perso bulk).
 * Évite le N+1 HTTP par œuvre lors des syncs batch.
 */
type RemoteProgressCache = {
  mal?: Map<number, TrackerRemoteProgress> | null;
  anilist?: Map<number, TrackerRemoteProgress> | null;
};

/**
 * @description Synchronise une œuvre avec les trackers liés.
 * Source de vérité = APIs (MAL / AniList) ; le local est écrasé si différent.
 * Un statut « à lire » (plan_to_read / PLANNING) est traité comme non lu.
 * Entre trackers, la dernière MAJ distante gagne, puis push d'alignement.
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

  return syncWorkFromRemotes(work, provider);
}

/**
 * @description Applique une progression API sur l'app (écrase le local si différent).
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
    const localDetail = await fetchChapterProgressDetail(work.id);
    const targetChapters = remote.chaptersRead;

    // Pas de réécriture locale si la progression chapitres est déjà alignée.
    if (localDetail.chaptersRead !== targetChapters) {
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
    } else {
      chaptersApplied = localDetail.chaptersRead;
      chapterVfTotal = profile.chapterVfCount ?? null;
    }
  }

  if (
    profile.hasVolumeTracking &&
    remote.volumesRead != null &&
    remote.volumesRead >= 0
  ) {
    volumesApplied = await applyVolumeReadCount(work.id, remote.volumesRead);
  }

  // Pas de reload ici : les syncs batch rechargent une seule fois en fin de boucle.

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
 * @description Sync lecture : APIs = vérité, local aligné, trackers retardataires poussés.
 * @param remotesCache - Progressions préchargées (sync batch) ; sinon fetch unitaire.
 */
async function syncWorkFromRemotes(
  work: Work,
  preferredProvider: TrackerProvider,
  remotesCache?: RemoteProgressCache,
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
      const remote = await resolveRemoteProgress(
        "mal",
        malToken,
        work.mal_id,
        remotesCache,
      );
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
      const remote = await resolveRemoteProgress(
        "anilist",
        anilistToken,
        work.anilist_id,
        remotesCache,
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

  // Source de vérité = APIs uniquement (pas de départage avec le local).
  // « À lire » (PLANNING / plan_to_read) = non lu, même si des compteurs reliquats restent.
  const winner = pickLatestRemoteProgress(
    remotes.map(normalizeTrackerRemoteProgress),
  );
  if (!winner) {
    return {
      provider: preferredProvider,
      workId: work.id,
      workTitle: work.title,
      chaptersApplied: null,
      volumesApplied: null,
      remoteChapters: null,
      skippedReason: "Aucune progression distante à synchroniser.",
    };
  }

  const targetChapters = winner.chaptersRead;
  const targetVolumes = winner.volumesRead;

  const applied = await applyRemoteProgressToWork(work, preferredProvider, {
    provider: preferredProvider,
    mediaId:
      preferredProvider === "mal"
        ? (work.mal_id ?? winner.mediaId)
        : (work.anilist_id ?? winner.mediaId),
    chaptersRead: targetChapters,
    volumesRead: targetVolumes,
    status: winner.status,
    updatedAtMs: winner.updatedAtMs,
  });

  const pushResult = await pushProgressToLaggingTrackers({
    work,
    malToken,
    anilistToken,
    remotes,
    readableProviders,
    onListProviders,
    targetChapters,
    targetVolumes,
    targetStatus: winner.status,
  });

  return {
    ...applied,
    pushedProviders: pushResult.pushed,
    pushErrors: pushResult.errors.length > 0 ? pushResult.errors : undefined,
  };
}

/**
 * @description Résout la progression distante via cache bulk ou fetch unitaire.
 */
async function resolveRemoteProgress(
  provider: TrackerProvider,
  token: string,
  mediaId: number,
  remotesCache?: RemoteProgressCache,
): Promise<TrackerRemoteProgress | null> {
  if (provider === "mal") {
    if (remotesCache && "mal" in remotesCache) {
      if (remotesCache.mal == null) {
        return null;
      }
      return remotesCache.mal.get(mediaId) ?? null;
    }
    return fetchMalMangaProgress(token, mediaId);
  }

  if (remotesCache && "anilist" in remotesCache) {
    if (remotesCache.anilist == null) {
      return null;
    }
    return remotesCache.anilist.get(mediaId) ?? null;
  }
  return fetchAniListMangaProgress(token, mediaId);
}

/**
 * @description Précharge les listes perso MAL / AniList (1 requête chacune).
 */
async function loadRemoteProgressCache(): Promise<RemoteProgressCache> {
  const cache: RemoteProgressCache = {};
  const malToken = await fetchTrackerAccessToken("mal");
  const anilistToken = await fetchTrackerAccessToken("anilist");

  if (malToken) {
    try {
      cache.mal = await fetchMalMangaProgressMap(malToken);
    } catch (err) {
      console.warn("Préchargement liste manga MAL impossible :", err);
      // Fallback : fetch unitaire par œuvre
    }
  }

  if (anilistToken) {
    try {
      cache.anilist = await fetchAniListMangaProgressMap(anilistToken);
    } catch (err) {
      console.warn("Préchargement liste manga AniList impossible :", err);
    }
  }

  return cache;
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
  targetStatus: string | null;
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
    targetStatus,
  } = params;
  const pushed: TrackerProvider[] = [];
  const errors: string[] = [];

  const malRemote = remotes.find((r) => r.provider === "mal");
  if (malToken && work.mal_id != null && readableProviders.has("mal")) {
    const onList = onListProviders.has("mal");
    const needsPush = trackerNeedsPush(
      malRemote,
      onList,
      targetChapters,
      targetVolumes,
      targetStatus,
    );
    if (needsPush) {
      try {
        await pushMalMangaProgress(malToken, work.mal_id, {
          chaptersRead: targetChapters,
          volumesRead: targetVolumes,
          status: resolvePushStatus("mal", onList, targetStatus),
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
      targetStatus,
    );
    if (needsPush) {
      try {
        await pushAniListMangaProgress(anilistToken, work.anilist_id, {
          chaptersRead: targetChapters,
          volumesRead: targetVolumes,
          status: resolvePushStatus("anilist", onList, targetStatus),
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
 * @description Statut à envoyer au tracker : cible mappée, ou CURRENT/reading à la création.
 */
function resolvePushStatus(
  provider: TrackerProvider,
  onList: boolean,
  targetStatus: string | null,
): string | null {
  const mapped = mapTrackerStatusForProvider(targetStatus, provider);
  if (mapped) {
    return mapped;
  }
  if (!onList) {
    return provider === "mal" ? "reading" : "CURRENT";
  }
  return null;
}

/**
 * @description True si le tracker doit être aligné sur la cible (progression et/ou statut).
 */
function trackerNeedsPush(
  remote: TrackerRemoteProgress | undefined,
  onList: boolean,
  targetChapters: number | null,
  targetVolumes: number | null,
  targetStatus: string | null,
): boolean {
  if (targetChapters == null && targetVolumes == null && !targetStatus) {
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
  if (
    targetStatus &&
    !areTrackerListStatusesEquivalent(remote.status, targetStatus)
  ) {
    return true;
  }
  return false;
}

/**
 * @description Synchronise toutes les œuvres ayant un ID tracker pour un provider.
 * Exclut le sas Mihon (`pending_mihon`) — réservé à l'enrichissement manuel.
 * Précharge la liste perso (bulk) comme la sync anime.
 * @param onProgress - Avancement optionnel pour la barre de statut.
 */
export async function syncAllWorksFromTracker(
  provider: TrackerProvider,
  onProgress?: TrackerSyncProgressCallback,
): Promise<TrackerSyncResult[]> {
  const supabase = getSupabaseClient();
  const column = provider === "mal" ? "mal_id" : "anilist_id";
  onProgress?.({
    current: 0,
    total: 0,
    label: "Chargement des séries…",
    phase: "loading",
  });

  const { data, error } = await supabase
    .from("works")
    .select("*")
    .not(column, "is", null)
    .order("title");

  if (error) {
    throw new Error(`Impossible de charger les œuvres : ${error.message}`);
  }

  const works = ((data ?? []) as Work[]).filter(
    (work) => work.enrichment_status !== "pending_mihon",
  );
  const total = works.length;
  const results: TrackerSyncResult[] = [];

  if (total === 0) {
    onProgress?.({
      current: 0,
      total: 0,
      label: "Aucune série à synchroniser",
      phase: "done",
    });
    return results;
  }

  onProgress?.({
    current: 0,
    total,
    label: "Chargement des listes trackers…",
    phase: "loading",
  });
  const remotesCache = await loadRemoteProgressCache();

  for (let index = 0; index < works.length; index += 1) {
    const work = works[index];
    onProgress?.({
      current: index + 1,
      total,
      label: `Manga · ${work.title}`,
      phase: "syncing",
    });
    results.push(await syncWorkFromRemotes(work, provider, remotesCache));
    // Laisse l’UI répondre entre chaque série (évite le figeage).
    await yieldToMain();
  }

  onProgress?.({
    current: total,
    total,
    label: "Sync manga terminée",
    phase: "done",
  });
  requestSupabaseDataReload();
  return results;
}

/**
 * @description Sync fusionnée MAL + AniList (dernière MAJ API gagne) puis push d'alignement.
 * Exclut le sas Mihon (`pending_mihon`). Source de vérité = APIs uniquement.
 * @param onProgress - Avancement optionnel pour la barre de statut.
 */
export async function syncAllWorksFromAllLinkedTrackers(
  onProgress?: TrackerSyncProgressCallback,
): Promise<TrackerSyncResult[]> {
  const supabase = getSupabaseClient();
  onProgress?.({
    current: 0,
    total: 0,
    label: "Chargement des séries…",
    phase: "loading",
  });

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
    onProgress?.({
      current: 0,
      total: 0,
      label: "Aucun tracker connecté",
      phase: "done",
    });
    return [];
  }

  const works = ((data ?? []) as Work[]).filter(
    (work) => work.enrichment_status !== "pending_mihon",
  );
  const total = works.length;
  const results: TrackerSyncResult[] = [];

  if (total === 0) {
    onProgress?.({
      current: 0,
      total: 0,
      label: "Aucune série à synchroniser",
      phase: "done",
    });
    return results;
  }

  onProgress?.({
    current: 0,
    total,
    label: "Chargement des listes MAL / AniList…",
    phase: "loading",
  });
  const remotesCache = await loadRemoteProgressCache();

  for (let index = 0; index < works.length; index += 1) {
    const work = works[index]!;
    const preferred: TrackerProvider =
      anilistToken && work.anilist_id != null ? "anilist" : "mal";
    onProgress?.({
      current: index + 1,
      total,
      label: `Manga · ${work.title}`,
      phase: "syncing",
    });
    try {
      results.push(await syncWorkFromRemotes(work, preferred, remotesCache));
    } catch (err) {
      console.warn(`Sync trackers « ${work.title} » :`, err);
    }
    await yieldToMain();
  }

  onProgress?.({
    current: total,
    total,
    label: "Sync manga terminée",
    phase: "done",
  });
  requestSupabaseDataReload();
  return results;
}

/**
 * @description Choisit la progression API la plus récente ; si aucun horodatage, max des valeurs.
 * Les statuts « à lire » (déjà normalisés à 0/0) restent utilisables pour vider le local.
 */
function pickLatestRemoteProgress(
  remotes: TrackerRemoteProgress[],
): TrackerRemoteProgress | null {
  const usable = remotes.filter(
    (remote) =>
      remote.chaptersRead != null ||
      remote.volumesRead != null ||
      isTrackerPlanToReadStatus(remote.status),
  );
  if (usable.length === 0) {
    return null;
  }

  const dated = usable.filter((remote) => remote.updatedAtMs != null);
  if (dated.length > 0) {
    return dated.reduce((best, current) =>
      (current.updatedAtMs ?? 0) >= (best.updatedAtMs ?? 0) ? current : best,
    );
  }

  // Sans horodatage : un « à lire » l'emporte (évite d'appliquer des reliquats).
  const planning = usable.find((remote) =>
    isTrackerPlanToReadStatus(remote.status),
  );
  if (planning) {
    return planning;
  }

  // Aucun horodatage : max chapitres / tomes entre APIs
  return {
    provider: usable[0]!.provider,
    mediaId: usable[0]!.mediaId,
    chaptersRead: maxNullable(usable.map((s) => s.chaptersRead)),
    volumesRead: maxNullable(usable.map((s) => s.volumesRead)),
    status: usable.find((s) => s.status)?.status ?? null,
    updatedAtMs: null,
  };
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
 * Ne touche pas la base si l'état local est déjà aligné sur l'API.
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

  const target = Math.min(Math.max(0, Math.floor(volumesRead)), physical.length);
  const readIds = await fetchReadVolumeIdsForWork(workId);
  const toMark = physical.slice(0, target).map((row) => row.id);
  const toClear = physical.slice(target).map((row) => row.id);

  const missingMarks = toMark.filter((id) => !readIds.has(id));
  const excessReads = toClear.filter((id) => readIds.has(id));

  // Déjà aligné (préfixe lu + suffixe non lu) : aucune écriture.
  if (missingMarks.length === 0 && excessReads.length === 0) {
    return target;
  }

  if (missingMarks.length > 0) {
    await markAllVolumesRead(missingMarks);
  }

  if (excessReads.length > 0) {
    await clearVolumeReads(excessReads);
  }

  return target;
}
