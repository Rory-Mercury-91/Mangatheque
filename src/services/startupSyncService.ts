import { isDesktopRuntime } from "@/lib/platform";
import { refreshMihonSourceIndex } from "@/services/mihon/mihonSourceIndexService";
import { runPlanningSync } from "@/services/planningSyncService";
import {
  isTrackerSyncBusy,
  runExclusiveTrackerSync,
  TrackerSyncBusyError,
} from "@/services/tracker/trackerAutoSync";
import { syncAllAnimesFromMal } from "@/services/tracker/animeSyncService";
import { syncAllWorksFromTracker } from "@/services/tracker/trackerSyncService";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";

/** Délai après Dashboard prêt avant lancement de la séquence. */
export const STARTUP_SYNC_DELAY_MS = 20_000;

/** Fenêtre 4 h pour lecture MAL / AniList / anime MAL. */
export const STARTUP_SYNC_4H_MS = 4 * 60 * 60 * 1000;

/** Fenêtre 24 h pour sorties Nautiljon et index Mihon. */
export const STARTUP_SYNC_24H_MS = 24 * 60 * 60 * 1000;

const STORAGE_KEYS = {
  nautiljon: "mangatheque_planning_sync_last_at",
  mihonIndex: "mangatheque.startupSync.mihonIndex.lastAt",
  malManga: "mangatheque.startupSync.malManga.lastAt",
  anilistManga: "mangatheque.startupSync.anilistManga.lastAt",
  malAnime: "mangatheque.startupSync.malAnime.lastAt",
} as const;

export type StartupSyncStepId =
  | "nautiljon"
  | "mihonIndex"
  | "malManga"
  | "anilistManga"
  | "malAnime";

export type StartupSyncStepStatus =
  | "pending"
  | "running"
  | "done"
  | "skipped"
  | "error";

export interface StartupSyncStepState {
  id: StartupSyncStepId;
  label: string;
  status: StartupSyncStepStatus;
  detail: string | null;
}

export interface StartupSyncProgress {
  steps: StartupSyncStepState[];
  currentId: StartupSyncStepId | null;
  finished: boolean;
}

type ProgressListener = (progress: StartupSyncProgress) => void;

const STEP_DEFS: Array<{ id: StartupSyncStepId; label: string }> = [
  { id: "nautiljon", label: "Sorties Nautiljon" },
  { id: "mihonIndex", label: "Index Mihon" },
  { id: "malManga", label: "Lecture MAL" },
  { id: "anilistManga", label: "Lecture AniList" },
  { id: "malAnime", label: "Anime MAL" },
];

let pipelineRunning = false;
const progressListeners = new Set<ProgressListener>();

/**
 * @description True si la séquence de démarrage tourne déjà.
 */
export function isStartupSyncRunning(): boolean {
  return pipelineRunning;
}

/**
 * @description S'abonne à la progression de la séquence de démarrage.
 */
export function subscribeStartupSyncProgress(
  listener: ProgressListener,
): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitProgress(progress: StartupSyncProgress): void {
  for (const listener of progressListeners) {
    listener(progress);
  }
}

function readLastAt(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLastAt(key: string): void {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    /* stockage indisponible */
  }
}

/**
 * @description True si la dernière exécution auto est encore dans la fenêtre.
 */
export function isStartupStepDue(key: string, intervalMs: number): boolean {
  const last = readLastAt(key);
  if (!last) return true;
  const ms = Date.parse(last);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms >= intervalMs;
}

function formatRemaining(key: string, intervalMs: number): string {
  const last = readLastAt(key);
  if (!last) return "déjà exécuté récemment";
  const ms = Date.parse(last);
  if (!Number.isFinite(ms)) return "déjà exécuté récemment";
  const remaining = Math.max(0, intervalMs - (Date.now() - ms));
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours >= 24) {
    const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
    return `déjà exécuté il y a moins de ${days > 1 ? `${days} j` : "24 h"}`;
  }
  if (hours <= 1) return "déjà exécuté il y a moins d'1 h";
  return `déjà exécuté il y a moins de ${hours} h`;
}

function initialSteps(): StartupSyncStepState[] {
  return STEP_DEFS.map((step) => ({
    id: step.id,
    label: step.label,
    status: "pending",
    detail: null,
  }));
}

/**
 * @description Exécute la pipeline de sync auto au démarrage (skip + notifications).
 * Ne met à jour les compteurs d'intervalle que pour les étapes réellement exécutées.
 * Bloque toute sync manuelle pendant toute la durée (verrou exclusif).
 */
export async function runStartupSyncPipeline(
  onProgress?: ProgressListener,
): Promise<StartupSyncProgress> {
  if (pipelineRunning || isTrackerSyncBusy()) {
    throw new TrackerSyncBusyError(
      "Une synchronisation est déjà en cours.",
    );
  }

  pipelineRunning = true;
  const steps = initialSteps();
  let currentId: StartupSyncStepId | null = null;

  const publish = (finished = false) => {
    const progress: StartupSyncProgress = {
      steps: steps.map((s) => ({ ...s })),
      currentId,
      finished,
    };
    emitProgress(progress);
    onProgress?.(progress);
  };

  const setStep = (
    id: StartupSyncStepId,
    status: StartupSyncStepStatus,
    detail: string | null = null,
  ) => {
    const row = steps.find((s) => s.id === id);
    if (!row) return;
    row.status = status;
    row.detail = detail;
    currentId = status === "running" ? id : currentId;
    publish(false);
  };

  try {
    return await runExclusiveTrackerSync(async () => {
      publish(false);

      // Étape 1 — Sorties Nautiljon (desktop only, 1×/24 h)
      if (!isDesktopRuntime()) {
        setStep(
          "nautiljon",
          "skipped",
          "Disponible uniquement sur l'application bureau.",
        );
      } else if (
        !isStartupStepDue(STORAGE_KEYS.nautiljon, STARTUP_SYNC_24H_MS)
      ) {
        setStep(
          "nautiljon",
          "skipped",
          formatRemaining(STORAGE_KEYS.nautiljon, STARTUP_SYNC_24H_MS),
        );
      } else {
        setStep("nautiljon", "running", "Synchronisation…");
        try {
          const stats = await runPlanningSync();
          writeLastAt(STORAGE_KEYS.nautiljon);
          const changed = stats.created + stats.updated;
          setStep(
            "nautiljon",
            "done",
            `${stats.matched} correspondance${stats.matched > 1 ? "s" : ""} · ${changed} mise${changed > 1 ? "s" : ""} à jour.`,
          );
        } catch (err) {
          setStep(
            "nautiljon",
            "error",
            err instanceof Error ? err.message : "Échec sync Nautiljon.",
          );
        }
      }

      // Étape 2 — Index Mihon (1×/24 h)
      if (!isStartupStepDue(STORAGE_KEYS.mihonIndex, STARTUP_SYNC_24H_MS)) {
        setStep(
          "mihonIndex",
          "skipped",
          formatRemaining(STORAGE_KEYS.mihonIndex, STARTUP_SYNC_24H_MS),
        );
      } else {
        setStep("mihonIndex", "running", "Téléchargement Keiyoushi…");
        try {
          const { imported } = await refreshMihonSourceIndex();
          writeLastAt(STORAGE_KEYS.mihonIndex);
          setStep(
            "mihonIndex",
            "done",
            `${imported} source${imported > 1 ? "s" : ""} indexée${imported > 1 ? "s" : ""}.`,
          );
        } catch (err) {
          setStep(
            "mihonIndex",
            "error",
            err instanceof Error ? err.message : "Échec index Mihon.",
          );
        }
      }

      // Étape 3 — Lecture MAL (1×/4 h)
      const malToken = await fetchTrackerAccessToken("mal");
      if (!malToken) {
        setStep("malManga", "skipped", "Compte MyAnimeList non lié.");
      } else if (!isStartupStepDue(STORAGE_KEYS.malManga, STARTUP_SYNC_4H_MS)) {
        setStep(
          "malManga",
          "skipped",
          formatRemaining(STORAGE_KEYS.malManga, STARTUP_SYNC_4H_MS),
        );
      } else {
        setStep("malManga", "running", "Sync manga MAL…");
        try {
          const results = await syncAllWorksFromTracker("mal");
          writeLastAt(STORAGE_KEYS.malManga);
          const updated = results.filter(
            (row) =>
              row.chaptersApplied != null || row.volumesApplied != null,
          ).length;
          setStep(
            "malManga",
            "done",
            `${updated} série${updated > 1 ? "s" : ""} mise${updated > 1 ? "s" : ""} à jour.`,
          );
        } catch (err) {
          setStep(
            "malManga",
            "error",
            err instanceof Error ? err.message : "Échec lecture MAL.",
          );
        }
      }

      // Étape 4 — Lecture AniList (1×/4 h)
      const anilistToken = await fetchTrackerAccessToken("anilist");
      if (!anilistToken) {
        setStep("anilistManga", "skipped", "Compte AniList non lié.");
      } else if (
        !isStartupStepDue(STORAGE_KEYS.anilistManga, STARTUP_SYNC_4H_MS)
      ) {
        setStep(
          "anilistManga",
          "skipped",
          formatRemaining(STORAGE_KEYS.anilistManga, STARTUP_SYNC_4H_MS),
        );
      } else {
        setStep("anilistManga", "running", "Sync manga AniList…");
        try {
          const results = await syncAllWorksFromTracker("anilist");
          writeLastAt(STORAGE_KEYS.anilistManga);
          const updated = results.filter(
            (row) =>
              row.chaptersApplied != null || row.volumesApplied != null,
          ).length;
          setStep(
            "anilistManga",
            "done",
            `${updated} série${updated > 1 ? "s" : ""} mise${updated > 1 ? "s" : ""} à jour.`,
          );
        } catch (err) {
          setStep(
            "anilistManga",
            "error",
            err instanceof Error ? err.message : "Échec lecture AniList.",
          );
        }
      }

      // Étape 5 — Anime MAL (1×/4 h)
      if (!malToken) {
        setStep("malAnime", "skipped", "Compte MyAnimeList non lié.");
      } else if (!isStartupStepDue(STORAGE_KEYS.malAnime, STARTUP_SYNC_4H_MS)) {
        setStep(
          "malAnime",
          "skipped",
          formatRemaining(STORAGE_KEYS.malAnime, STARTUP_SYNC_4H_MS),
        );
      } else {
        setStep("malAnime", "running", "Sync anime MAL…");
        try {
          const results = await syncAllAnimesFromMal();
          writeLastAt(STORAGE_KEYS.malAnime);
          const updated = results.filter(
            (row) => row.created || row.episodesApplied != null,
          ).length;
          setStep(
            "malAnime",
            "done",
            `${updated} fiche${updated > 1 ? "s" : ""} / suivi${updated > 1 ? "s" : ""} mis à jour.`,
          );
        } catch (err) {
          setStep(
            "malAnime",
            "error",
            err instanceof Error ? err.message : "Échec anime MAL.",
          );
        }
      }

      currentId = null;
      const finalProgress: StartupSyncProgress = {
        steps: steps.map((s) => ({ ...s })),
        currentId: null,
        finished: true,
      };
      emitProgress(finalProgress);
      onProgress?.(finalProgress);
      return finalProgress;
    });
  } finally {
    pipelineRunning = false;
  }
}
