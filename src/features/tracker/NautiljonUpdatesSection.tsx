import { useCallback, useEffect, useRef, useState } from "react";
import { FileCode2, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { StickyAlert } from "@/components/common/StickyAlert";
import { usePlanningNotifications } from "@/hooks/usePlanningNotifications";
import { useTrackerSyncBusy } from "@/hooks/useTrackerSyncBusy";
import { isDesktopRuntime, isMobileRuntime } from "@/lib/platform";
import { undoLatestPlanningSyncCreates } from "@/services/activityLogService";
import { pickHtmlFile } from "@/services/platform/htmlFilePickService";
import {
  runPlanningSync,
  type PlanningSyncStats,
} from "@/services/planningSyncService";
import {
  runExclusiveTrackerSync,
  TrackerSyncBusyError,
} from "@/services/tracker/trackerAutoSync";
import { formatDateTimeFr } from "@/utils/dateFormat";
import { resolveErrorMessage } from "@/utils/errorMessage";
import "@/components/layout/PlanningNotificationsBell.css";
import "./NautiljonUpdatesSection.css";

/** URL publique du planning manga Nautiljon (source des sorties). */
export const NAUTILJON_PLANNING_URL =
  "https://www.nautiljon.com/planning/manga/";

const MOBILE_DESKTOP_SYNC_HINT =
  "La synchronisation du planning Nautiljon se fait depuis l'application bureau (Windows). Les mises à jour déjà enregistrées restent visibles ici.";

/**
 * @description Section Mises à jour Nautiljon (sync planning + liste) pour la page Trackers.
 */
export function NautiljonUpdatesSection() {
  const navigate = useNavigate();
  const canSync = isDesktopRuntime();
  const mobile = isMobileRuntime();
  const syncLocked = useTrackerSyncBusy();
  const markedSeen = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastInfo, setLastInfo] = useState<string | null>(null);
  const [lastStats, setLastStats] = useState<PlanningSyncStats | null>(null);
  const { notifications, unreadCount, loading, markAllSeen, reload } =
    usePlanningNotifications();

  useEffect(() => {
    if (markedSeen.current || unreadCount <= 0) return;
    markedSeen.current = true;
    void markAllSeen();
  }, [unreadCount, markAllSeen]);

  const applySync = useCallback(
    async (html?: string) => {
      const stats = await runExclusiveTrackerSync(() =>
        runPlanningSync(html ? { html } : undefined),
      );
      setLastStats(stats);
      await reload();
    },
    [reload],
  );

  const syncNow = useCallback(async () => {
    if (!canSync) {
      setLastError(MOBILE_DESKTOP_SYNC_HINT);
      return;
    }
    if (syncing || undoing || syncLocked) return;
    setSyncing(true);
    setLastError(null);
    setLastInfo(null);
    try {
      await applySync();
    } catch (error) {
      setLastError(
        error instanceof TrackerSyncBusyError
          ? error.message
          : resolveErrorMessage(error, "Erreur de synchronisation inconnue."),
      );
    } finally {
      setSyncing(false);
    }
  }, [applySync, canSync, syncing, undoing, syncLocked]);

  const importHtmlFile = useCallback(async () => {
    if (syncing || undoing || syncLocked) return;
    setLastError(null);
    setLastInfo(null);
    try {
      const picked = await pickHtmlFile();
      if (!picked) return;
      setSyncing(true);
      await applySync(picked.text);
    } catch (error) {
      setLastError(
        error instanceof TrackerSyncBusyError
          ? error.message
          : resolveErrorMessage(
              error,
              "Impossible d'importer le fichier HTML du planning.",
            ),
      );
    } finally {
      setSyncing(false);
    }
  }, [applySync, syncing, undoing, syncLocked]);

  const undoLastCreates = useCallback(async () => {
    if (syncing || undoing || syncLocked) return;
    const confirmed = window.confirm(
      "Annuler les tomes créés par la dernière sync Nautiljon ?\n\nLes tomes déjà possédés ou Mihon ne seront pas touchés. Les mises à jour de dates/covers ne sont pas annulées.",
    );
    if (!confirmed) return;

    setUndoing(true);
    setLastError(null);
    setLastInfo(null);
    try {
      const result = await undoLatestPlanningSyncCreates();
      await reload();
      if (result.undone === 0 && result.skipped === 0) {
        setLastInfo("Aucune création Nautiljon récente à annuler.");
      } else {
        setLastInfo(
          `${result.undone} tome(s) annulé(s)${
            result.skipped > 0
              ? ` · ${result.skipped} ignoré(s) (déjà possédés ou absents)`
              : ""
          }.`,
        );
      }
    } catch (error) {
      setLastError(
        resolveErrorMessage(error, "Annulation de la sync impossible."),
      );
    } finally {
      setUndoing(false);
    }
  }, [reload, syncing, undoing, syncLocked]);

  const busy = syncing || undoing;

  return (
    <section className="nautiljon-updates" aria-labelledby="nautiljon-updates-title">
      <div className="nautiljon-updates-head">
        <h2 id="nautiljon-updates-title">Mises à jour</h2>
        <div className="nautiljon-updates-actions">
          {canSync ? (
            <button
              type="button"
              className="btn-secondary btn-sm nautiljon-updates-sync"
              onClick={() => void syncNow()}
              disabled={busy || syncLocked}
              title={
                syncLocked
                  ? "Une synchronisation est déjà en cours"
                  : "Synchroniser le planning Nautiljon"
              }
            >
              <RefreshCw size={14} className={syncing ? "spin" : ""} aria-hidden />
              {syncing ? "Sync…" : "Synchroniser"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary btn-sm nautiljon-updates-sync"
            onClick={() => void importHtmlFile()}
            disabled={busy || syncLocked}
            title="Importer un fichier HTML du planning (si la sync automatique est bloquée)"
          >
            <FileCode2 size={14} aria-hidden />
            Importer HTML
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm nautiljon-updates-sync"
            onClick={() => void undoLastCreates()}
            disabled={busy || syncLocked}
            title="Supprimer les tomes créés par la dernière sync (sauf ceux déjà possédés)"
          >
            <Undo2 size={14} aria-hidden />
            {undoing ? "Annulation…" : "Annuler créations"}
          </button>
        </div>
      </div>

      <p className="nautiljon-updates-hint">
        Source :{" "}
        <a
          href={NAUTILJON_PLANNING_URL}
          target="_blank"
          rel="noreferrer"
        >
          {NAUTILJON_PLANNING_URL}
        </a>
        {" — "}
        en cas de blocage, enregistrez la page (Ctrl+S) puis importez le fichier
        HTML ici.
      </p>

      {mobile ? (
        <p className="planning-bell-desktop-hint" role="status">
          {MOBILE_DESKTOP_SYNC_HINT}
        </p>
      ) : null}

      {busy ? (
        <p className="planning-bell-status">
          <Loader2 size={16} className="spin" aria-hidden />
          {undoing ? "Annulation des créations…" : "Synchronisation en cours…"}
        </p>
      ) : null}

      {lastError ? (
        <StickyAlert
          variant="error"
          title="Erreur de synchronisation Nautiljon"
          onDismiss={() => setLastError(null)}
        >
          {lastError}
        </StickyAlert>
      ) : null}

      {lastInfo ? (
        <StickyAlert
          variant="info"
          title="Annulation Nautiljon"
          onDismiss={() => setLastInfo(null)}
        >
          {lastInfo}
        </StickyAlert>
      ) : null}

      {!busy && lastStats && lastStats.created + lastStats.updated > 0 ? (
        <p className="planning-bell-sync-result">
          {lastStats.created} créé(s), {lastStats.updated} mis à jour.
        </p>
      ) : null}

      {loading ? (
        <LoadingOverlayHost compact className="planning-bell-list-host">
          <LoadingOverlay message="Chargement des notifications…" />
        </LoadingOverlayHost>
      ) : notifications.length === 0 ? (
        <p className="planning-bell-empty">Aucune mise à jour récente.</p>
      ) : (
        <ul className="planning-bell-list nautiljon-updates-list">
          {notifications.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="planning-bell-item"
                onClick={() => navigate(`/work/${item.workId}`)}
              >
                <strong>{item.workTitle}</strong>
                <span>{item.label}</span>
                <time dateTime={item.createdAt}>
                  {formatDateTimeFr(item.createdAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
