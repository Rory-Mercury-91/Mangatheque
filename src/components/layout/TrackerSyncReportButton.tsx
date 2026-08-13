import { ListChecks } from "lucide-react";
import { useTrackerSyncReport } from "@/hooks/useTrackerSyncReport";
import "@/components/common/ghostActionBtn.css";
import "./TrackerSyncReportButton.css";

export interface TrackerSyncReportButtonProps {
  /** Style selon l'emplacement (header, page Trackers, fin de sync démarrage). */
  variant?: "header" | "panel" | "footer";
}

/**
 * @description Bouton pour ouvrir le rapport de suivi (sans l'afficher tout seul).
 */
export function TrackerSyncReportButton({
  variant = "header",
}: TrackerSyncReportButtonProps) {
  const { open, conflictCount, report } = useTrackerSyncReport();
  const label = "Voir le résultat du suivi";
  const title =
    conflictCount > 0
      ? `${label} — ${conflictCount} conflit${conflictCount > 1 ? "s" : ""}`
      : report
        ? label
        : `${label} — aucune sync récente`;

  if (variant === "header") {
    return (
      <button
        type="button"
        className="ghost-action-btn tracker-sync-report-btn"
        onClick={open}
        title={title}
        aria-label={title}
      >
        <ListChecks size={18} aria-hidden />
        {conflictCount > 0 ? (
          <span className="tracker-sync-report-badge" aria-hidden>
            {conflictCount > 9 ? "9+" : conflictCount}
          </span>
        ) : null}
        <span className="ghost-action-label app-nav-action-label">Résultat</span>
      </button>
    );
  }

  const className =
    variant === "footer"
      ? "btn-secondary tracker-sync-report-btn tracker-sync-report-btn--footer"
      : "btn-secondary btn-sm tracker-sync-report-btn tracker-sync-report-btn--panel";

  return (
    <button
      type="button"
      className={className}
      onClick={open}
      title={title}
      aria-label={title}
    >
      <ListChecks size={14} aria-hidden />
      {label}
      {conflictCount > 0 ? (
        <span className="tracker-sync-report-badge" aria-hidden>
          {conflictCount > 9 ? "9+" : conflictCount}
        </span>
      ) : null}
    </button>
  );
}
