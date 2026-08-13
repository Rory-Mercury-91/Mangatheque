import { useState } from "react";
import { Modal } from "@/components/common/Modal";
import { useTrackerSyncReport } from "@/hooks/useTrackerSyncReport";
import { resolveTrackerSyncConflict } from "@/services/tracker/trackerSyncService";
import type {
  TrackerSyncConflictItem,
  TrackerSyncReportSource,
} from "@/types/tracker";
import "@/features/works/WorkFormModal.css";
import "./TrackerSyncReportModal.css";

function sourceLabel(source: TrackerSyncReportSource): string {
  switch (source) {
    case "startup":
      return "Synchronisation automatique au démarrage";
    case "oauth":
      return "Synchronisation après connexion tracker";
    default:
      return "Synchronisation manuelle";
  }
}

function fieldLabel(field: TrackerSyncConflictItem["field"]): string {
  return field === "chapters" ? "Chapitres" : "Tomes";
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function conflictHint(item: TrackerSyncConflictItem): string {
  const emptyVsFilled = item.local <= 0 || item.remote <= 0;
  if (item.repeated && emptyVsFilled) {
    return "Déjà proposé deux fois. Êtes-vous sûr de votre résultat ? Vous pouvez pousser la valeur de l'app (y compris 0) vers MAL / AniList, ou reprendre le tracker.";
  }
  if (item.repeated) {
    return "Déjà signalé. Êtes-vous sûr ? Garder l'app pousse sa valeur vers le tracker ; garder le tracker l'applique ici.";
  }
  if (emptyVsFilled) {
    return "Un côté est vide, l'autre a une progression — et cet écart a déjà été aligné une fois. Choisissez quelle source conserver.";
  }
  return "L'app et le tracker ont tous les deux une progression, différente. Rien n'a été écrasé.";
}

/**
 * @description Modale consultable du dernier rapport de suivi (jamais auto-ouverte).
 */
export function TrackerSyncReportModal() {
  const { report, modalOpen, close, conflictCount } = useTrackerSyncReport();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(
    item: TrackerSyncConflictItem,
    keep: "app" | "tracker",
  ) {
    const key = `${item.workId}:${item.field}`;
    setBusyKey(key);
    setError(null);
    try {
      await resolveTrackerSyncConflict({
        workId: item.workId,
        field: item.field,
        keep,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de trancher le conflit.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Modal
      open={modalOpen}
      stacked
      wide
      title="Résultat du suivi"
      onClose={close}
      footer={
        <button type="button" className="btn-secondary" onClick={close}>
          Fermer
        </button>
      }
    >
      {!report ? (
        <p className="tracker-sync-report-empty">
          Aucune synchronisation récente. Lancez une sync manga depuis Trackers
          pour générer un rapport.
        </p>
      ) : (
        <>
          <p className="tracker-sync-report-meta">
            {sourceLabel(report.source)}
            {formatWhen(report.at) ? ` · ${formatWhen(report.at)}` : ""}
          </p>
          <div className="tracker-sync-report-summary" aria-label="Résumé">
            <span className="tracker-sync-report-chip">
              {report.pulled} tiré{report.pulled > 1 ? "s" : ""}
            </span>
            <span className="tracker-sync-report-chip">
              {report.pushed} poussé{report.pushed > 1 ? "s" : ""}
            </span>
            <span
              className={`tracker-sync-report-chip${
                conflictCount > 0 ? " tracker-sync-report-chip--warn" : ""
              }`}
            >
              {conflictCount} conflit{conflictCount > 1 ? "s" : ""}
            </span>
          </div>
          {conflictCount === 0 ? (
            <p className="tracker-sync-report-hint">
              Aucun conflit. Les côtés vides ont été alignés automatiquement ;
              les progressions identiques n&apos;ont pas été modifiées.
            </p>
          ) : (
            <p className="tracker-sync-report-hint">
              Les conflits n&apos;écrasent rien tant que vous ne choisissez pas.
              Vous pouvez ignorer cette liste et y revenir plus tard.
            </p>
          )}
          {error ? (
            <p className="tracker-sync-report-error" role="alert">
              {error}
            </p>
          ) : null}
          {report.conflicts.length > 0 ? (
            <ul className="tracker-sync-report-list">
              {report.conflicts.map((item) => {
                const key = `${item.workId}:${item.field}`;
                const busy = busyKey === key;
                return (
                  <li
                    key={key}
                    className={`tracker-sync-report-card${
                      item.repeated ? " tracker-sync-report-card--repeated" : ""
                    }`}
                  >
                    <div className="tracker-sync-report-card-head">
                      <strong>{item.workTitle}</strong>
                      <span className="tracker-sync-report-field">
                        {fieldLabel(item.field)}
                      </span>
                    </div>
                    <p className="tracker-sync-report-counts">
                      App {item.local} · Tracker {item.remote}
                    </p>
                    <p className="tracker-sync-report-warn">{conflictHint(item)}</p>
                    <div className="tracker-sync-report-actions">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={busyKey != null}
                        onClick={() => void resolve(item, "tracker")}
                      >
                        {busy
                          ? "Application…"
                          : `Garder le tracker (${item.remote})`}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={busyKey != null}
                        onClick={() => void resolve(item, "app")}
                      >
                        Garder l&apos;app ({item.local})
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </Modal>
  );
}
