import { isDesktopRuntime } from "@/lib/platform";
import { refreshMihonSourceIndex } from "@/services/mihon/mihonSourceIndexService";
import { runPlanningSync } from "@/services/planningSyncService";
import {
  isTrackerSyncBusy,
  runExclusiveTrackerSync,
  TrackerSyncBusyError,
} from "@/services/tracker/trackerAutoSync";
import { syncGlobalTrackers } from "@/services/tracker/animeSyncService";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";

/** Délai après Dashboard prêt avant lancement de la séquence. */
export const STARTUP_SYNC_DELAY_MS = 20_000;

/** Fenêtre 4 h pour la sync trackers (même processus que sync globale). */
export const STARTUP_SYNC_4H_MS = 4 * 60 * 60 * 1000;

/** Fenêtre 24 h pour sorties Nautiljon et index Mihon. */
export const STARTUP_SYNC_24H_MS = 24 * 60 * 60 * 1000;

const STORAGE_KEYS = {
  nautiljon: "mangatheque_planning_sync_last_at",
  mihonIndex: "mangatheque.startupSync.mihonIndex.lastAt",
  /** Clé unique : même fenêtre que la sync globale manuelle. */
  trackersGlobal: "mangatheque.startupSync.trackersGlobal.lastAt",
} as const;

/** Anciennes clés (migration cooldown → une seule étape trackers). */
const LEGACY_TRACKER_KEYS = [
  "mangatheque.startupSync.malManga.lastAt",
  "mangatheque.startupSync.anilistManga.lastAt",
  "mangatheque.startupSync.malAnime.lastAt",
] as const;

export type StartupSyncStepId = "nautiljon" | "mihonIndex" | "trackersGlobal";

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
  /** Avancement interne (manga / anime). */
  progressCurrent?: number;
  progressTotal?: number;
  /** Phase loading = barre indéterminée. */
  progressPhase?: "loading" | "syncing" | "done";
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
  { id: "trackersGlobal", label: "Sync trackers" },
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
 * @description S'abonne à l'avancement de la pipeline de démarrage.
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

/**
 * @description Lit un horodatage localStorage.
 */
function readLastAt(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * @description Écrit l'horodatage de dernière exécution.
 */
function writeLastAt(key: string): void {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/**
 * @description True si l'étape est due (jamais faite ou fenêtre écoulée).
 */
function isStartupStepDue(key: string, windowMs: number): boolean {
  const last = readLastAt(key);
  if (!last) return true;
  const ms = Date.parse(last);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms >= windowMs;
}

/**
 * @description True si la sync trackers globale est due (clé unique + legacy).
 */
function isTrackersGlobalDue(): boolean {
  if (!isStartupStepDue(STORAGE_KEYS.trackersGlobal, STARTUP_SYNC_4H_MS)) {
    return false;
  }
  // Migration : si une ancienne étape a tourné récemment, reporter.
  let latestLegacyMs = 0;
  for (const key of LEGACY_TRACKER_KEYS) {
    const last = readLastAt(key);
    if (!last) continue;
    const ms = Date.parse(last);
    if (Number.isFinite(ms)) {
      latestLegacyMs = Math.max(latestLegacyMs, ms);
    }
  }
  if (latestLegacyMs <= 0) {
    return true;
  }
  return Date.now() - latestLegacyMs >= STARTUP_SYNC_4H_MS;
}

/**
 * @description Libellé « reste X » pour une étape skippée.
 */
function formatRemaining(key: string, windowMs: number): string {
  const last = readLastAt(key);
  if (!last) return "Déjà synchronisé récemment.";
  const ms = Date.parse(last);
  if (!Number.isFinite(ms)) return "Déjà synchronisé récemment.";
  const remaining = Math.max(0, windowMs - (Date.now() - ms));
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours <= 1) {
    return "Prochaine sync dans moins d'une heure.";
  }
  return `Prochaine sync dans ~${hours} h.`;
}

/**
 * @description Libellé skip pour la sync trackers (clé unique ou legacy).
 */
function formatTrackersRemaining(): string {
  const primary = readLastAt(STORAGE_KEYS.trackersGlobal);
  if (primary) {
    return formatRemaining(STORAGE_KEYS.trackersGlobal, STARTUP_SYNC_4H_MS);
  }
  let latestKey: string | null = null;
  let latestMs = 0;
  for (const key of LEGACY_TRACKER_KEYS) {
    const last = readLastAt(key);
    if (!last) continue;
    const ms = Date.parse(last);
    if (Number.isFinite(ms) && ms >= latestMs) {
      latestMs = ms;
      latestKey = key;
    }
  }
  if (latestKey) {
    return formatRemaining(latestKey, STARTUP_SYNC_4H_MS);
  }
  return "Déjà synchronisé récemment.";
}

function initialSteps(): StartupSyncStepState[] {
  return STEP_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    status: "pending",
    detail: null,
  }));
}

/**
 * @description Exécute la pipeline de sync auto au démarrage (skip + notifications).
 * Ne met à jour les compteurs d'intervalle que pour les étapes réellement exécutées.
 * Bloque toute sync manuelle pendant toute la durée (verrou exclusif).
 * La sync trackers = même processus que le bouton « Sync globale ».
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
    if (status !== "running") {
      row.progressCurrent = undefined;
      row.progressTotal = undefined;
      row.progressPhase = undefined;
    }
    currentId = status === "running" ? id : currentId;
    publish(false);
  };

  const setStepTrackerProgress = (progress: {
    current: number;
    total: number;
    label: string;
    phase?: "loading" | "syncing" | "done";
  }) => {
    const row = steps.find((s) => s.id === "trackersGlobal");
    if (!row || row.status !== "running") return;
    row.progressCurrent = progress.current;
    row.progressTotal = progress.total;
    row.progressPhase = progress.phase ?? "syncing";
    row.detail =
      progress.total > 0
        ? `${progress.current}/${progress.total} · ${progress.label}`
        : progress.label;
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

      // Étape 3 — Sync trackers = même processus que sync globale (1×/4 h)
      const malToken = await fetchTrackerAccessToken("mal");
      const anilistToken = await fetchTrackerAccessToken("anilist");
      if (!malToken && !anilistToken) {
        setStep(
          "trackersGlobal",
          "skipped",
          "Aucun compte tracker lié.",
        );
      } else if (!isTrackersGlobalDue()) {
        setStep(
          "trackersGlobal",
          "skipped",
          formatTrackersRemaining(),
        );
      } else {
        setStep("trackersGlobal", "running", "Sync globale…");
        try {
          const result = await syncGlobalTrackers({
            onProgress: (_provider, progress) => {
              setStepTrackerProgress(progress);
            },
          });
          writeLastAt(STORAGE_KEYS.trackersGlobal);
          const mangaCount = Math.max(result.mangaMal, result.mangaAniList);
          const parts = [
            `${mangaCount} manga`,
            `${result.animeMal} animé${result.animeMal > 1 ? "s" : ""}`,
          ];
          if (result.animeCreated > 0) {
            parts.push(
              `${result.animeCreated} fiche${result.animeCreated > 1 ? "s" : ""} créée${result.animeCreated > 1 ? "s" : ""}`,
            );
          }
          setStep(
            "trackersGlobal",
            "done",
            parts.join(" · "),
          );
        } catch (err) {
          setStep(
            "trackersGlobal",
            "error",
            err instanceof Error ? err.message : "Échec sync trackers.",
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
