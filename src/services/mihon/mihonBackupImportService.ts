import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import {
  decodeMihonBackupFile,
  type MihonBackupEntry,
} from "@/services/mihon/mihonBackupDecodeService";
import {
  buildMihonCatalogUrl,
  fetchMihonSourceMap,
  getMihonSourceIndexStats,
  refreshMihonSourceIndex,
  type MihonSourceInfo,
} from "@/services/mihon/mihonSourceIndexService";
import { fetchJikanMangaMinimal } from "@/services/jikan/jikanMangaApi";
import { setChapterProgress } from "@/services/readingProgressService";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import { fillMissingTrackerIds } from "@/services/tracker/trackerIdResolveService";
import {
  createWorkWithVolumes,
  fetchLocalWorkAnilistIdMap,
  fetchLocalWorkMalIdMap,
} from "@/services/workService";
import {
  createEmptyWorkFormValues,
  type WorkFormValues,
} from "@/types/workForm";
import { yieldToMain } from "@/utils/scheduleIdleTask";

/** Pause entre appels Jikan (rate-limit ~3 req/s). */
const JIKAN_THROTTLE_MS = 450;

/** Pause entre résolutions AniList (API publique). */
const ANILIST_RESOLVE_THROTTLE_MS = 350;

export interface MihonImportProgress {
  total: number;
  current: number;
  created: number;
  skipped: number;
  errors: number;
  item: string;
}

export interface MihonImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  withMalId: number;
  withAnilistId: number;
  withoutTrackerIds: number;
  withCatalogUrl: number;
  details: Array<{ title: string; reason: string; kind: "skip" | "error" }>;
}

/**
 * @description Pause courte (throttle Jikan / UI).
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * @description Construit un formulaire minimal depuis le backup + Jikan optionnel.
 */
function buildFormFromEntry(
  entry: MihonBackupEntry,
  jikan: Awaited<ReturnType<typeof fetchJikanMangaMinimal>>,
  source: MihonSourceInfo | null,
  catalogUrl: string | null,
): WorkFormValues {
  const form = createEmptyWorkFormValues();
  const title = (jikan?.title || entry.title).trim() || "Sans titre";
  const genres = jikan?.genres?.length ? jikan.genres : entry.genres;
  const untrackedWithProgress = !entry.isTracked && entry.chaptersRead > 0;

  return {
    ...form,
    title,
    demographicType: jikan?.demographicType || "",
    readingStatus: normalizeWorkReadingStatus("ongoing"),
    genres,
    synopsis: jikan?.synopsis || entry.description || "",
    coverUrl: jikan?.coverUrl || entry.thumbnailUrl || "",
    sourceUrl: "",
    malId: entry.malId ?? jikan?.malId ?? null,
    anilistId: entry.anilistId,
    volumesVfCount: jikan?.volumes ?? null,
    chaptersVfCount: jikan?.chapters ?? (entry.chaptersTotal || null),
    hasVolumeTracking: true,
    hasChapterTracking: untrackedWithProgress || Boolean(jikan?.chapters),
    enrichmentStatus: "pending_mihon",
    mihonSourceId: entry.sourceId,
    mihonSourceName: source?.sourceName ?? null,
    mihonCatalogUrl: catalogUrl,
    volumes: [],
  };
}

/**
 * @description S'assure que l'index Keiyoushi est présent avant résolution d'URL.
 */
async function ensureMihonSourceIndex(): Promise<Map<string, MihonSourceInfo>> {
  const stats = await getMihonSourceIndexStats();
  if (stats.total === 0) {
    await refreshMihonSourceIndex();
  }
  return fetchMihonSourceMap();
}

/**
 * @description Importe une sauvegarde Mihon de façon contrôlée (sas pending_mihon).
 * @param file - Fichier .tachibk.
 * @param onProgress - Callback de progression.
 */
export async function importMihonBackupFile(
  file: File,
  onProgress?: (progress: MihonImportProgress) => void,
): Promise<MihonImportResult> {
  onProgress?.({
    total: 0,
    current: 0,
    created: 0,
    skipped: 0,
    errors: 0,
    item: "Index sources Mihon…",
  });
  const sourceMap = await ensureMihonSourceIndex();

  const entries = await decodeMihonBackupFile(file);
  const total = entries.length;
  const result: MihonImportResult = {
    total,
    created: 0,
    skipped: 0,
    errors: 0,
    withMalId: 0,
    withAnilistId: 0,
    withoutTrackerIds: 0,
    withCatalogUrl: 0,
    details: [],
  };

  const malMap = await fetchLocalWorkMalIdMap();
  const anilistMap = await fetchLocalWorkAnilistIdMap();

  const emit = (current: number, item: string) => {
    onProgress?.({
      total,
      current,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
      item,
    });
  };

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    emit(index + 1, entry.title);
    await yieldToMain();

    try {
      if (entry.malId) result.withMalId += 1;
      if (entry.anilistId) result.withAnilistId += 1;
      if (!entry.malId && !entry.anilistId) result.withoutTrackerIds += 1;

      if (entry.malId && malMap.has(entry.malId)) {
        result.skipped += 1;
        result.details.push({
          title: entry.title,
          reason: `MAL ${entry.malId} déjà présent`,
          kind: "skip",
        });
        continue;
      }
      if (entry.anilistId && anilistMap.has(entry.anilistId)) {
        result.skipped += 1;
        result.details.push({
          title: entry.title,
          reason: `AniList ${entry.anilistId} déjà présent`,
          kind: "skip",
        });
        continue;
      }

      const source = entry.sourceId
        ? sourceMap.get(entry.sourceId) ?? null
        : null;
      const catalogUrl = buildMihonCatalogUrl(
        source?.sourceBaseUrl,
        entry.sourcePath,
      );
      if (catalogUrl) result.withCatalogUrl += 1;

      let jikan: Awaited<ReturnType<typeof fetchJikanMangaMinimal>> = null;
      if (entry.malId) {
        try {
          jikan = await fetchJikanMangaMinimal(entry.malId);
        } catch (err) {
          console.warn(
            `Jikan indisponible pour MAL ${entry.malId} :`,
            err instanceof Error ? err.message : err,
          );
        }
        await wait(JIKAN_THROTTLE_MS);
      }

      const form = buildFormFromEntry(entry, jikan, source, catalogUrl);
      const needsTrackerResolve =
        (form.malId != null && form.anilistId == null) ||
        (form.anilistId != null && form.malId == null);
      if (needsTrackerResolve) {
        const beforeAni = form.anilistId;
        const beforeMal = form.malId;
        const filledIds = await fillMissingTrackerIds({
          malId: form.malId,
          anilistId: form.anilistId,
        });
        form.malId = filledIds.malId;
        form.anilistId = filledIds.anilistId;
        if (beforeAni == null && filledIds.anilistId != null) {
          result.withAnilistId += 1;
        }
        if (beforeMal == null && filledIds.malId != null) {
          result.withMalId += 1;
        }
        await wait(ANILIST_RESOLVE_THROTTLE_MS);
      }

      // Doublon AniList découvert seulement après résolution.
      if (form.anilistId && anilistMap.has(form.anilistId)) {
        result.skipped += 1;
        result.details.push({
          title: entry.title,
          reason: `AniList ${form.anilistId} déjà présent${
            entry.anilistId == null ? " (résolu depuis MAL)" : ""
          }`,
          kind: "skip",
        });
        continue;
      }
      if (form.malId && malMap.has(form.malId) && entry.malId == null) {
        result.skipped += 1;
        result.details.push({
          title: entry.title,
          reason: `MAL ${form.malId} déjà présent (résolu depuis AniList)`,
          kind: "skip",
        });
        continue;
      }

      const workId = await createWorkWithVolumes(form, {
        skipTitleUniqueness: true,
      });

      if (form.malId) malMap.set(form.malId, workId);
      if (form.anilistId) anilistMap.set(form.anilistId, workId);

      // Progression utile surtout sans tracker (sinon sync MAL/AniList possible).
      if (entry.chaptersRead > 0) {
        try {
          await setChapterProgress(workId, entry.chaptersRead, undefined, {
            expandCatalogue: true,
          });
        } catch (err) {
          console.warn(
            `Progression chapitres non appliquée pour « ${entry.title} » :`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      result.created += 1;
    } catch (err) {
      result.errors += 1;
      result.details.push({
        title: entry.title,
        reason: err instanceof Error ? err.message : "Erreur inconnue",
        kind: "error",
      });
    }
  }

  emit(total, "Terminé");
  requestSupabaseDataReload();
  return result;
}
