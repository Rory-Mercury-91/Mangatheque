import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SyncReloadOptions } from "@/types/sync";
import {
  LOCAL_CACHE_KEYS,
  readLocalCache,
  writeLocalCache,
} from "@/services/localDataCache";
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
 * @description Charge depuis le cache local puis revalide en arrière-plan (SWR).
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
      } catch (err) {
        if (!silent && !hydrated) {
          setError(err instanceof Error ? err.message : "Erreur inconnue.");
        }
      } finally {
        if (!silent && !hydrated) {
          setLoading(false);
        }
      }
    },
    [cacheKey, initialLoading, setData, setError, setLoading],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return reload;
}
