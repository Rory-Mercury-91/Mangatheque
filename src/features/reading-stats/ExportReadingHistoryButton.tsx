import { fetchAnimes } from "@/services/animeService";
import { fetchAnimeProgressForUser } from "@/services/animeProgressService";
import { buildAnimeStatsSnapshot } from "@/services/animeStatsService";
import { fetchLibraryWorkMeta } from "@/services/libraryService";
import {
  exportMediaHistoryToHtmlFile,
  exportReadingHistoryTextFallback,
} from "@/services/mediaHistoryExportService";
import { fetchLibraryUserReadingMeta } from "@/services/readingProgressService";
import { buildReadingStatsSnapshot } from "@/services/readingStatsService";
import { fetchWorks } from "@/services/workService";
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
  const [readingMeta, workMeta] = await Promise.all([
    fetchLibraryUserReadingMeta(works, { targetUserId: userId }),
    fetchLibraryWorkMeta(),
  ]);
  return buildReadingStatsSnapshot(works, readingMeta, workMeta, "all")
    .allWorks;
}

/**
 * @description Charge les lignes animé pour l'export HTML combiné.
 */
async function loadAnimeItemsForExport(
  userId: string,
): Promise<AnimeWatchItem[]> {
  const [animes, progress] = await Promise.all([
    fetchAnimes(),
    fetchAnimeProgressForUser(userId),
  ]);
  return buildAnimeStatsSnapshot(animes, progress).allItems;
}

/**
 * @description Bouton d'export historique HTML (lectures + animé) ; TXT lectures en secours.
 */
export function ExportMediaHistoryButton({
  readingItems,
  animeItems,
  progressUserId = null,
}: ExportMediaHistoryButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const handleExportTxt = async () => {
    if (!readingItems?.length && !progressUserId) {
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
      setMessage("Historique texte exporté.");
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
      <button
        type="button"
        className="ghost-action-btn export-reading-history-btn"
        onClick={() => void handleExportTxt()}
        disabled={busy}
        title="Export texte lectures uniquement"
      >
        <span className="ghost-action-label">TXT lectures</span>
      </button>
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
