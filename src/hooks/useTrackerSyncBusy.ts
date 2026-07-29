import { useSyncExternalStore } from "react";
import {
  isTrackerSyncBusy,
  subscribeTrackerSyncBusy,
} from "@/services/tracker/trackerAutoSync";

/**
 * @description Suit le verrou global de sync (auto démarrage ou manuelle).
 * Sert à griser les boutons Sync sans toucher aux compteurs d'intervalle auto.
 */
export function useTrackerSyncBusy(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeTrackerSyncBusy(() => onStoreChange()),
    isTrackerSyncBusy,
    () => false,
  );
}
