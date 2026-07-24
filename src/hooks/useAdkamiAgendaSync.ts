import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isTauriRuntime } from "@/lib/platform";
import {
  clearAdkamiAgendaLastError,
  getAdkamiAgendaLastSyncAt,
  isAdkamiWeekSynced,
  runAdkamiAgendaSync,
  setAdkamiAgendaLastError,
  type AdkamiAgendaSyncStats,
} from "@/services/adkamiAgendaSyncService";
import { startOfWeekMonday } from "@/utils/adkamiAgendaWeek";
import { resolveErrorMessage } from "@/utils/errorMessage";
import { scheduleIdleTask } from "@/utils/scheduleIdleTask";

/** Délai post-démarrage avant sync auto (laisse l'UI s'afficher). */
const BOOTSTRAP_SYNC_DELAY_MS = 3000;

const NON_TAURI_SYNC_MESSAGE =
  "La sync agenda ADKami nécessite l'application native (bureau ou mobile).";

export interface AdkamiAgendaSyncState {
  syncing: boolean;
  lastStats: AdkamiAgendaSyncStats | null;
  lastError: string | null;
  lastSyncedAt: string | null;
  /** Synchronise une semaine (défaut : courante). */
  syncNow: (weekMonday?: Date) => Promise<void>;
}

/**
 * @description Sync agenda ADKami à la demande (bouton, entrée planning, bootstrap différé).
 * Au lancement : une seule fois, après délai, sans bloquer le premier rendu.
 * @param onSynced - Callback après sync réussie.
 * @param options.auto - Si true, sync différée une fois au montage (session prête).
 */
export function useAdkamiAgendaSync(
  onSynced?: () => void,
  options?: { auto?: boolean },
): AdkamiAgendaSyncState {
  const auto = options?.auto !== false;
  const { session, loading: authLoading } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastStats, setLastStats] = useState<AdkamiAgendaSyncStats | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    getAdkamiAgendaLastSyncAt(),
  );
  const syncingRef = useRef(false);
  const autoRanRef = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const syncNow = useCallback(
    async (weekMonday?: Date) => {
      if (!isTauriRuntime()) {
        setLastError(NON_TAURI_SYNC_MESSAGE);
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
        const stats = await runAdkamiAgendaSync(
          weekMonday ?? startOfWeekMonday(),
        );
        const syncedAt = new Date().toISOString();
        setLastSyncedAt(syncedAt);
        setLastStats(stats);
        clearAdkamiAgendaLastError();
        onSyncedRef.current?.();
      } catch (error) {
        const message = resolveErrorMessage(
          error,
          "Erreur de synchronisation agenda.",
        );
        setLastError(message);
        setAdkamiAgendaLastError(message);
        console.error("Sync agenda ADKami :", error);
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [session],
  );

  const syncNowRef = useRef(syncNow);
  syncNowRef.current = syncNow;

  useEffect(() => {
    if (!auto || !isTauriRuntime() || authLoading || !session) {
      return;
    }
    if (autoRanRef.current) return;
    autoRanRef.current = true;

    return scheduleIdleTask(() => {
      const monday = startOfWeekMonday();
      if (isAdkamiWeekSynced(monday)) return;
      void syncNowRef.current(monday);
    }, BOOTSTRAP_SYNC_DELAY_MS);
  }, [auto, authLoading, session?.user?.id]);

  return { syncing, lastStats, lastError, lastSyncedAt, syncNow };
}
