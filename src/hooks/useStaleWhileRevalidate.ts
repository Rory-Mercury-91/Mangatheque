import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SyncReloadOptions } from "@/types/sync";
import {
  LOCAL_CACHE_KEYS,
  readLocalCache,
  writeLocalCache,
} from "@/services/localDataCache";
import {
  isCatalogueCacheCurrent,
  markCatalogueCacheApplied,
} from "@/services/supabaseSyncHub";
import { setIfChanged } from "@/utils/stateSync";

type CacheKey = (typeof LOCAL_CACHE_KEYS)[keyof typeof LOCAL_CACHE_KEYS];

interface UseStaleWhileRevalidateOptions<T> {
  cacheKey: CacheKey;
  fetchFn: () => Promise<T>;
  setData: Dispatch<SetStateAction<T>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  initialLoading?: boolean;
}

/**
 * @description Hydrate depuis le cache local au montage. Fetch réseau seulement
 * s'il n'y a pas de cache (bootstrap) ou si une écriture locale / sync a invalidé
 * le cache pendant qu'écran était démonté ; sinon le hub catalogue (1 h / manuel)
 * s'en charge.
 */
export function useStaleWhileRevalidate<T>({
  cacheKey,
  fetchFn,
  setData,
  setLoading,
  setError,
  initialLoading = true,
}: UseStaleWhileRevalidateOptions<T>) {
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const reload = useCallback(
    async (options?: SyncReloadOptions) => {
      const silent = options?.silent ?? false;
      let hydrated = false;

      if (!silent) {
        const cached = await readLocalCache<T>(cacheKey);
        if (cached != null) {
          setData(cached);
          setLoading(false);
          hydrated = true;
        } else if (initialLoading) {
          setLoading(true);
        }
        setError(null);
      }

      try {
        const fresh = await fetchFnRef.current();
        setIfChanged(setData as Dispatch<SetStateAction<Awaited<T>>>, fresh);
        await writeLocalCache(cacheKey, fresh);
        markCatalogueCacheApplied(cacheKey);
      } catch (err) {
        if (!hydrated) {
          setError(err instanceof Error ? err.message : "Erreur inconnue.");
        }
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, initialLoading, setData, setError, setLoading],
  );

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cached = await readLocalCache<T>(cacheKey);
      if (cancelled) {
        return;
      }

      const cacheCurrent = isCatalogueCacheCurrent(cacheKey);

      if (cached != null && cacheCurrent) {
        setData(cached);
        setLoading(false);
        setError(null);
        // Cache présent et à jour : pas de réseau au montage / navigation.
        return;
      }

      if (cached != null) {
        // Écriture locale / sync pendant l'absence de l'écran : afficher le
        // cache puis refetch silencieux pour voir la nouveauté tout de suite.
        setData(cached);
        setLoading(false);
        setError(null);
        await reloadRef.current({ silent: true });
        return;
      }

      await reloadRef.current({ silent: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, setData, setError, setLoading]);

  return reload;
}
