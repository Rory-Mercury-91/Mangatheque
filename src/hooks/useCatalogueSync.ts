import { useCallback, useEffect, useState } from "react";
import {
  getCatalogueSyncStatus,
  requestManualCatalogueSync,
  subscribeCatalogueSyncStatus,
  type CatalogueSyncStatus,
} from "@/services/supabaseSyncHub";

/**
 * @description Statut de la sync catalogue (1 h / bouton manuel) pour l'UI.
 */
export function useCatalogueSync() {
  const [status, setStatus] = useState<CatalogueSyncStatus>(() =>
    getCatalogueSyncStatus(),
  );

  useEffect(() => subscribeCatalogueSyncStatus(setStatus), []);

  const syncNow = useCallback((): boolean => {
    return requestManualCatalogueSync();
  }, []);

  return {
    lastSyncAt: status.lastSyncAt,
    nextSyncAt: status.nextSyncAt,
    syncing: status.syncing,
    syncNow,
  };
}
