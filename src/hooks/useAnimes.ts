import { useState } from "react";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import { useStaleWhileRevalidate } from "@/hooks/useStaleWhileRevalidate";
import type { Anime } from "@/types/anime";
import type { SyncReloadOptions } from "@/types/sync";
import { LOCAL_CACHE_KEYS } from "@/services/localDataCache";
import { fetchAnimes } from "@/services/animeService";

/**
 * @description Charge la liste des animés avec rafraîchissement.
 */
export function useAnimes() {
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useStaleWhileRevalidate({
    cacheKey: LOCAL_CACHE_KEYS.animes,
    fetchFn: fetchAnimes,
    setData: setAnimes,
    setLoading,
    setError,
  });

  useSupabaseSync(reload);

  return {
    animes,
    loading,
    error,
    reload: reload as (options?: SyncReloadOptions) => Promise<void>,
  };
}
