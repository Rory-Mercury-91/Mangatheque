import {
  deleteWorkDetailCacheEntry,
  listWorkDetailCacheIds,
  readWorkDetailCacheEntry,
  writeWorkDetailCacheEntry,
} from "@/services/localDataCache";
import { fetchWorkFinancials } from "@/services/financialService";
import { fetchWorkFavoritesByWork } from "@/services/workFavoriteService";
import { fetchWorkForEdit } from "@/services/workService";
import type { SeriesFinancials, Work } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";

/** Entrée persistée pour affichage instantané d'une fiche série. */
export interface WorkDetailCacheEntry {
  workId: string;
  workUpdatedAt: string;
  volumeSignature: string;
  work: Work;
  volumes: VolumeFormRow[];
  financials: SeriesFinancials | null;
  favoriteOwnerIds: string[];
  savedAt: number;
}

const PREFETCH_CONCURRENCY = 3;

/**
 * @description Signature légère des tomes pour invalider le cache si la liste change.
 * @param volumes - Tomes de la série.
 */
export function buildWorkDetailVolumeSignature(
  volumes: VolumeFormRow[],
): string {
  const ids = volumes
    .map((volume) => volume.id ?? "new")
    .sort()
    .join(",");
  return `${volumes.length}:${ids}`;
}

/**
 * @description Charge une fiche depuis le cache local si encore valide.
 * @param workId - Identifiant de la série.
 * @param workUpdatedAt - Horodatage `works.updated_at` attendu (optionnel).
 */
export async function readWorkDetailCache(
  workId: string,
  workUpdatedAt?: string,
): Promise<WorkDetailCacheEntry | null> {
  const entry = await readWorkDetailCacheEntry<WorkDetailCacheEntry>(workId);
  if (!entry) {
    return null;
  }

  if (workUpdatedAt && entry.workUpdatedAt !== workUpdatedAt) {
    return null;
  }

  return entry;
}

/**
 * @description Persiste une fiche série complète en cache.
 */
export async function writeWorkDetailCache(
  data: Omit<WorkDetailCacheEntry, "savedAt" | "volumeSignature" | "workUpdatedAt"> & {
    work: Work;
    volumes: VolumeFormRow[];
  },
): Promise<void> {
  await writeWorkDetailCacheEntry({
    workId: data.workId,
    workUpdatedAt: data.work.updated_at,
    volumeSignature: buildWorkDetailVolumeSignature(data.volumes),
    work: data.work,
    volumes: data.volumes,
    financials: data.financials,
    favoriteOwnerIds: data.favoriteOwnerIds,
    savedAt: Date.now(),
  });
}

/**
 * @description Charge et met en cache une fiche série.
 * @param workId - Identifiant de la série.
 */
export async function fetchAndCacheWorkDetail(
  workId: string,
): Promise<WorkDetailCacheEntry> {
  const [data, financials, favoritesByWork] = await Promise.all([
    fetchWorkForEdit(workId),
    fetchWorkFinancials(workId),
    fetchWorkFavoritesByWork(),
  ]);

  const entry: WorkDetailCacheEntry = {
    workId,
    workUpdatedAt: data.work.updated_at,
    volumeSignature: buildWorkDetailVolumeSignature(data.volumes),
    work: data.work,
    volumes: data.volumes,
    financials,
    favoriteOwnerIds: favoritesByWork.get(workId) ?? [],
    savedAt: Date.now(),
  };

  await writeWorkDetailCacheEntry(entry);
  return entry;
}

/**
 * @description Précharge plusieurs fiches en arrière-plan (pages bibliothèque).
 * @param targets - Séries à précharger (id + horodatage pour éviter les requêtes inutiles).
 */
export async function prefetchWorkDetails(
  targets: Array<{ id: string; updatedAt: string }>,
): Promise<void> {
  const uniqueTargets = [
    ...new Map(targets.map((target) => [target.id, target])).values(),
  ];
  if (uniqueTargets.length === 0) {
    return;
  }

  let index = 0;

  async function worker(): Promise<void> {
    while (index < uniqueTargets.length) {
      const target = uniqueTargets[index];
      index += 1;

      try {
        const cached = await readWorkDetailCache(target.id, target.updatedAt);
        if (cached) {
          continue;
        }

        await fetchAndCacheWorkDetail(target.id);
      } catch (error) {
        console.warn(`Préchargement fiche « ${target.id} » ignoré :`, error);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PREFETCH_CONCURRENCY, uniqueTargets.length) },
      () => worker(),
    ),
  );
}

/**
 * @description Retire les fiches obsolètes ou supprimées de l'index cache.
 * @param works - Liste actuelle des séries.
 */
export async function pruneWorkDetailCache(works: Work[]): Promise<void> {
  const workById = new Map(works.map((work) => [work.id, work]));
  const cachedIds = await listWorkDetailCacheIds();

  await Promise.all(
    cachedIds.map(async (workId) => {
      const work = workById.get(workId);
      if (!work) {
        await deleteWorkDetailCacheEntry(workId);
        return;
      }

      const entry = await readWorkDetailCacheEntry<WorkDetailCacheEntry>(workId);
      if (entry && entry.workUpdatedAt !== work.updated_at) {
        await deleteWorkDetailCacheEntry(workId);
      }
    }),
  );
}
