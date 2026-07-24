import { useSyncExternalStore } from "react";
import {
  isTrackerSyncBusy,
  subscribeTrackerSyncBusy,
} from "@/services/tracker/trackerAutoSync";

/**
 * @description Suit le verrou global de sync trackers (auto ou manuelle).
 * Sert à griser les boutons Sync sans bloquer le cooldown d'1 h (réservé à l'auto).
 */
export function useTrackerSyncBusy(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeTrackerSyncBusy(() => onStoreChange()),
    isTrackerSyncBusy,
    () => false,
  );
}
