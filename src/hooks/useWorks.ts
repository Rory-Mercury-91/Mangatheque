import { useCallback, useEffect, useState } from "react";
import type { Work } from "@/types/database";
import { fetchWorks } from "@/services/workService";

/**
 * @description Charge la liste des œuvres avec fonction de rafraîchissement.
 * @returns Œuvres, chargement, erreur et `reload`.
 */
export function useWorks() {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorks(await fetchWorks());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { works, loading, error, reload };
}
