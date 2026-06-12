import { useCallback, useEffect, useState } from "react";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import type { Work } from "@/types/database";
import type { SyncReloadOptions } from "@/types/sync";
import { fetchWorks } from "@/services/workService";
import { setIfChanged } from "@/utils/stateSync";

/**
 * @description Charge la liste des œuvres avec fonction de rafraîchissement.
 * @returns Œuvres, chargement, erreur et `reload`.
 */export function useWorks() {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (options?: SyncReloadOptions) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      setIfChanged(setWorks, await fetchWorks());
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useSupabaseSync(reload);

  return { works, loading, error, reload };
}
