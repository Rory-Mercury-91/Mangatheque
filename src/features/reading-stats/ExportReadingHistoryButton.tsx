import { useState } from "react";
import { Download } from "lucide-react";
import { exportReadingHistoryToTextFile } from "@/services/readingHistoryExportService";
import type { ReadingWorkItem } from "@/types/readingStats";
import "@/components/common/ghostActionBtn.css";
import "./ExportReadingHistoryButton.css";

export interface ExportReadingHistoryButtonProps {
  items: ReadingWorkItem[];
}

/**
 * @description Bouton d'export de l'historique de lecture en fichier `.txt`.
 */
export function ExportReadingHistoryButton({
  items,
}: ExportReadingHistoryButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await exportReadingHistoryToTextFile(items);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (!result.saved) {
        setMessage("Export annulé.");
        return;
      }
      setMessage("Historique exporté.");
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
        onClick={() => void handleExport()}
        disabled={busy}
        aria-busy={busy}
      >
        <Download size={18} aria-hidden />
        <span className="ghost-action-label">
          {busy ? "Export…" : "Exporter historique de lecture"}
        </span>
      </button>
      {message ? (
        <p
          className={`export-reading-history-message${
            message === "Historique exporté."
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
