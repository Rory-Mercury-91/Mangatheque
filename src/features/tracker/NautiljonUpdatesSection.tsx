import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { StickyAlert } from "@/components/common/StickyAlert";
import { usePlanningNotifications } from "@/hooks/usePlanningNotifications";
import { isDesktopRuntime, isMobileRuntime } from "@/lib/platform";
import {
  runPlanningSync,
  type PlanningSyncStats,
} from "@/services/planningSyncService";
import { formatDateTimeFr } from "@/utils/dateFormat";
import { resolveErrorMessage } from "@/utils/errorMessage";
import "@/components/layout/PlanningNotificationsBell.css";
import "./NautiljonUpdatesSection.css";

const MOBILE_DESKTOP_SYNC_HINT =
  "La synchronisation du planning Nautiljon se fait depuis l'application bureau (Windows). Les mises à jour déjà enregistrées restent visibles ici.";

/**
 * @description Section Mises à jour Nautiljon (sync planning + liste) pour la page Trackers.
 */
export function NautiljonUpdatesSection() {
  const navigate = useNavigate();
  const canSync = isDesktopRuntime();
  const mobile = isMobileRuntime();
  const markedSeen = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastStats, setLastStats] = useState<PlanningSyncStats | null>(null);
  const { notifications, unreadCount, loading, markAllSeen, reload } =
    usePlanningNotifications();

  useEffect(() => {
    if (markedSeen.current || unreadCount <= 0) return;
    markedSeen.current = true;
    void markAllSeen();
  }, [unreadCount, markAllSeen]);

  const syncNow = useCallback(async () => {
    if (!canSync) {
      setLastError(MOBILE_DESKTOP_SYNC_HINT);
      return;
    }
    if (syncing) return;
    setSyncing(true);
    setLastError(null);
    try {
      const stats = await runPlanningSync();
      setLastStats(stats);
      await reload();
    } catch (error) {
      setLastError(
        resolveErrorMessage(error, "Erreur de synchronisation inconnue."),
      );
    } finally {
      setSyncing(false);
    }
  }, [canSync, reload, syncing]);

  return (
    <section className="nautiljon-updates" aria-labelledby="nautiljon-updates-title">
      <div className="nautiljon-updates-head">
        <h2 id="nautiljon-updates-title">Mises à jour Nautiljon</h2>
        {canSync ? (
          <button
            type="button"
            className="btn-secondary btn-sm nautiljon-updates-sync"
            onClick={() => void syncNow()}
            disabled={syncing}
            title="Synchroniser le planning Nautiljon"
          >
            <RefreshCw size={14} className={syncing ? "spin" : ""} aria-hidden />
            {syncing ? "Sync…" : "Synchroniser"}
          </button>
        ) : null}
      </div>

      {mobile ? (
        <p className="planning-bell-desktop-hint" role="status">
          {MOBILE_DESKTOP_SYNC_HINT}
        </p>
      ) : null}

      {syncing ? (
        <p className="planning-bell-status">
          <Loader2 size={16} className="spin" aria-hidden />
          Synchronisation en cours…
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

      {!syncing && lastStats && lastStats.created + lastStats.updated > 0 ? (
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
