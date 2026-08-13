import type { TrackerSyncReport } from "@/types/tracker";

const STORAGE_KEY = "mangatheque.tracker.syncReport.v1";

type ReportListener = () => void;

let currentReport: TrackerSyncReport | null = readStoredReport();
let modalOpen = false;
const listeners = new Set<ReportListener>();

function readStoredReport(): TrackerSyncReport | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as TrackerSyncReport;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.conflicts)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persist(report: TrackerSyncReport | null): void {
  try {
    if (report) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * @description Dernier rapport de sync manga (pull / push / conflits).
 */
export function getTrackerSyncReport(): TrackerSyncReport | null {
  return currentReport;
}

/**
 * @description Enregistre le rapport après une sync. N'ouvre pas de modale.
 */
export function publishTrackerSyncReport(report: TrackerSyncReport): void {
  currentReport = report;
  persist(report);
  emit();
}

/**
 * @description Remplace le rapport (après résolution d'un conflit).
 */
export function replaceTrackerSyncReport(
  report: TrackerSyncReport | null,
): void {
  currentReport = report;
  persist(report);
  emit();
}

/**
 * @description S'abonne aux changements du rapport.
 */
export function subscribeTrackerSyncReport(
  listener: ReportListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * @description Ouvre la modale de rapport (jamais automatique après une sync).
 */
export function openTrackerSyncReportModal(): void {
  modalOpen = true;
  emit();
}

/**
 * @description Ferme la modale de rapport.
 */
export function closeTrackerSyncReportModal(): void {
  modalOpen = false;
  emit();
}

/**
 * @description True si la modale de rapport est ouverte.
 */
export function isTrackerSyncReportModalOpen(): boolean {
  return modalOpen;
}
