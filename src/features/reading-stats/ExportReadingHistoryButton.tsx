import { fetchAnimes } from "@/services/animeService";
import { fetchHiddenAnimeIdsForUser } from "@/services/animeHiddenService";
import { fetchAnimeProgressForUser } from "@/services/animeProgressService";
import { buildAnimeStatsSnapshot } from "@/services/animeStatsService";
import { fetchLibraryMetaBundle } from "@/services/libraryMetaBundleService";
import {
  exportAnimeHistoryToTextFile,
  exportMediaHistoryToHtmlFile,
  exportReadingHistoryTextFallback,
} from "@/services/mediaHistoryExportService";
import { buildReadingStatsSnapshot } from "@/services/readingStatsService";
import { fetchWorks } from "@/services/workService";
import { fetchHiddenWorkIdsForUser } from "@/services/workHiddenService";
import type { AnimeWatchItem } from "@/types/animeStats";
import type { ReadingWorkItem } from "@/types/readingStats";
import { useState } from "react";
import { Download } from "lucide-react";
import "@/components/common/ghostActionBtn.css";
import "./ExportReadingHistoryButton.css";

export interface ExportMediaHistoryButtonProps {
  /** Séries lecture déjà chargées (évite un rechargement). */
  readingItems?: ReadingWorkItem[];
  /** Animés déjà chargés (évite un rechargement). */
  animeItems?: AnimeWatchItem[];
  /** Compte dont on exporte la progression (pour compléter l'autre domaine). */
  progressUserId?: string | null;
}

/**
 * @description Charge les lignes lecture pour l'export HTML combiné.
 */
async function loadReadingItemsForExport(
  userId: string,
): Promise<ReadingWorkItem[]> {
  const works = await fetchWorks();
  const [bundle, hidden] = await Promise.all([
    fetchLibraryMetaBundle(works, { targetUserId: userId }),
    fetchHiddenWorkIdsForUser(userId),
  ]);
  return buildReadingStatsSnapshot(
    works,
    bundle.readingMeta,
    bundle.workMeta,
    "all",
    hidden,
  ).allWorks;
}

/**
 * @description Charge les lignes animé pour l'export HTML combiné.
 */
async function loadAnimeItemsForExport(
  userId: string,
): Promise<AnimeWatchItem[]> {
  const [animes, progress, hidden] = await Promise.all([
    fetchAnimes(),
    fetchAnimeProgressForUser(userId),
    fetchHiddenAnimeIdsForUser(userId),
  ]);
  return buildAnimeStatsSnapshot(animes, progress, hidden).allItems;
}

/**
 * @description Bouton d'export historique HTML (lectures + animé) ; TXT selon le contexte.
 */
export function ExportMediaHistoryButton({
  readingItems,
  animeItems,
  progressUserId = null,
}: ExportMediaHistoryButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasReadingContext = readingItems != null || progressUserId != null;
  const hasAnimeContext = animeItems != null || progressUserId != null;
  const showTxtLectures = readingItems != null || !animeItems;
  const showTxtAnime = animeItems != null;

  const handleExportHtml = async () => {
    setBusy(true);
    setMessage(null);
    try {
      let reading = readingItems;
      let anime = animeItems;

      if (reading == null && progressUserId) {
        reading = await loadReadingItemsForExport(progressUserId);
      }
      if (anime == null && progressUserId) {
        anime = await loadAnimeItemsForExport(progressUserId);
      }

      const result = await exportMediaHistoryToHtmlFile({
        readingItems: reading ?? [],
        animeItems: anime ?? [],
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (!result.saved) {
        setMessage("Export annulé.");
        return;
      }
      setMessage("Historique HTML exporté.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'exporter l'historique.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExportTxtLectures = async () => {
    if (!hasReadingContext) {
      setMessage("Aucune donnée lecture à exporter en texte.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const items =
        readingItems ??
        (progressUserId
          ? await loadReadingItemsForExport(progressUserId)
          : []);
      const result = await exportReadingHistoryTextFallback(items);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (!result.saved) {
        setMessage("Export annulé.");
        return;
      }
      setMessage("Historique lecture (TXT) exporté.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'exporter l'historique.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExportTxtAnime = async () => {
    if (!hasAnimeContext) {
      setMessage("Aucune donnée animé à exporter en texte.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const items =
        animeItems ??
        (progressUserId ? await loadAnimeItemsForExport(progressUserId) : []);
      const result = await exportAnimeHistoryToTextFile(items);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (!result.saved) {
        setMessage("Export annulé.");
        return;
      }
      setMessage("Historique visionnage (TXT) exporté.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'exporter l'historique.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-reading-history">
      <button
        type="button"
        className="ghost-action-btn ghost-action-btn--accent export-reading-history-btn"
        onClick={() => void handleExportHtml()}
        disabled={busy}
        aria-busy={busy}
      >
        <Download size={18} aria-hidden />
        <span className="ghost-action-label">
          {busy ? "Export…" : "Exporter historique (HTML)"}
        </span>
      </button>
      {showTxtLectures ? (
        <button
          type="button"
          className="ghost-action-btn export-reading-history-btn"
          onClick={() => void handleExportTxtLectures()}
          disabled={busy}
          title="Export texte lectures uniquement"
        >
          <span className="ghost-action-label">TXT lectures</span>
        </button>
      ) : null}
      {showTxtAnime ? (
        <button
          type="button"
          className="ghost-action-btn export-reading-history-btn"
          onClick={() => void handleExportTxtAnime()}
          disabled={busy}
          title="Export texte visionnage uniquement"
        >
          <span className="ghost-action-label">TXT animés</span>
        </button>
      ) : null}
      {message ? (
        <p
          className={`export-reading-history-message${
            message.includes("exporté")
              ? " export-reading-history-message--ok"
              : ""
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Alias — préférer ExportMediaHistoryButton. */
export const ExportReadingHistoryButton = ExportMediaHistoryButton;
