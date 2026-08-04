import {
  LOCAL_CACHE_KEYS,
  readLocalCache,
  writeLocalCache,
} from "@/services/localDataCache";
import type { MihonIgnoredEntry } from "@/services/mihon/mihonIgnoreService";
import type { WorkMihonSource } from "@/services/mihon/workMihonSourceService";
import type { Work } from "@/types/database";

/** Snapshot sérialisable de la file sas Mihon. */
export interface MihonQueueCacheBundle {
  pending: Work[];
  sourcesByWorkId: Array<[string, WorkMihonSource[]]>;
  ignoredEntries: MihonIgnoredEntry[];
  savedAt: number;
}

/**
 * @description Lit le cache IndexedDB de la file sas Mihon.
 */
export async function readMihonQueueCache(): Promise<MihonQueueCacheBundle | null> {
  const cached = await readLocalCache<MihonQueueCacheBundle>(
    LOCAL_CACHE_KEYS.mihonQueue,
  );
  if (!cached || !Array.isArray(cached.pending)) {
    return null;
  }
  return cached;
}

/**
 * @description Persiste la file sas Mihon pour affichage instantané au retour.
 */
export async function writeMihonQueueCache(data: {
  pending: Work[];
  sourcesByWorkId: Map<string, WorkMihonSource[]>;
  ignoredEntries: MihonIgnoredEntry[];
}): Promise<void> {
  const bundle: MihonQueueCacheBundle = {
    pending: data.pending,
    sourcesByWorkId: [...data.sourcesByWorkId.entries()],
    ignoredEntries: data.ignoredEntries,
    savedAt: Date.now(),
  };
  await writeLocalCache(LOCAL_CACHE_KEYS.mihonQueue, bundle);
}

/**
 * @description Reconstruit la map des sources depuis le bundle cache.
 */
export function mihonQueueCacheToSourcesMap(
  bundle: MihonQueueCacheBundle,
): Map<string, WorkMihonSource[]> {
  return new Map(bundle.sourcesByWorkId ?? []);
}
