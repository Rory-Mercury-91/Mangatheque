import { useEffect, useRef, useState } from "react";
import { StartupSyncModal } from "@/features/startup/StartupSyncModal";
import { useAuth } from "@/contexts/AuthContext";
import {
  isDashboardReady,
  notifyDashboardReady,
  onDashboardReady,
} from "@/services/dashboardReady";
import {
  isStartupSyncRunning,
  runStartupSyncPipeline,
  STARTUP_SYNC_DELAY_MS,
  type StartupSyncProgress,
} from "@/services/startupSyncService";
import { isTrackerSyncBusy } from "@/services/tracker/trackerAutoSync";
import { scheduleIdleTask } from "@/utils/scheduleIdleTask";

/** Si le Dashboard ne signale jamais prêt (navigation ailleurs), on démarre quand même. */
const DASHBOARD_READY_FALLBACK_MS = 60_000;

/**
 * @description Lance la sync auto 20 s après le Dashboard prêt, avec modale de suivi.
 */
export function StartupSyncBootstrap() {
  const { session, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<StartupSyncProgress | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (authLoading || !session?.user) {
      return;
    }
    if (startedRef.current) {
      return;
    }

    let delayCancel: (() => void) | undefined;
    let cancelled = false;

    const startPipeline = () => {
      if (cancelled || startedRef.current) return;
      if (isStartupSyncRunning() || isTrackerSyncBusy()) {
        console.info(
          "Sync démarrage ignorée : une synchronisation est déjà en cours.",
        );
        return;
      }
      startedRef.current = true;
      setOpen(true);
      void runStartupSyncPipeline(setProgress)
        .then((finalProgress) => {
          setProgress(finalProgress);
        })
        .catch((error) => {
          console.warn("Sync démarrage impossible :", error);
          setProgress({
            steps: [],
            currentId: null,
            finished: true,
          });
        });
    };

    const unsubReady = onDashboardReady(() => {
      delayCancel = scheduleIdleTask(startPipeline, STARTUP_SYNC_DELAY_MS);
    });

    const fallbackCancel = scheduleIdleTask(() => {
      if (!isDashboardReady()) {
        notifyDashboardReady();
      }
    }, DASHBOARD_READY_FALLBACK_MS);

    return () => {
      cancelled = true;
      unsubReady();
      delayCancel?.();
      fallbackCancel();
    };
  }, [authLoading, session?.user?.id]);

  return (
    <StartupSyncModal
      open={open}
      progress={progress}
      onClose={() => setOpen(false)}
    />
  );
}
