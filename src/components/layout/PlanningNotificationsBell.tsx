import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, Loader2, RefreshCw, X } from "lucide-react";
import { usePlanningNotifications } from "@/hooks/usePlanningNotifications";
import { usePlanningSync } from "@/hooks/usePlanningSync";
import { isDesktopRuntime, isMobileRuntime } from "@/lib/platform";
import { formatDateTimeFr } from "@/utils/dateFormat";
import "./PlanningNotificationsBell.css";

const MOBILE_DESKTOP_SYNC_HINT =
  "La synchronisation du planning Nautiljon se fait depuis l'application bureau (Windows). Les mises à jour déjà enregistrées restent visibles ici.";

/**
 * @description Cloche de notifications pour les mises à jour planning Nautiljon.
 */
export function PlanningNotificationsBell() {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const mobile = isMobileRuntime();
  const canSync = isDesktopRuntime();
  const { notifications, unreadCount, loading, markAllSeen, reload } =
    usePlanningNotifications();
  const { syncing, syncNow, lastError, lastStats } = usePlanningSync(() => {
    void reload();
  });

  useEffect(() => {
    if (!open || mobile) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [mobile, open]);

  useEffect(() => {
    if (!open || !mobile) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobile, open]);

  async function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && unreadCount > 0) {
      await markAllSeen();
    }
  }

  function handleSelect(workId: string) {
    setOpen(false);
    navigate(`/work/${workId}`);
  }

  function renderPanelContent() {
    return (
      <>
        <div className="planning-bell-panel-head">
          <p className="planning-bell-panel-title">Mises à jour Nautiljon</p>
          <div className="planning-bell-panel-actions">
            {canSync ? (
              <button
                type="button"
                className="planning-bell-sync"
                onClick={() => void syncNow()}
                disabled={syncing}
                title="Synchroniser le planning Nautiljon"
                aria-label="Synchroniser le planning Nautiljon"
              >
                <RefreshCw size={14} className={syncing ? "spin" : ""} aria-hidden />
              </button>
            ) : null}
            {mobile ? (
              <button
                type="button"
                className="planning-bell-close"
                onClick={() => setOpen(false)}
                title="Fermer"
                aria-label="Fermer les mises à jour Nautiljon"
              >
                <X size={18} aria-hidden />
              </button>
            ) : null}
          </div>
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
        {lastError && !mobile ? (
          <p className="planning-bell-error" role="alert">
            {lastError}
          </p>
        ) : null}
        {!syncing && lastStats && lastStats.created + lastStats.updated > 0 ? (
          <p className="planning-bell-sync-result">
            {lastStats.created} créé(s), {lastStats.updated} mis à jour.
          </p>
        ) : null}
        {loading ? (
          <p className="planning-bell-status">
            <Loader2 size={16} className="spin" aria-hidden />
            Chargement…
          </p>
        ) : notifications.length === 0 ? (
          <p className="planning-bell-empty">Aucune mise à jour récente.</p>
        ) : (
          <ul className="planning-bell-list">
            {notifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="planning-bell-item"
                  role="option"
                  onClick={() => handleSelect(item.workId)}
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
        {mobile ? (
          <button
            type="button"
            className="planning-bell-close-footer"
            onClick={() => setOpen(false)}
          >
            Fermer
          </button>
        ) : null}
      </>
    );
  }

  const mobilePanel =
    open && mobile ? (
      <>
        <button
          type="button"
          className="planning-bell-backdrop"
          aria-label="Fermer les mises à jour Nautiljon"
          onClick={() => setOpen(false)}
        />
        <div
          className="planning-bell-panel planning-bell-panel--mobile"
          role="listbox"
          aria-label="Mises à jour planning"
          ref={panelRef}
        >
          {renderPanelContent()}
        </div>
      </>
    ) : null;

  return (
    <div className="planning-bell" ref={mobile ? undefined : panelRef}>
      <button
        type="button"
        className="planning-bell-trigger app-nav-scroll-top"
        onClick={() => void handleToggle()}
        title="Mises à jour Nautiljon"
        aria-label="Mises à jour Nautiljon"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Bell size={18} aria-hidden />
        {unreadCount > 0 ? (
          <span className="planning-bell-badge" aria-hidden>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
        <span className="app-nav-link-label">Mises à jour</span>
      </button>

      {open && !mobile ? (
        <div className="planning-bell-panel" role="listbox" aria-label="Mises à jour planning">
          {renderPanelContent()}
        </div>
      ) : null}

      {mobilePanel ? createPortal(mobilePanel, document.body) : null}
    </div>
  );
}
