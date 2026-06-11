import { useEffect, useState } from "react";
import {
  checkSupabaseHealth,
  type SupabaseHealthStatus,
} from "@/services/supabaseHealthService";

/**
 * @description Hook qui vérifie au montage si Supabase répond et si la migration est appliquée.
 * @returns Statut de santé Supabase (chargement puis résultat).
 */
export function useSupabaseHealth(): SupabaseHealthStatus {
  const [status, setStatus] = useState<SupabaseHealthStatus>({
    state: "checking",
  });

  useEffect(() => {
    let cancelled = false;

    void checkSupabaseHealth().then((result) => {
      if (!cancelled) {
        setStatus(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
