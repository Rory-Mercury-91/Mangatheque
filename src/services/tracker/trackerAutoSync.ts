import { fetchLinkedTrackerAccounts } from "@/services/tracker/trackerTokenService";
import { syncAllWorksFromTracker } from "@/services/tracker/trackerSyncService";
import type { TrackerProvider, TrackerSyncResult } from "@/types/tracker";

const SESSION_SYNC_KEY = "mangatheque:tracker:auto-sync-done";

/**
 * @description Synchronise tous les trackers liés au compte (MAL et/ou AniList).
 */
export async function syncAllLinkedTrackers(): Promise<{
  provider: TrackerProvider;
  results: TrackerSyncResult[];
}[]> {
  const accounts = await fetchLinkedTrackerAccounts();
  const synced: { provider: TrackerProvider; results: TrackerSyncResult[] }[] =
    [];

  for (const account of accounts) {
    const results = await syncAllWorksFromTracker(account.provider);
    synced.push({ provider: account.provider, results });
  }

  return synced;
}

/**
 * @description Sync auto une fois par session navigateur / WebView.
 * @returns Résumé ou null si déjà fait / aucun compte.
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
 * @description Force une sync immédiate pour un provider (après OAuth).
 */
export async function syncTrackerAfterOauth(
  provider: TrackerProvider,
): Promise<TrackerSyncResult[]> {
  try {
    sessionStorage.setItem(SESSION_SYNC_KEY, "1");
  } catch {
    /* ignore */
  }
  return syncAllWorksFromTracker(provider);
}
