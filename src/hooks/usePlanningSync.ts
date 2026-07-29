import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isDesktopRuntime, isMobileRuntime } from "@/lib/platform";
import { runPlanningSync, type PlanningSyncStats } from "@/services/planningSyncService";
import { resolveErrorMessage } from "@/utils/errorMessage";

const STORAGE_KEY = "mangatheque_planning_sync_last_at";

const MOBILE_SYNC_MESSAGE =
  "Synchronisez le planning Nautiljon depuis l'application bureau (Windows).";

export interface PlanningSyncState {
  syncing: boolean;
  lastStats: PlanningSyncStats | null;
  lastError: string | null;
  lastSyncedAt: string | null;
  syncNow: () => Promise<void>;
}

/**
 * @description Sync planning Nautiljon à la demande (desktop).
 * La sync auto au démarrage est gérée par `StartupSyncBootstrap`.
 * @param onSynced - Callback après une sync réussie (rafraîchir cloche, etc.).
 */
export function usePlanningSync(onSynced?: () => void): PlanningSyncState {
  const { session } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastStats, setLastStats] = useState<PlanningSyncStats | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const syncingRef = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const syncNow = useCallback(async () => {
    if (!isDesktopRuntime()) {
      setLastError(
        isMobileRuntime()
          ? MOBILE_SYNC_MESSAGE
          : "La sync planning nécessite l'application bureau.",
      );
      return;
    }
    if (!session) {
      setLastError("Session expirée — reconnectez-vous pour synchroniser.");
      return;
    }
    if (syncingRef.current) return;

    syncingRef.current = true;
    setSyncing(true);
    setLastError(null);

    try {
      const stats = await runPlanningSync();
      // Ne pas écrire STORAGE_KEY : les déclenchements manuels
      // n'impactent pas les compteurs d'intervalle automatique.
      setLastSyncedAt(localStorage.getItem(STORAGE_KEY));
      setLastStats(stats);
      onSyncedRef.current?.();
    } catch (error) {
      const message = resolveErrorMessage(
        error,
        "Erreur de synchronisation inconnue.",
      );
      setLastError(message);
      console.error("Sync planning :", error);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [session]);

  return {
    syncing,
    lastStats,
    lastError,
    lastSyncedAt,
    syncNow,
  };
}
