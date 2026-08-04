import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import { applyMihonToFormValues } from "@/services/importMapService";
import {
  decodeMihonBackupFile,
  type MihonBackupEntry,
} from "@/services/mihon/mihonBackupDecodeService";
import { ensureWorkMihonOwnership } from "@/services/mihon/mihonOwnershipService";
import {
  buildMihonCatalogUrl,
  fetchMihonSourceMap,
  getMihonSourceIndexStats,
  refreshMihonSourceIndex,
  type MihonSourceInfo,
} from "@/services/mihon/mihonSourceIndexService";
import {
  buildMihonIgnoreIndex,
  fetchMihonIgnoredEntries,
  matchesMihonIgnoreIndex,
} from "@/services/mihon/mihonIgnoreService";
import {
  attachWorkMihonSource,
  buildMihonCatalogKey,
  fetchLocalMihonCatalogWorkMap,
} from "@/services/mihon/workMihonSourceService";
import { fetchJikanMangaMinimal } from "@/services/jikan/jikanMangaApi";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import { fillMissingTrackerIds } from "@/services/tracker/trackerIdResolveService";
import {
  createWorkWithVolumes,
  fetchLocalWorkAnilistIdMap,
  fetchLocalWorkMalIdMap,
  findWorkByTitle,
} from "@/services/workService";
import {
  createEmptyWorkFormValues,
  type WorkFormValues,
} from "@/types/workForm";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import { yieldToMain } from "@/utils/scheduleIdleTask";

/** Pause entre appels Jikan (rate-limit ~3 req/s). */
const JIKAN_THROTTLE_MS = 450;

/** Pause entre résolutions AniList (API publique). */
const ANILIST_RESOLVE_THROTTLE_MS = 350;

export interface MihonImportProgress {
  total: number;
  current: number;
  created: number;
  attached: number;
  ownershipAdded: number;
  skipped: number;
  errors: number;
  item: string;
}

export interface MihonImportResult {
  total: number;
  created: number;
  attached: number;
  ownershipAdded: number;
  skipped: number;
  errors: number;
  withMalId: number;
  withAnilistId: number;
  withoutTrackerIds: number;
  withCatalogUrl: number;
  details: Array<{
    title: string;
    reason: string;
    kind: "skip" | "error" | "attach" | "ownership";
  }>;
}

export interface MihonBackupImportOptions {
  /** Propriétaire du compte Mihon associé à cette sauvegarde. */
  mihonOwnerId: string;
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
  mihonOwnerId: string,
): WorkFormValues {
  const form = createEmptyWorkFormValues();
  const title = (jikan?.title || entry.title).trim() || "Sans titre";
  const genres = jikan?.genres?.length ? jikan.genres : entry.genres;

  const base: WorkFormValues = {
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
    hasChapterTracking: Boolean(jikan?.chapters),
    enrichmentStatus: "pending_mihon",
    mihonSourceId: entry.sourceId,
    mihonSourceName: source?.sourceName ?? null,
    mihonCatalogUrl: catalogUrl,
    volumes: [],
  };

  // Compte Mihon → placeholder « Série numérique » (ou tomes si déjà présents).
  return applyMihonToFormValues(base, [mihonOwnerId]);
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
 * @description Enregistre l'ajout (ou le no-op) du compte Mihon sur une fiche existante.
 */
async function recordOwnershipOnWork(
  workId: string,
  mihonOwnerId: string,
  entryTitle: string,
  reasonPrefix: string,
  result: MihonImportResult,
): Promise<void> {
  const ownership = await ensureWorkMihonOwnership(workId, mihonOwnerId);
  if (ownership === "added") {
    result.ownershipAdded += 1;
    result.details.push({
      title: entryTitle,
      reason: `${reasonPrefix} — compte Mihon ajouté`,
      kind: "ownership",
    });
    return;
  }
  result.skipped += 1;
  result.details.push({
    title: entryTitle,
    reason: `${reasonPrefix} — compte Mihon déjà présent`,
    kind: "skip",
  });
}

/**
 * @description Rattache une source Mihon à une fiche existante (groupe) + ownership.
 */
async function attachSourceToWork(
  workId: string,
  entry: MihonBackupEntry,
  source: MihonSourceInfo | null,
  catalogUrl: string | null,
  catalogMap: Map<string, string>,
  reason: string,
  result: MihonImportResult,
  mihonOwnerId: string,
): Promise<"attached" | "skipped" | "ownership"> {
  if (!entry.sourceId?.trim()) {
    const ownership = await ensureWorkMihonOwnership(workId, mihonOwnerId);
    if (ownership === "added") {
      result.ownershipAdded += 1;
      result.details.push({
        title: entry.title,
        reason: `${reason} — source Mihon absente, compte Mihon ajouté`,
        kind: "ownership",
      });
      return "ownership";
    }
    result.skipped += 1;
    result.details.push({
      title: entry.title,
      reason: `${reason} — source Mihon absente`,
      kind: "skip",
    });
    return "skipped";
  }

  const attach = await attachWorkMihonSource(workId, {
    sourceId: entry.sourceId,
    sourceName: source?.sourceName ?? null,
    catalogUrl,
  });

  const catalogKey = buildMihonCatalogKey(
    entry.sourceId,
    catalogUrl,
    entry.sourcePath,
  );
  if (catalogKey) {
    catalogMap.set(catalogKey, workId);
  }

  const ownership = await ensureWorkMihonOwnership(workId, mihonOwnerId);

  if (attach.status === "already_present") {
    if (ownership === "added") {
      result.ownershipAdded += 1;
      result.details.push({
        title: entry.title,
        reason: `${reason} — source déjà rattachée, compte Mihon ajouté`,
        kind: "ownership",
      });
      return "ownership";
    }
    result.skipped += 1;
    result.details.push({
      title: entry.title,
      reason: `${reason} — source et compte Mihon déjà présents`,
      kind: "skip",
    });
    return "skipped";
  }

  result.attached += 1;
  result.details.push({
    title: entry.title,
    reason:
      ownership === "added"
        ? `${reason} — compte Mihon ajouté`
        : reason,
    kind: "attach",
  });
  if (ownership === "added") {
    result.ownershipAdded += 1;
  }
  return "attached";
}

/**
 * @description Importe une sauvegarde Mihon de façon contrôlée (sas pending_mihon).
 * Regroupe les multi-sources sur la même fiche (MAL / AniList / titre exact)
 * et rattache le compte Mihon du propriétaire choisi (sans doublon d'œuvre).
 * @param file - Fichier .tachibk.
 * @param options - Propriétaire Mihon obligatoire.
 * @param onProgress - Callback de progression.
 */
export async function importMihonBackupFile(
  file: File,
  options: MihonBackupImportOptions,
  onProgress?: (progress: MihonImportProgress) => void,
): Promise<MihonImportResult> {
  const mihonOwnerId = options.mihonOwnerId?.trim();
  if (!mihonOwnerId) {
    throw new Error("Choisissez le propriétaire du compte Mihon avant l'import.");
  }

  onProgress?.({
    total: 0,
    current: 0,
    created: 0,
    attached: 0,
    ownershipAdded: 0,
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
    attached: 0,
    ownershipAdded: 0,
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
  const catalogMap = await fetchLocalMihonCatalogWorkMap();
  const ignoreIndex = buildMihonIgnoreIndex(await fetchMihonIgnoredEntries());
  /** Titres normalisés → workId (batch + rapprochements locaux). */
  const titleMap = new Map<string, string>();

  const emit = (current: number, item: string) => {
    onProgress?.({
      total,
      current,
      created: result.created,
      attached: result.attached,
      ownershipAdded: result.ownershipAdded,
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

      const source = entry.sourceId
        ? sourceMap.get(entry.sourceId) ?? null
        : null;
      const catalogUrl = buildMihonCatalogUrl(
        source?.sourceBaseUrl,
        entry.sourcePath,
      );
      if (catalogUrl) result.withCatalogUrl += 1;

      const catalogKey = entry.sourceId?.trim()
        ? buildMihonCatalogKey(
            entry.sourceId,
            catalogUrl,
            entry.sourcePath,
          )
        : null;

      // Série explicitement ignorée dans le sas → ne pas réinjecter.
      if (
        matchesMihonIgnoreIndex(ignoreIndex, {
          malId: entry.malId,
          anilistId: entry.anilistId,
          catalogKey,
          title: entry.title,
        })
      ) {
        result.skipped += 1;
        result.details.push({
          title: entry.title,
          reason: "Ignorée dans le sas Mihon",
          kind: "skip",
        });
        continue;
      }

      // Même source + même manga Mihon déjà connu → ownership seulement (pas de doublon).
      if (catalogKey) {
        const existingByCatalog = catalogMap.get(catalogKey);
        if (existingByCatalog) {
          await recordOwnershipOnWork(
            existingByCatalog,
            mihonOwnerId,
            entry.title,
            "Source Mihon déjà présente",
            result,
          );
          continue;
        }
      }

      // MAL déjà en biblio / sas → rattacher la source au groupe.
      if (entry.malId && malMap.has(entry.malId)) {
        await attachSourceToWork(
          malMap.get(entry.malId)!,
          entry,
          source,
          catalogUrl,
          catalogMap,
          `Rattaché via MAL ${entry.malId}`,
          result,
          mihonOwnerId,
        );
        continue;
      }
      if (entry.anilistId && anilistMap.has(entry.anilistId)) {
        await attachSourceToWork(
          anilistMap.get(entry.anilistId)!,
          entry,
          source,
          catalogUrl,
          catalogMap,
          `Rattaché via AniList ${entry.anilistId}`,
          result,
          mihonOwnerId,
        );
        continue;
      }

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

      const form = buildFormFromEntry(
        entry,
        jikan,
        source,
        catalogUrl,
        mihonOwnerId,
      );
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

      // Doublon AniList / MAL découvert après résolution croisée.
      if (form.anilistId && anilistMap.has(form.anilistId)) {
        await attachSourceToWork(
          anilistMap.get(form.anilistId)!,
          entry,
          source,
          catalogUrl,
          catalogMap,
          `Rattaché via AniList ${form.anilistId}${
            entry.anilistId == null ? " (résolu)" : ""
          }`,
          result,
          mihonOwnerId,
        );
        continue;
      }
      if (form.malId && malMap.has(form.malId)) {
        await attachSourceToWork(
          malMap.get(form.malId)!,
          entry,
          source,
          catalogUrl,
          catalogMap,
          `Rattaché via MAL ${form.malId}${
            entry.malId == null ? " (résolu)" : ""
          }`,
          result,
          mihonOwnerId,
        );
        continue;
      }

      // Regroupement par titre exact normalisé (batch + biblio/sas).
      const titleKey = normalizeTitleForComparison(form.title);
      let titleWorkId = titleKey ? titleMap.get(titleKey) : undefined;
      if (!titleWorkId && titleKey) {
        const existingByTitle = await findWorkByTitle(form.title);
        if (existingByTitle) {
          titleWorkId = existingByTitle.id;
          titleMap.set(titleKey, titleWorkId);
          if (existingByTitle.mal_id != null) {
            malMap.set(Number(existingByTitle.mal_id), titleWorkId);
          }
          if (existingByTitle.anilist_id != null) {
            anilistMap.set(Number(existingByTitle.anilist_id), titleWorkId);
          }
        }
      }
      if (titleWorkId) {
        await attachSourceToWork(
          titleWorkId,
          entry,
          source,
          catalogUrl,
          catalogMap,
          "Rattaché via titre exact",
          result,
          mihonOwnerId,
        );
        continue;
      }

      // Re-check après résolution trackers (MAL/AniList découverts via Jikan).
      if (
        matchesMihonIgnoreIndex(ignoreIndex, {
          malId: form.malId,
          anilistId: form.anilistId,
          catalogKey,
          title: form.title,
        })
      ) {
        result.skipped += 1;
        result.details.push({
          title: entry.title,
          reason: "Ignorée dans le sas Mihon",
          kind: "skip",
        });
        continue;
      }

      const workId = await createWorkWithVolumes(form, {
        skipTitleUniqueness: true,
      });

      if (entry.sourceId?.trim()) {
        await attachWorkMihonSource(workId, {
          sourceId: entry.sourceId,
          sourceName: source?.sourceName ?? null,
          catalogUrl,
        });
        const catalogKey = buildMihonCatalogKey(
          entry.sourceId,
          catalogUrl,
          entry.sourcePath,
        );
        if (catalogKey) {
          catalogMap.set(catalogKey, workId);
        }
      }

      if (form.malId) malMap.set(form.malId, workId);
      if (form.anilistId) anilistMap.set(form.anilistId, workId);
      if (titleKey) titleMap.set(titleKey, workId);

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
