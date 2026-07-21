import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link2 } from "lucide-react";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { ActivityLogEntryRow } from "@/features/activity/ActivityLogEntryRow";
import { OwnerAccountLinkPanel } from "@/features/activity/OwnerAccountLinkPanel";
import { ActivityLogFilters } from "@/features/activity/ActivityLogFilters";
import { ResetAllDataModal } from "@/features/activity/ResetAllDataModal";
import { TrackerModal } from "@/features/tracker/TrackerModal";
import { LibraryPagination } from "@/features/library/LibraryPagination";
import { isDevBuild } from "@/lib/env";
import {
  buildActivityLogViewEntries,
  collectActivityLogActors,
  fetchActivityLogs,
  fetchHouseholdAccounts,
  mergeActivityLogActors,
  restoreFromActivityLog,
} from "@/services/activityLogService";
import { fetchOwnersWithAccountLinks } from "@/services/ownerAccountLinkService";
import {
  ACTIVITY_LOG_PAGE_SIZE,
  DEFAULT_ACTIVITY_LOG_FILTERS,
  type ActivityLogActor,
  type ActivityLogFiltersState,
  type ActivityLogViewEntry,
} from "@/types/activityLog";
import {
  buildLinkedOwnerByUserId,
  buildActivityLogFilterActors,
  type LinkedOwnerProfile,
} from "@/utils/activityLogActorDisplay";
import "./ActivityLogsPage.css";

/**
 * @description Page journal des actions sensibles.
 */
export function ActivityLogsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ActivityLogFiltersState>(
    DEFAULT_ACTIVITY_LOG_FILTERS,
  );
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actors, setActors] = useState<ActivityLogActor[]>([]);
  const [ownerByUserId, setOwnerByUserId] = useState<
    Map<string, LinkedOwnerProfile>
  >(new Map());
  const [entries, setEntries] = useState<ActivityLogViewEntry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);

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
      const [logs, allLogs, householdAccounts, ownersWithLinks] =
        await Promise.all([
        fetchActivityLogs({
          search: debouncedSearch,
          actionTypes:
            filters.actionTypes.length > 0 ? filters.actionTypes : undefined,
          userIds: filters.userIds.length > 0 ? filters.userIds : undefined,
        }),
        fetchActivityLogs(),
        fetchHouseholdAccounts(),
        fetchOwnersWithAccountLinks(),
      ]);
      const linkedOwners = buildLinkedOwnerByUserId(ownersWithLinks);
      setOwnerByUserId(linkedOwners);
      setActors(
        buildActivityLogFilterActors(
          mergeActivityLogActors(
            collectActivityLogActors(allLogs),
            householdAccounts,
          ),
          allLogs,
          linkedOwners,
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
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setTrackerModalOpen(true)}
        >
          <Link2 size={16} aria-hidden />
          Trackers
        </button>
      </header>

      <OwnerAccountLinkPanel />

      <TrackerModal
        open={trackerModalOpen}
        onClose={() => setTrackerModalOpen(false)}
      />
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

      <LoadingOverlayHost className="logs-page-body">
        {loading ? (
          <LoadingOverlay message="Chargement du journal…" />
        ) : error ? (
          <p className="logs-error">{error}</p>
        ) : entries.length === 0 ? (
          <p className="logs-empty">Aucune action ne correspond aux filtres.</p>
        ) : (
          <>
            <ul className="logs-list">
            {paginatedEntries.map((entry) => (
              <ActivityLogEntryRow
                key={entry.id}
                entry={entry}
                ownerByUserId={ownerByUserId}
                restoring={restoringId === entry.id}
                onRestore={() => void handleRestore(entry)}
                onOpenWork={(workId) => navigate(`/work/${workId}`)}
              />
            ))}
          </ul>
          <LibraryPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
        )}
      </LoadingOverlayHost>

      {isDevBuild() ? (
        <>
          <section className="logs-test-zone" aria-label="Zone de test">
            <h2>Zone de test (dev)</h2>
            <p className="logs-test-zone-hint">
              Visible uniquement en mode développement local.
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
        </>
      ) : null}
    </main>
  );
}
