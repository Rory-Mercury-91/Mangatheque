import {
  fetchLinkedTrackerAccounts,
  fetchTrackerAccessToken,
} from "@/services/tracker/trackerTokenService";
import {
  syncAllWorksFromAllLinkedTrackers,
  syncAllWorksFromTracker,
} from "@/services/tracker/trackerSyncService";
import { syncAllAnimesFromMal } from "@/services/tracker/animeSyncService";
import type { TrackerProvider, TrackerSyncResult } from "@/types/tracker";

/** Intervalle minimum entre deux syncs auto au démarrage. */
export const TRACKER_AUTO_SYNC_MIN_INTERVAL_MS = 60 * 60 * 1000;

const LAST_AUTO_SYNC_KEY = "mangatheque.tracker.autoSync.lastAt";

let syncBusy = false;
const busyListeners = new Set<(busy: boolean) => void>();

/**
 * @description Erreur levée si une sync trackers est déjà en cours.
 */
export class TrackerSyncBusyError extends Error {
  constructor(message = "Une synchronisation trackers est déjà en cours.") {
    super(message);
    this.name = "TrackerSyncBusyError";
  }
}

/**
 * @description Indique si une sync manga/animé/globale est en cours.
 */
export function isTrackerSyncBusy(): boolean {
  return syncBusy;
}

/**
 * @description S'abonne aux changements du verrou de sync (pour griser les boutons UI).
 * @returns Fonction de désabonnement.
 */
export function subscribeTrackerSyncBusy(
  listener: (busy: boolean) => void,
): () => void {
  busyListeners.add(listener);
  listener(syncBusy);
  return () => {
    busyListeners.delete(listener);
  };
}

function setTrackerSyncBusy(next: boolean): void {
  if (syncBusy === next) return;
  syncBusy = next;
  for (const listener of busyListeners) {
    listener(syncBusy);
  }
}

/**
 * @description Horodatage ISO de la dernière sync auto réussie (localStorage).
 */
export function getTrackerAutoSyncLastAt(): string | null {
  try {
    return localStorage.getItem(LAST_AUTO_SYNC_KEY);
  } catch {
    return null;
  }
}

/**
 * @description Mémorise la fin d'une sync réussie (sert uniquement au cooldown de la sync auto).
 * Les syncs manuelles restent toujours autorisées.
 */
export function markTrackerSyncCompleted(): void {
  try {
    localStorage.setItem(LAST_AUTO_SYNC_KEY, new Date().toISOString());
  } catch {
    /* stockage indisponible */
  }
}

/**
 * @description True si le cooldown d'1 h autorise encore une sync auto au démarrage.
 */
export function isTrackerAutoSyncDue(): boolean {
  const last = getTrackerAutoSyncLastAt();
  if (!last) return true;
  const ms = Date.parse(last);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms >= TRACKER_AUTO_SYNC_MIN_INTERVAL_MS;
}

/**
 * @description Exécute une tâche de sync en exclusion mutuelle (pas de chevauchement).
 * Utilisé par la sync auto et manuelle : griser les boutons via `subscribeTrackerSyncBusy`.
 * @param task - Travail async (manga, anime, global…).
 * @throws TrackerSyncBusyError si une autre sync tourne déjà.
 */
export async function runExclusiveTrackerSync<T>(
  task: () => Promise<T>,
): Promise<T> {
  if (syncBusy) {
    throw new TrackerSyncBusyError();
  }
  setTrackerSyncBusy(true);
  try {
    return await task();
  } finally {
    setTrackerSyncBusy(false);
  }
}

/**
 * @description Synchronise les trackers liés en fusionnant MAL + AniList (max progression).
 */
export async function syncAllLinkedTrackers(): Promise<
  {
    provider: TrackerProvider;
    results: TrackerSyncResult[];
  }[]
> {
  const accounts = await fetchLinkedTrackerAccounts();
  if (accounts.length === 0) {
    return [];
  }

  const results = await syncAllWorksFromAllLinkedTrackers();
  return [
    {
      provider: accounts[0]!.provider,
      results,
    },
  ];
}

/**
 * @description Sync auto manga (+ anime MAL) au démarrage : max 1× / heure, jamais si une sync tourne.
 */
export async function runTrackerAutoSyncOncePerSession(): Promise<{
  seriesUpdated: number;
  animesUpdated: number;
} | null> {
  if (isTrackerSyncBusy()) {
    console.info("Sync trackers auto ignorée : une sync est déjà en cours.");
    return null;
  }
  if (!isTrackerAutoSyncDue()) {
    console.info(
      "Sync trackers auto ignorée : dernière sync il y a moins d'une heure.",
    );
    return null;
  }

  const accounts = await fetchLinkedTrackerAccounts();
  if (accounts.length === 0) {
    return null;
  }

  return runExclusiveTrackerSync(async () => {
    const batches = await syncAllLinkedTrackers();
    let seriesUpdated = 0;
    for (const batch of batches) {
      seriesUpdated += batch.results.filter(
        (row) => row.chaptersApplied != null || row.volumesApplied != null,
      ).length;
    }

    let animesUpdated = 0;
    const malToken = await fetchTrackerAccessToken("mal");
    if (malToken) {
      try {
        const animeResults = await syncAllAnimesFromMal();
        animesUpdated = animeResults.filter(
          (row) => row.created || row.episodesApplied != null,
        ).length;
      } catch (error) {
        console.warn("Sync anime MAL auto impossible :", error);
      }
    }

    markTrackerSyncCompleted();
    return { seriesUpdated, animesUpdated };
  });
}

/**
 * @description Force une sync immédiate pour un provider (après OAuth),
 * puis fusionne avec l'autre tracker s'il est aussi lié.
 */
export async function syncTrackerAfterOauth(
  provider: TrackerProvider,
): Promise<TrackerSyncResult[]> {
  return runExclusiveTrackerSync(async () => {
    const accounts = await fetchLinkedTrackerAccounts();
    const results =
      accounts.length > 1
        ? await syncAllWorksFromAllLinkedTrackers()
        : await syncAllWorksFromTracker(provider);

    if (provider === "mal") {
      try {
        await syncAllAnimesFromMal();
      } catch (error) {
        console.warn("Sync anime MAL après OAuth impossible :", error);
      }
    }

    markTrackerSyncCompleted();
    return results;
  });
}
