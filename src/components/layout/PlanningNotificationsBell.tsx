import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Loader2 } from "lucide-react";
import { usePlanningNotifications } from "@/hooks/usePlanningNotifications";
import { formatDateTimeFr } from "@/utils/dateFormat";
import "./PlanningNotificationsBell.css";

/**
 * @description Cloche de notifications pour les mises à jour planning Nautiljon.
 */
export function PlanningNotificationsBell() {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, loading, markAllSeen } =
    usePlanningNotifications();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

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

  return (
    <div className="planning-bell" ref={panelRef}>
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

      {open ? (
        <div className="planning-bell-panel" role="listbox" aria-label="Mises à jour planning">
          <p className="planning-bell-panel-title">Mises à jour Nautiljon</p>
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
        </div>
      ) : null}
    </div>
  );
}
