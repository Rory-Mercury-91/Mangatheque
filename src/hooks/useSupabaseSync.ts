import { useEffect, useRef } from "react";
import { registerSupabaseSyncListener } from "@/services/supabaseSyncHub";

/**
 * @description Recharge les données quand Supabase ou le focus fenêtre signalent un changement.
 * @param onReload - Callback de rafraîchissement (owners, works, etc.).
 */
export function useSupabaseSync(onReload: () => void | Promise<void>) {
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;

  useEffect(() => {
    return registerSupabaseSyncListener(() => reloadRef.current());
  }, []);
}
