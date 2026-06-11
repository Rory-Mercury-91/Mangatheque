import { useEffect, useState } from "react";
import type { Owner } from "@/types/database";
import { fetchOwners } from "@/services/ownerService";

/**
 * @description Charge les propriétaires du foyer au montage.
 * @returns Liste, état de chargement et erreur éventuelle.
 */
export function useOwners() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setOwners(await fetchOwners());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return { owners, loading, error, reload };
}
