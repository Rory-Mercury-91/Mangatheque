import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isDesktopRuntime, isMobileRuntime } from "@/lib/platform";
import { runPlanningSync, type PlanningSyncStats } from "@/services/planningSyncService";
import { resolveErrorMessage } from "@/utils/errorMessage";

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
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
 * @description Sync planning Nautiljon au lancement desktop (max 1×/24 h) et à la demande.
 * @param onSynced - Callback après une sync réussie (rafraîchir cloche, etc.).
 */
export function usePlanningSync(onSynced?: () => void): PlanningSyncState {
  const { session, loading: authLoading } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastStats, setLastStats] = useState<PlanningSyncStats | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const autoStarted = useRef(false);
  const syncingRef = useRef(false);

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
      const syncedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, syncedAt);
      setLastSyncedAt(syncedAt);
      setLastStats(stats);
      onSynced?.();
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
  }, [onSynced, session]);

  useEffect(() => {
    if (!isDesktopRuntime() || authLoading || !session || autoStarted.current) {
      return;
    }
    autoStarted.current = true;

    const last = localStorage.getItem(STORAGE_KEY);
    if (last && Date.now() - new Date(last).getTime() < SYNC_INTERVAL_MS) {
      return;
    }

    void syncNow();
  }, [authLoading, session, syncNow]);

  return {
    syncing,
    lastStats,
    lastError,
    lastSyncedAt,
    syncNow,
  };
}
