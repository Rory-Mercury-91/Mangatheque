import {
  buildAnimeFormFromMalId,
  createAnime,
  fetchAnimeByMalId,
  fetchAnimes,
} from "@/services/animeService";
import { upsertAnimeProgress } from "@/services/animeProgressService";
import {
  fetchMalUserAnimeList,
  pushMalAnimeProgress,
  type MalAnimeListEntry,
  type MalAnimeRemoteProgress,
} from "@/services/tracker/malAnimeApi";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import {
  deriveAnimeListStatus,
  normalizeAnimeListStatus,
} from "@/constants/animeStatus";
import type { Anime, AnimeListStatus } from "@/types/anime";
import {
  createEmptyAnimeFormValues,
  type AnimeFormValues,
} from "@/types/animeForm";
import { syncAllWorksFromTracker } from "@/services/tracker/trackerSyncService";
import type {
  TrackerProvider,
  TrackerSyncProgressCallback,
} from "@/types/tracker";
import {
  parseMalAnimeListXml,
  type MalAnimeListXmlEntry,
} from "@/utils/malAnimeListXmlParser";

/** Statuts importés depuis un XML liste MAL (suivi actif pour le planning). */
const MAL_XML_ACTIVE_STATUSES: AnimeListStatus[] = [
  "watching",
  "on_hold",
  "plan_to_watch",
];

export interface MalAnimeListXmlImportStats {
  scanned: number;
  considered: number;
  created: number;
  updated: number;
  failed: number;
}

export interface AnimeSyncResult {
  animeId: string;
  title: string;
  malId: number;
  /** Fiche créée localement depuis la liste MAL. */
  created: boolean;
  episodesApplied: number | null;
  skippedReason?: string;
}

/**
 * @description Pause courte entre imports (MAL + Jikan).
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * @description Relance une requête en cas d'erreur MAL / réseau temporaire.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /HTTP 429|HTTP 5\d\d|timeout|temporaire|network/i.test(
        message,
      );
      if (!retryable || attempt === attempts - 1) {
        throw error;
      }
      await wait(900 * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * @description Formulaire minimal depuis l'entrée liste MAL (si le détail échoue).
 */
function buildMinimalAnimeFormFromListEntry(
  entry: MalAnimeListEntry,
): AnimeFormValues {
  const form = createEmptyAnimeFormValues();
  form.malId = entry.id;
  form.title = entry.title;
  form.coverUrl = entry.coverUrl ?? "";
  form.mediaType = entry.mediaType ?? "tv";
  form.status = entry.status ?? "finished_airing";
  form.episodes = entry.episodes;
  const remote = entry.listStatus;
  if (remote) {
    form.listStatus = remote.status ?? "plan_to_watch";
    form.episodesWatched = remote.episodesWatched ?? 0;
    form.startedAt = remote.startedAt;
    form.finishedAt = remote.finishedAt;
  }
  return form;
}

/**
 * @description Statut local dérivé (épisodes + abandon MAL).
 */
function resolveTargetStatus(
  episodesWatched: number,
  episodesTotal: number | null | undefined,
  remoteStatus: AnimeListStatus | null | undefined,
  localStatus: AnimeListStatus | null | undefined,
  preferRemote: boolean,
): AnimeListStatus {
  const base = preferRemote
    ? (remoteStatus ?? localStatus ?? "plan_to_watch")
    : (localStatus ?? remoteStatus ?? "plan_to_watch");
  const abandoned = base === "dropped";
  return deriveAnimeListStatus(episodesWatched, episodesTotal, abandoned);
}

/**
 * @description Applique la progression MAL sur une fiche locale (pull + push si besoin).
 */
async function applyProgressFromRemote(options: {
  userId: string;
  token: string;
  anime: Anime;
  remote: MalAnimeRemoteProgress;
}): Promise<{ episodesApplied: number }> {
  const { userId, token, anime, remote } = options;
  const supabase = getSupabaseClient();

  const { data: localRow } = await supabase
    .from("user_anime_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("anime_id", anime.id)
    .maybeSingle();

  const localEpisodes = Number(localRow?.episodes_watched ?? 0);
  const localUpdated = localRow?.updated_at
    ? Date.parse(String(localRow.updated_at))
    : 0;
  const remoteUpdated = remote.updatedAtMs ?? 0;
  const remoteEpisodes = remote.episodesWatched ?? 0;
  const remoteStatus = remote.status
    ? normalizeAnimeListStatus(remote.status)
    : null;
  const localStatus = localRow?.list_status
    ? normalizeAnimeListStatus(String(localRow.list_status))
    : null;

  const preferRemote = remoteUpdated >= localUpdated || !localRow;
  const targetEpisodes = preferRemote ? remoteEpisodes : localEpisodes;
  const targetStatus = resolveTargetStatus(
    targetEpisodes,
    anime.episodes,
    remoteStatus,
    localStatus,
    preferRemote,
  );

  const startedAt = preferRemote
    ? (remote.startedAt ?? (localRow?.started_at as string | null) ?? null)
    : ((localRow?.started_at as string | null) ?? remote.startedAt ?? null);
  const finishedAt = preferRemote
    ? (remote.finishedAt ?? (localRow?.finished_at as string | null) ?? null)
    : ((localRow?.finished_at as string | null) ?? remote.finishedAt ?? null);

  await upsertAnimeProgress(userId, anime.id, {
    listStatus: targetStatus,
    episodesWatched: targetEpisodes,
    startedAt,
    finishedAt,
  });

  if (!preferRemote || remoteEpisodes !== targetEpisodes) {
    try {
      await pushMalAnimeProgress(token, anime.mal_id, {
        status: targetStatus,
        episodesWatched: targetEpisodes,
        startedAt,
        finishedAt,
      });
    } catch {
      // Push best-effort
    }
  }

  return { episodesApplied: targetEpisodes };
}

/**
 * @description Crée une fiche depuis MAL (détail + retries, sinon données liste).
 */
async function createAnimeFromMalListEntry(
  entry: MalAnimeListEntry,
): Promise<Anime> {
  try {
    const form = await withRetry(() => buildAnimeFormFromMalId(entry.id));
    const remote = entry.listStatus;
    if (remote) {
      form.listStatus = remote.status ?? form.listStatus;
      form.episodesWatched = remote.episodesWatched ?? form.episodesWatched;
      form.startedAt = remote.startedAt ?? form.startedAt;
      form.finishedAt = remote.finishedAt ?? form.finishedAt;
    }
    return await createAnime(form, { onDuplicate: "return" });
  } catch (detailError) {
    console.warn(
      `Import animé MAL ${entry.id} en mode minimal :`,
      detailError,
    );
    return await createAnime(buildMinimalAnimeFormFromListEntry(entry), {
      onDuplicate: "return",
    });
  }
}

/**
 * @description Sync anime MAL : importe les fiches absentes (sans doublon mal_id) + aligne le suivi.
 * @param onProgress - Avancement optionnel pour la barre de statut.
 */
export async function syncAllAnimesFromMal(
  onProgress?: TrackerSyncProgressCallback,
): Promise<AnimeSyncResult[]> {
  const token = await fetchTrackerAccessToken("mal");
  if (!token) {
    throw new Error("MyAnimeList n'est pas connecté.");
  }

  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Utilisateur non connecté.");
  }

  onProgress?.({
    current: 0,
    total: 0,
    label: "Chargement de la liste MAL…",
    phase: "loading",
    createdCount: 0,
  });

  const remoteList = await fetchMalUserAnimeList(token);
  const localByMalId = new Map<number, Anime>();
  for (const anime of await fetchAnimes()) {
    localByMalId.set(Number(anime.mal_id), anime);
  }

  const total = remoteList.length;
  const results: AnimeSyncResult[] = [];
  let createdCount = 0;

  if (total === 0) {
    onProgress?.({
      current: 0,
      total: 0,
      label: "Aucun animé sur la liste MAL",
      phase: "done",
      createdCount: 0,
    });
    return results;
  }

  for (let index = 0; index < remoteList.length; index += 1) {
    const entry = remoteList[index]!;
    const malId = Number(entry.id);
    const willCreate = !localByMalId.has(malId);
    onProgress?.({
      current: index + 1,
      total,
      label: willCreate
        ? `Création · ${entry.title}`
        : `Suivi · ${entry.title}`,
      phase: "syncing",
      createdCount,
    });

    try {
      let anime = localByMalId.get(malId) ?? null;
      let created = false;

      if (!anime) {
        // Relecture DB (évite faux « déjà en biblio » si le cache liste était incomplet)
        anime = await fetchAnimeByMalId(malId);
        if (!anime) {
          anime = await createAnimeFromMalListEntry(entry);
          created = true;
          createdCount += 1;
          await wait(750);
        }
        localByMalId.set(Number(anime.mal_id), anime);
      }

      if (!entry.listStatus) {
        results.push({
          animeId: anime.id,
          title: anime.title,
          malId,
          created,
          episodesApplied: created ? 0 : null,
          skippedReason: created
            ? undefined
            : "Pas de progression MAL pour cette entrée.",
        });
        continue;
      }

      const { episodesApplied } = await applyProgressFromRemote({
        userId: user.id,
        token,
        anime,
        remote: entry.listStatus,
      });

      results.push({
        animeId: anime.id,
        title: anime.title,
        malId,
        created,
        episodesApplied,
      });
    } catch (err) {
      results.push({
        animeId: "",
        title: entry.title,
        malId,
        created: false,
        episodesApplied: null,
        skippedReason:
          err instanceof Error ? err.message : "Échec synchronisation.",
      });
      await wait(500);
    }
  }

  onProgress?.({
    current: total,
    total,
    label: "Sync anime terminée",
    phase: "done",
    createdCount,
  });

  requestSupabaseDataReload();
  return results;
}

/**
 * @description Résumé lisible d'une sync anime MAL.
 */
export function summarizeAnimeSyncResults(results: AnimeSyncResult[]): string {
  const created = results.filter((r) => r.created).length;
  const synced = results.filter((r) => r.episodesApplied != null).length;
  const failed = results.filter((r) => Boolean(r.skippedReason)).length;

  if (results.length === 0) {
    return "Aucun animé sur la liste MAL.";
  }

  const parts = [
    `${synced} suivi${synced > 1 ? "s" : ""} aligné${synced > 1 ? "s" : ""}`,
  ];
  if (created > 0) {
    parts.unshift(
      `${created} fiche${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}`,
    );
  }
  if (failed > 0) {
    parts.push(`${failed} en erreur`);
  }
  return `Sync anime MAL — ${parts.join(", ")}.`;
}

/**
 * @description Importe un export XML liste animé MAL (créé les fiches absentes + progression).
 * Par défaut : Watching / On-Hold / Plan to Watch uniquement (utile pour le planning).
 * @param xml - Contenu XML MyAnimeList.
 * @param onProgress - Avancement optionnel.
 */
export async function importMalAnimeListXml(
  xml: string,
  onProgress?: TrackerSyncProgressCallback,
): Promise<{ results: AnimeSyncResult[]; stats: MalAnimeListXmlImportStats }> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Utilisateur non connecté.");
  }

  const allEntries = parseMalAnimeListXml(xml);
  const entries = allEntries.filter((entry) =>
    MAL_XML_ACTIVE_STATUSES.includes(entry.listStatus),
  );

  onProgress?.({
    current: 0,
    total: entries.length,
    label: "Analyse de l'export MAL…",
    phase: "loading",
    createdCount: 0,
  });

  if (entries.length === 0) {
    throw new Error(
      "Aucune série en cours / à voir / en pause dans cet export MAL.",
    );
  }

  const localByMalId = new Map<number, Anime>();
  for (const anime of await fetchAnimes()) {
    localByMalId.set(Number(anime.mal_id), anime);
  }

  const results: AnimeSyncResult[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const malId = Number(entry.malId);
    const willCreate = !localByMalId.has(malId);
    onProgress?.({
      current: index + 1,
      total: entries.length,
      label: willCreate
        ? `Création · ${entry.title}`
        : `Suivi · ${entry.title}`,
      phase: "syncing",
      createdCount,
    });

    try {
      let anime = localByMalId.get(malId) ?? null;
      let created = false;

      if (!anime) {
        anime = await fetchAnimeByMalId(malId);
        if (!anime) {
          anime = await createAnimeFromMalListEntry(
            xmlEntryToMalListEntry(entry),
          );
          created = true;
          createdCount += 1;
          await wait(750);
        }
        localByMalId.set(Number(anime.mal_id), anime);
      }

      await upsertAnimeProgress(user.id, anime.id, {
        listStatus: entry.listStatus,
        episodesWatched: entry.episodesWatched,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
      });
      updatedCount += 1;

      results.push({
        animeId: anime.id,
        title: anime.title,
        malId,
        created,
        episodesApplied: entry.episodesWatched,
      });
    } catch (err) {
      failedCount += 1;
      results.push({
        animeId: "",
        title: entry.title,
        malId,
        created: false,
        episodesApplied: null,
        skippedReason:
          err instanceof Error ? err.message : "Échec import XML MAL.",
      });
      await wait(400);
    }
  }

  onProgress?.({
    current: entries.length,
    total: entries.length,
    label: "Import XML MAL terminé",
    phase: "done",
    createdCount,
  });

  requestSupabaseDataReload();
  return {
    results,
    stats: {
      scanned: allEntries.length,
      considered: entries.length,
      created: createdCount,
      updated: updatedCount,
      failed: failedCount,
    },
  };
}

/**
 * @description Convertit une entrée XML MAL vers le format liste API.
 */
function xmlEntryToMalListEntry(entry: MalAnimeListXmlEntry): MalAnimeListEntry {
  return {
    id: entry.malId,
    title: entry.title,
    coverUrl: null,
    mediaType: entry.mediaType,
    status: null,
    episodes: entry.episodes,
    listStatus: {
      mediaId: entry.malId,
      status: entry.listStatus,
      episodesWatched: entry.episodesWatched,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      updatedAtMs: Date.now(),
    },
  };
}

/**
 * @description Message résumé d'un import XML liste MAL.
 */
export function summarizeMalAnimeListXmlImport(
  stats: MalAnimeListXmlImportStats,
): string {
  const parts = [
    `${stats.updated} suivi${stats.updated > 1 ? "s" : ""}`,
  ];
  if (stats.created > 0) {
    parts.unshift(
      `${stats.created} fiche${stats.created > 1 ? "s" : ""} créée${stats.created > 1 ? "s" : ""}`,
    );
  }
  if (stats.failed > 0) {
    parts.push(`${stats.failed} en erreur`);
  }
  return `Liste MAL importée — ${parts.join(", ")} (${stats.considered} actives / ${stats.scanned} dans le XML).`;
}

/**
 * @description Rapport détaillé des échecs de sync anime (pour l'UI).
 */
export function formatAnimeSyncFailureReport(
  results: AnimeSyncResult[],
): string | null {
  const failed = results.filter((r) => Boolean(r.skippedReason));
  if (failed.length === 0) return null;

  const maxLines = 40;
  const lines = failed.slice(0, maxLines).map((row) => {
    return `• ${row.title} (MAL ${row.malId}) — ${row.skippedReason}`;
  });
  const more =
    failed.length > maxLines
      ? `\n… et ${failed.length - maxLines} autre(s).`
      : "";

  return `Échecs sync anime (${failed.length}) :\n${lines.join("\n")}${more}`;
}

/**
 * @description Sync manga (tous trackers connectés) + anime MAL (import + suivi).
 * @param onProgress - Avancement par provider (mal / anilist).
 */
export async function syncGlobalTrackers(options?: {
  onProgress?: (
    provider: TrackerProvider,
    progress: import("@/types/tracker").TrackerSyncProgress,
  ) => void;
}): Promise<{
  mangaMal: number;
  mangaAniList: number;
  animeMal: number;
  animeCreated: number;
  animeMessage: string;
  animeFailureReport: string | null;
}> {
  let mangaMal = 0;
  let mangaAniList = 0;
  const onProgress = options?.onProgress;

  for (const provider of ["mal", "anilist"] as TrackerProvider[]) {
    const token = await fetchTrackerAccessToken(provider);
    if (!token) continue;
    const results = await syncAllWorksFromTracker(provider, (progress) => {
      onProgress?.(provider, progress);
    });
    const applied = results.filter(
      (row) =>
        row.chaptersApplied != null ||
        row.volumesApplied != null ||
        (row.pushedProviders?.length ?? 0) > 0,
    ).length;
    if (provider === "mal") mangaMal = applied;
    else mangaAniList = applied;
  }

  const animeResults = await syncAllAnimesFromMal((progress) => {
    onProgress?.("mal", progress);
  });
  const animeMal = animeResults.filter((r) => r.episodesApplied != null).length;
  const animeCreated = animeResults.filter((r) => r.created).length;

  return {
    mangaMal,
    mangaAniList,
    animeMal,
    animeCreated,
    animeMessage: summarizeAnimeSyncResults(animeResults),
    animeFailureReport: formatAnimeSyncFailureReport(animeResults),
  };
}
