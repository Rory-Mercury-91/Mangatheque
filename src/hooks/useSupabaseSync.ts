import { useEffect, useRef } from "react";
import { registerSupabaseSyncListener } from "@/services/supabaseSyncHub";
import type { SyncReloadOptions } from "@/types/sync";

type SyncReloadFn = (options?: SyncReloadOptions) => void | Promise<void>;

/**
 * @description Recharge les données quand le hub catalogue synchronise
 * (auto 1 h / manuel / après écriture locale). Pas de Realtime ni poll agressif.
 * @param onReload - Callback de rafraîchissement (owners, works, etc.).
 */
export function useSupabaseSync(onReload: SyncReloadFn) {
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;

  useEffect(() => {
    return registerSupabaseSyncListener(() =>
      reloadRef.current({ silent: true }),
    );
  }, []);
}
