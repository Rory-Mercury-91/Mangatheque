import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, User } from "lucide-react";
import { ActivityLogFilters } from "@/features/activity/ActivityLogFilters";
import { ResetAllDataModal } from "@/features/activity/ResetAllDataModal";
import { LibraryPagination } from "@/features/library/LibraryPagination";
import {
  buildActivityLogViewEntries,
  collectActivityLogActors,
  fetchActivityLogs,
  fetchHouseholdAccounts,
  mergeActivityLogActors,
  restoreFromActivityLog,
} from "@/services/activityLogService";
import {
  ACTIVITY_LOG_PAGE_SIZE,
  DEFAULT_ACTIVITY_LOG_FILTERS,
  type ActivityLogActor,
  type ActivityLogFiltersState,
  type ActivityLogViewEntry,
} from "@/types/activityLog";
import { formatDateTimeFr } from "@/utils/dateFormat";
import "./ActivityLogsPage.css";

/**
 * @description Page journal des actions sensibles.
 */
export function ActivityLogsPage() {
  const [filters, setFilters] = useState<ActivityLogFiltersState>(
    DEFAULT_ACTIVITY_LOG_FILTERS,
  );
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actors, setActors] = useState<ActivityLogActor[]>([]);
  const [entries, setEntries] = useState<ActivityLogViewEntry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filters.search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logs, allLogs, householdAccounts] = await Promise.all([
        fetchActivityLogs({
          search: debouncedSearch,
          actionTypes:
            filters.actionTypes.length > 0 ? filters.actionTypes : undefined,
          userIds: filters.userIds.length > 0 ? filters.userIds : undefined,
        }),
        fetchActivityLogs(),
        fetchHouseholdAccounts(),
      ]);
      setActors(
        mergeActivityLogActors(
          collectActivityLogActors(allLogs),
          householdAccounts,
        ),
      );
      setEntries(buildActivityLogViewEntries(logs));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters.actionTypes, filters.userIds]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const totalPages = Math.max(
    1,
    Math.ceil(entries.length / ACTIVITY_LOG_PAGE_SIZE),
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * ACTIVITY_LOG_PAGE_SIZE;
    return entries.slice(start, start + ACTIVITY_LOG_PAGE_SIZE);
  }, [entries, currentPage]);

  const handleRestore = async (entry: ActivityLogViewEntry) => {
    const confirmed = window.confirm(
      `Restaurer « ${entry.entityTitle ?? "cet élément"} » dans la bibliothèque ?`,
    );
    if (!confirmed) {
      return;
    }

    setRestoringId(entry.id);
    setRestoreError(null);
    try {
      await restoreFromActivityLog(entry.id);
      await load();
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : "Restauration impossible.",
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <main className="logs-page">
      <header className="logs-header">
        <h1>Journal d&apos;activité</h1>
        <p className="logs-subtitle">
          Historique des actions sensibles : créations, suppressions avec
          justification et restaurations.
        </p>
      </header>

      <ActivityLogFilters
        filters={filters}
        actors={actors}
        resultCount={entries.length}
        currentPage={currentPage}
        totalPages={totalPages}
        onChange={setFilters}
      />

      {restoreError ? (
        <p className="logs-restore-error" role="alert">
          {restoreError}
        </p>
      ) : null}

      {loading ? (
        <p className="logs-status">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement…
        </p>
      ) : error ? (
        <p className="logs-error">{error}</p>
      ) : entries.length === 0 ? (
        <p className="logs-empty">Aucune action ne correspond aux filtres.</p>
      ) : (
        <>
          <ul className="logs-list">
            {paginatedEntries.map((entry) => {
              const isDanger =
                entry.log.action_type === "work_delete" ||
                entry.log.action_type === "volume_delete";

              return (
                <li
                  key={entry.id}
                  className={`log-entry${isDanger ? " log-entry--danger" : ""}${entry.isRestored ? " log-entry--restored" : ""}`}
                >
                  <p className="log-entry-action">{entry.actionLabel}</p>
                  <div className="log-entry-meta">
                    <span className="log-entry-actor">
                      <User size={15} aria-hidden />
                      <span>
                        Par{" "}
                        <strong>
                          {entry.userEmail ?? "Utilisateur inconnu"}
                        </strong>
                      </span>
                    </span>
                    <time dateTime={entry.createdAt}>
                      {formatDateTimeFr(entry.createdAt)}
                    </time>
                  </div>
                  {entry.entityTitle ? (
                    <p className="log-entity">{entry.entityTitle}</p>
                  ) : null}
                  {entry.reason ? (
                    <blockquote className="log-reason">
                      « {entry.reason} »
                    </blockquote>
                  ) : null}
                  {entry.isRestored ? (
                    <p className="log-restored-badge">Restauré</p>
                  ) : entry.canRestore ? (
                    <button
                      type="button"
                      className="log-restore-btn"
                      disabled={restoringId === entry.id}
                      onClick={() => void handleRestore(entry)}
                    >
                      {restoringId === entry.id ? (
                        <>
                          <Loader2 size={16} className="spin" aria-hidden />
                          Restauration…
                        </>
                      ) : (
                        <>
                          <RotateCcw size={16} aria-hidden />
                          Restaurer
                        </>
                      )}
                    </button>
                  ) : isDanger ? (
                    <p className="log-restore-unavailable">
                      Restauration indisponible (aucune sauvegarde).
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <LibraryPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      <section className="logs-test-zone" aria-label="Zone de test">
        <h2>Zone de test</h2>
        <p className="logs-test-zone-hint">
          Bouton temporaire pour repartir de zéro pendant les essais. À retirer
          avant la mise en production.
        </p>
        <button
          type="button"
          className="logs-test-zone-btn"
          onClick={() => setResetModalOpen(true)}
        >
          Réinitialiser toutes les données
        </button>
      </section>

      <ResetAllDataModal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onReset={() => void load()}
      />
    </main>
  );
}
