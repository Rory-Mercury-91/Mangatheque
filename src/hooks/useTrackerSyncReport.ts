import { useCallback, useSyncExternalStore } from "react";
import {
  closeTrackerSyncReportModal,
  getTrackerSyncReport,
  isTrackerSyncReportModalOpen,
  openTrackerSyncReportModal,
  subscribeTrackerSyncReport,
} from "@/services/tracker/trackerSyncReportStore";

/**
 * @description Suit le dernier rapport de sync manga et l'ouverture de la modale.
 */
export function useTrackerSyncReport() {
  const report = useSyncExternalStore(
    subscribeTrackerSyncReport,
    getTrackerSyncReport,
    () => null,
  );
  const modalOpen = useSyncExternalStore(
    subscribeTrackerSyncReport,
    isTrackerSyncReportModalOpen,
    () => false,
  );

  const open = useCallback(() => {
    openTrackerSyncReportModal();
  }, []);

  const close = useCallback(() => {
    closeTrackerSyncReportModal();
  }, []);

  return {
    report,
    modalOpen,
    conflictCount: report?.conflicts.length ?? 0,
    open,
    close,
  };
}
