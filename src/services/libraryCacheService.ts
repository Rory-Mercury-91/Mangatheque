import {
  LOCAL_CACHE_KEYS,
  readLocalCache,
  writeLocalCache,
} from "@/services/localDataCache";
import type {
  LibraryUserReadingMeta,
  LibraryWorkMeta,
} from "@/types/libraryFilters";

/** Snapshot sérialisable des métadonnées bibliothèque. */
export interface LibraryCacheBundle {
  userId: string | null;
  worksSyncKey: string;
  metaByWork: Array<[string, LibraryWorkMeta]>;
  readingMetaByWork: Array<[string, LibraryUserReadingMeta]>;
  favoritesByWork: Array<[string, string[]]>;
  savedAt: number;
}

/**
 * @description Charge le bundle bibliothèque si la clé de sync correspond.
 */
export async function readLibraryCacheBundle(
  userId: string | null,
  worksSyncKey: string,
): Promise<LibraryCacheBundle | null> {
  const cached = await readLocalCache<LibraryCacheBundle>(
    LOCAL_CACHE_KEYS.libraryBundle,
  );

  if (!cached) {
    return null;
  }

  if (cached.worksSyncKey !== worksSyncKey) {
    return null;
  }

  if ((cached.userId ?? null) !== userId) {
    return null;
  }

  return cached;
}

/**
 * @description Persiste les métadonnées bibliothèque pour affichage instantané.
 */
export async function writeLibraryCacheBundle(
  userId: string | null,
  worksSyncKey: string,
  data: {
    metaByWork: Map<string, LibraryWorkMeta>;
    readingMetaByWork: Map<string, LibraryUserReadingMeta>;
    favoritesByWork: Map<string, string[]>;
  },
): Promise<void> {
  const bundle: LibraryCacheBundle = {
    userId,
    worksSyncKey,
    metaByWork: [...data.metaByWork.entries()],
    readingMetaByWork: [...data.readingMetaByWork.entries()],
    favoritesByWork: [...data.favoritesByWork.entries()],
    savedAt: Date.now(),
  };

  await writeLocalCache(LOCAL_CACHE_KEYS.libraryBundle, bundle);
}

/**
 * @description Reconstruit les maps depuis le bundle cache.
 */
export function libraryCacheBundleToMaps(bundle: LibraryCacheBundle): {
  metaByWork: Map<string, LibraryWorkMeta>;
  readingMetaByWork: Map<string, LibraryUserReadingMeta>;
  favoritesByWork: Map<string, string[]>;
} {
  return {
    metaByWork: new Map(bundle.metaByWork),
    readingMetaByWork: new Map(bundle.readingMetaByWork),
    favoritesByWork: new Map(bundle.favoritesByWork),
  };
}
