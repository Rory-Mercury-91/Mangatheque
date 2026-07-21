import { fetchLinkedTrackerAccounts } from "@/services/tracker/trackerTokenService";
import {
  syncAllWorksFromAllLinkedTrackers,
  syncAllWorksFromTracker,
} from "@/services/tracker/trackerSyncService";
import type { TrackerProvider, TrackerSyncResult } from "@/types/tracker";

const SESSION_SYNC_KEY = "mangatheque:tracker:auto-sync-done";

/**
 * @description Synchronise les trackers liés en fusionnant MAL + AniList (max progression).
 */
export async function syncAllLinkedTrackers(): Promise<{
  provider: TrackerProvider;
  results: TrackerSyncResult[];
}[]> {
  const accounts = await fetchLinkedTrackerAccounts();
  if (accounts.length === 0) {
    return [];
  }

  // Une seule passe fusionnée : évite qu'un provider écrase l'autre
  const results = await syncAllWorksFromAllLinkedTrackers();
  return [
    {
      provider: accounts[0]!.provider,
      results,
    },
  ];
}

/**
 * @description Sync auto une fois par session navigateur / WebView.
 */
export async function runTrackerAutoSyncOncePerSession(): Promise<{
  seriesUpdated: number;
} | null> {
  try {
    if (sessionStorage.getItem(SESSION_SYNC_KEY) === "1") {
      return null;
    }
  } catch {
    /* stockage indisponible */
  }

  const accounts = await fetchLinkedTrackerAccounts();
  if (accounts.length === 0) {
    return null;
  }

  try {
    sessionStorage.setItem(SESSION_SYNC_KEY, "1");
  } catch {
    /* ignore */
  }

  const batches = await syncAllLinkedTrackers();
  let seriesUpdated = 0;
  for (const batch of batches) {
    seriesUpdated += batch.results.filter(
      (row) => row.chaptersApplied != null || row.volumesApplied != null,
    ).length;
  }

  return { seriesUpdated };
}

/**
 * @description Force une sync immédiate pour un provider (après OAuth),
 * puis fusionne avec l'autre tracker s'il est aussi lié.
 */
export async function syncTrackerAfterOauth(
  provider: TrackerProvider,
): Promise<TrackerSyncResult[]> {
  try {
    sessionStorage.setItem(SESSION_SYNC_KEY, "1");
  } catch {
    /* ignore */
  }

  const accounts = await fetchLinkedTrackerAccounts();
  if (accounts.length > 1) {
    return syncAllWorksFromAllLinkedTrackers();
  }
  return syncAllWorksFromTracker(provider);
}
