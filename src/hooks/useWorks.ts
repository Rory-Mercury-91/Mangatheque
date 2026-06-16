import { useState } from "react";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import { useStaleWhileRevalidate } from "@/hooks/useStaleWhileRevalidate";
import type { Work } from "@/types/database";
import type { SyncReloadOptions } from "@/types/sync";
import { LOCAL_CACHE_KEYS } from "@/services/localDataCache";
import { fetchWorks } from "@/services/workService";

/**
 * @description Charge la liste des œuvres avec fonction de rafraîchissement.
 * @returns Œuvres, chargement, erreur et `reload`.
 */
export function useWorks() {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useStaleWhileRevalidate({
    cacheKey: LOCAL_CACHE_KEYS.works,
    fetchFn: fetchWorks,
    setData: setWorks,
    setLoading,
    setError,
  });

  useSupabaseSync(reload);

  return {
    works,
    loading,
    error,
    reload: reload as (options?: SyncReloadOptions) => Promise<void>,
  };
}
