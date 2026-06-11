import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchActivityLogs } from "@/services/activityLogService";
import type { ActivityLog } from "@/types/activityLog";
import "./ActivityLogsPage.css";

/**
 * @description Libellé français pour un type d'action du journal.
 * @param actionType - Code technique de l'action.
 */
function formatActionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    work_delete: "Suppression d'œuvre",
    work_create: "Création d'œuvre",
    work_update: "Modification d'œuvre",
  };
  return labels[actionType] ?? actionType;
}

/**
 * @description Page journal des actions sensibles.
 */
export function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchActivityLogs(100)
      .then(setLogs)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Erreur de chargement."),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="logs-page">
      <header className="logs-header">
        <h1>Journal d'activité</h1>
        <p className="logs-subtitle">
          Historique des actions sensibles (suppressions avec justification).
        </p>
      </header>

      {loading ? (
        <p className="logs-status">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement…
        </p>
      ) : error ? (
        <p className="logs-error">{error}</p>
      ) : logs.length === 0 ? (
        <p className="logs-empty">Aucune action enregistrée pour l'instant.</p>
      ) : (
        <ul className="logs-list">
          {logs.map((log) => (
            <li
              key={log.id}
              className={`log-entry${log.action_type === "work_delete" ? " log-entry--danger" : ""}`}
            >
              <div className="log-entry-top">
                <strong>{formatActionLabel(log.action_type)}</strong>
                <time dateTime={log.created_at}>
                  {new Date(log.created_at).toLocaleString("fr-FR")}
                </time>
              </div>
              {log.entity_title && (
                <p className="log-entity">{log.entity_title}</p>
              )}
              {log.reason && (
                <blockquote className="log-reason">
                  « {log.reason} »
                </blockquote>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
