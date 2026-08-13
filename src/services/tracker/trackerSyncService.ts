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
  mapTrackerStatusForProvider,
  trackerNeedsProgressPush,
} from "@/utils/trackerReadingStatus";
import {
  decideTrackerFieldSync,
  pickTrackerSideCounts,
  statusForPushedProgress,
  statusForSyncDecisions,
  targetCountForPush,
} from "@/utils/trackerSyncMerge";
import {
  loadTrackerSyncMemory,
  patchFieldMemory,
  readFieldMemory,
  saveTrackerSyncMemory,
  type TrackerSyncMemoryMap,
} from "@/services/tracker/trackerSyncMemory";
import {
  getTrackerSyncReport,
  publishTrackerSyncReport,
  replaceTrackerSyncReport,
} from "@/services/tracker/trackerSyncReportStore";
import { resolveWorkTrackingProfile } from "@/utils/workTracking";
import { yieldToMain } from "@/utils/scheduleIdleTask";
import type { Work } from "@/types/database";
import type {
  TrackerFieldSyncDecision,
  TrackerProvider,
  TrackerRemoteProgress,
  TrackerSyncConflictItem,
  TrackerSyncField,
  TrackerSyncProgressCallback,
  TrackerSyncReportSource,
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
 * Source de vérité mixte : vide vs rempli s'aligne ; deux valeurs > 0 divergentes
 * restent en conflit (rapport consultable, sans écrasement silencieux).
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
 * @description Sync lecture : vide vs rempli s'aligne ; conflit si les deux ont une progression.
 * @param remotesCache - Progressions préchargées (sync batch) ; sinon fetch unitaire.
 * @param memory - Mémoire pull/conflit (mutée) pour ne pas re-tirer un 49 déjà annulé.
 */
async function syncWorkFromRemotes(
  work: Work,
  preferredProvider: TrackerProvider,
  remotesCache?: RemoteProgressCache,
  memory?: TrackerSyncMemoryMap,
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

  const profile = resolveWorkTrackingProfile(work);
  const side = pickTrackerSideCounts(remotes);
  const localChapters = profile.hasChapterTracking
    ? (await fetchChapterProgressDetail(work.id)).chaptersRead
    : 0;
  const localVolumes = profile.hasVolumeTracking
    ? await fetchLocalVolumeReadCount(work.id)
    : 0;

  const chapterDecision = profile.hasChapterTracking
    ? decideTrackerFieldSync({
        field: "chapters",
        local: localChapters,
        remote: side.chapters,
        memory: memory ? readFieldMemory(memory, work.id, "chapters") : null,
      })
    : null;
  const volumeDecision = profile.hasVolumeTracking
    ? decideTrackerFieldSync({
        field: "volumes",
        local: localVolumes,
        remote: side.volumes,
        memory: memory ? readFieldMemory(memory, work.id, "volumes") : null,
      })
    : null;

  if (memory && chapterDecision) {
    Object.assign(memory, rememberDecision(memory, work.id, chapterDecision));
  }
  if (memory && volumeDecision) {
    Object.assign(memory, rememberDecision(memory, work.id, volumeDecision));
  }

  let chaptersApplied: number | null = null;
  let volumesApplied: number | null = null;
  let chapterVfTotal: number | null = null;

  if (chapterDecision?.kind === "pull") {
    const applied = await applyRemoteProgressToWork(work, preferredProvider, {
      provider: preferredProvider,
      mediaId:
        preferredProvider === "mal"
          ? (work.mal_id ?? 0)
          : (work.anilist_id ?? 0),
      chaptersRead: chapterDecision.remote,
      volumesRead: null,
      status: side.status,
      updatedAtMs: null,
    });
    chaptersApplied = applied.chaptersApplied;
    chapterVfTotal = applied.chapterVfTotal ?? null;
  }

  if (volumeDecision?.kind === "pull") {
    const applied = await applyRemoteProgressToWork(work, preferredProvider, {
      provider: preferredProvider,
      mediaId:
        preferredProvider === "mal"
          ? (work.mal_id ?? 0)
          : (work.anilist_id ?? 0),
      chaptersRead: null,
      volumesRead: volumeDecision.remote,
      status: side.status,
      updatedAtMs: null,
    });
    volumesApplied = applied.volumesApplied;
  }

  const targetChapters = chapterDecision
    ? targetCountForPush(chapterDecision)
    : null;
  const targetVolumes = volumeDecision
    ? targetCountForPush(volumeDecision)
    : null;
  const targetStatus = statusForSyncDecisions(
    chapterDecision,
    volumeDecision,
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
    targetStatus,
  });

  return {
    provider: preferredProvider,
    workId: work.id,
    workTitle: work.title,
    chaptersApplied,
    volumesApplied,
    chapterVfTotal,
    remoteChapters: side.chapters,
    pushedProviders: pushResult.pushed,
    pushErrors: pushResult.errors.length > 0 ? pushResult.errors : undefined,
    chapterDecision: chapterDecision ?? undefined,
    volumeDecision: volumeDecision ?? undefined,
  };
}

/**
 * @description Met à jour la mémoire après une décision (pull déjà vu, conflits répétés).
 */
function rememberDecision(
  memory: TrackerSyncMemoryMap,
  workId: string,
  decision: TrackerFieldSyncDecision,
): TrackerSyncMemoryMap {
  if (decision.kind === "pull") {
    return patchFieldMemory(memory, workId, decision.field, {
      autoPulledRemote: decision.remote,
      rejectedRemote: null,
    });
  }
  if (decision.kind === "conflict") {
    const prev = readFieldMemory(memory, workId, decision.field);
    return patchFieldMemory(memory, workId, decision.field, {
      conflictShows: (prev?.conflictShows ?? 0) + 1,
    });
  }
  if (decision.kind === "push") {
    return patchFieldMemory(memory, workId, decision.field, {
      autoPulledRemote: null,
      rejectedRemote: null,
      conflictShows: 0,
    });
  }
  return memory;
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
    const needsPush = trackerNeedsProgressPush({
      remote: malRemote,
      onList,
      targetChapters,
      targetVolumes,
      targetStatus,
    });
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
    const needsPush = trackerNeedsProgressPush({
      remote: anilistRemote,
      onList,
      targetChapters,
      targetVolumes,
      targetStatus,
    });
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
 * @description Synchronise toutes les œuvres ayant un ID tracker pour un provider.
 * Exclut le sas Mihon (`pending_mihon`) — réservé à l'enrichissement manuel.
 * Précharge la liste perso (bulk) comme la sync anime.
 * @param onProgress - Avancement optionnel pour la barre de statut.
 */
export async function syncAllWorksFromTracker(
  provider: TrackerProvider,
  onProgress?: TrackerSyncProgressCallback,
  reportSource: TrackerSyncReportSource = "manual",
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
  let memory = await loadTrackerSyncMemory();

  for (let index = 0; index < works.length; index += 1) {
    const work = works[index];
    onProgress?.({
      current: index + 1,
      total,
      label: `Manga · ${work.title}`,
      phase: "syncing",
    });
    results.push(
      await syncWorkFromRemotes(work, provider, remotesCache, memory),
    );
    // Laisse l’UI répondre entre chaque série (évite le figeage).
    await yieldToMain();
  }

  await saveTrackerSyncMemory(memory);
  publishMangaSyncReport(results, reportSource);

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
  reportSource: TrackerSyncReportSource = "manual",
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
  let memory = await loadTrackerSyncMemory();

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
      results.push(
        await syncWorkFromRemotes(work, preferred, remotesCache, memory),
      );
    } catch (err) {
      console.warn(`Sync trackers « ${work.title} » :`, err);
    }
    await yieldToMain();
  }

  await saveTrackerSyncMemory(memory);
  publishMangaSyncReport(results, reportSource);

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
 * @description Construit le rapport consultable (sans ouvrir de modale).
 */
function publishMangaSyncReport(
  results: TrackerSyncResult[],
  source: TrackerSyncReportSource,
): void {
  let pulled = 0;
  let pushed = 0;
  const conflicts: TrackerSyncConflictItem[] = [];
  for (const row of results) {
    for (const decision of [row.chapterDecision, row.volumeDecision]) {
      if (!decision) continue;
      if (decision.kind === "pull") pulled += 1;
      if (decision.kind === "push") pushed += 1;
      if (decision.kind === "conflict") {
        conflicts.push({
          workId: row.workId,
          workTitle: row.workTitle,
          field: decision.field,
          local: decision.local,
          remote: decision.remote,
          repeated: decision.repeated,
        });
      }
    }
  }
  const notable = results.filter((row) => {
    const kinds = [row.chapterDecision?.kind, row.volumeDecision?.kind];
    return (
      kinds.includes("pull") ||
      kinds.includes("push") ||
      kinds.includes("conflict") ||
      (row.pushedProviders?.length ?? 0) > 0 ||
      (row.pushErrors?.length ?? 0) > 0
    );
  });
  publishTrackerSyncReport({
    at: new Date().toISOString(),
    source,
    pulled,
    pushed,
    conflicts,
    results: notable,
  });
}

/**
 * @description Tomes physiques d'une série (hors volume placeholder chapitres).
 */
async function fetchPhysicalVolumeRows(
  workId: string,
): Promise<Array<{ id: string; volume_number: number | null; volume_label: string | null }>> {
  const supabase = getSupabaseClient();
  const { data: volumeRows, error } = await supabase
    .from("volumes")
    .select("id, volume_number, volume_label")
    .eq("work_id", workId)
    .order("volume_number", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Impossible de charger les tomes : ${error.message}`);
  }

  return (volumeRows ?? []).filter(
    (row) =>
      !(
        row.volume_number == null &&
        row.volume_label === CHAPTER_SERIES_VOLUME_LABEL
      ),
  );
}

/**
 * @description Compte les tomes physiques lus localement (hors placeholder chapitres).
 */
async function fetchLocalVolumeReadCount(workId: string): Promise<number> {
  const physical = await fetchPhysicalVolumeRows(workId);
  if (physical.length === 0) {
    return 0;
  }
  const readIds = await fetchReadVolumeIdsForWork(workId);
  return physical.filter((row) => readIds.has(row.id)).length;
}

/**
 * @description Marque les N premiers tomes du catalogue comme lus (ordre catalogue).
 * Ne touche pas la base si l'état local est déjà aligné sur l'API.
 */
async function applyVolumeReadCount(
  workId: string,
  volumesRead: number,
): Promise<number> {
  const physical = await fetchPhysicalVolumeRows(workId);

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

/**
 * @description Trancher un conflit : garder l'app (push) ou le tracker (pull).
 */
export async function resolveTrackerSyncConflict(params: {
  workId: string;
  field: TrackerSyncField;
  keep: "app" | "tracker";
}): Promise<void> {
  const report = getTrackerSyncReport();
  const item = report?.conflicts.find(
    (row) => row.workId === params.workId && row.field === params.field,
  );
  if (!item) {
    throw new Error("Conflit de suivi introuvable.");
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .eq("id", params.workId)
    .single();
  if (error || !data) {
    throw new Error(`Série introuvable : ${error?.message ?? params.workId}`);
  }
  const work = data as Work;
  const preferred: TrackerProvider =
    work.anilist_id != null ? "anilist" : "mal";
  const keepTracker = params.keep === "tracker";
  const target = keepTracker ? item.remote : item.local;
  const profile = resolveWorkTrackingProfile(work);

  await applyRemoteProgressToWork(work, preferred, {
    provider: preferred,
    mediaId:
      preferred === "mal" ? (work.mal_id ?? 0) : (work.anilist_id ?? 0),
    chaptersRead: params.field === "chapters" ? target : null,
    volumesRead: params.field === "volumes" ? target : null,
    status: null,
    updatedAtMs: null,
  });

  const malToken =
    work.mal_id != null ? await fetchTrackerAccessToken("mal") : null;
  const anilistToken =
    work.anilist_id != null ? await fetchTrackerAccessToken("anilist") : null;
  const remotes: TrackerRemoteProgress[] = [];
  const readableProviders = new Set<TrackerProvider>();
  const onListProviders = new Set<TrackerProvider>();

  if (malToken && work.mal_id != null) {
    const remote = await resolveRemoteProgress("mal", malToken, work.mal_id);
    readableProviders.add("mal");
    if (remote) {
      onListProviders.add("mal");
      remotes.push(remote);
    }
  }
  if (anilistToken && work.anilist_id != null) {
    const remote = await resolveRemoteProgress(
      "anilist",
      anilistToken,
      work.anilist_id,
    );
    readableProviders.add("anilist");
    if (remote) {
      onListProviders.add("anilist");
      remotes.push(remote);
    }
  }

  const targetChapters = params.field === "chapters" ? target : null;
  const targetVolumes = params.field === "volumes" ? target : null;
  const otherChapters = profile.hasChapterTracking
    ? params.field === "chapters"
      ? target
      : (await fetchChapterProgressDetail(work.id)).chaptersRead
    : null;
  const otherVolumes = profile.hasVolumeTracking
    ? params.field === "volumes"
      ? target
      : await fetchLocalVolumeReadCount(work.id)
    : null;
  await pushProgressToLaggingTrackers({
    work,
    malToken,
    anilistToken,
    remotes,
    readableProviders,
    onListProviders,
    targetChapters,
    targetVolumes,
    targetStatus: statusForPushedProgress(otherChapters, otherVolumes),
  });

  const memory = await loadTrackerSyncMemory();
  await saveTrackerSyncMemory(
    patchFieldMemory(memory, params.workId, params.field, {
      autoPulledRemote: keepTracker ? target : null,
      rejectedRemote: keepTracker ? null : item.remote,
      conflictShows: 0,
    }),
  );

  if (report) {
    replaceTrackerSyncReport({
      ...report,
      conflicts: report.conflicts.filter(
        (row) =>
          !(row.workId === params.workId && row.field === params.field),
      ),
    });
  }
  requestSupabaseDataReload();
}
