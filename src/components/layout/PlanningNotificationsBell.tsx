import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePlanningNotifications } from "@/hooks/usePlanningNotifications";
import "./PlanningNotificationsBell.css";

/**
 * @description Cloche header : badge des nouvelles entrées + lien vers Trackers.
 */
export function PlanningNotificationsBell() {
  const navigate = useNavigate();
  const { unreadCount } = usePlanningNotifications();

  return (
    <div className="planning-bell">
      <button
        type="button"
        className="planning-bell-trigger ghost-action-btn"
        onClick={() => navigate("/reading/trackers")}
        title="Mises à jour Nautiljon"
        aria-label={
          unreadCount > 0
            ? `Mises à jour Nautiljon — ${unreadCount} nouvelle${unreadCount > 1 ? "s" : ""}`
            : "Mises à jour Nautiljon"
        }
      >
        <Bell size={18} aria-hidden />
        {unreadCount > 0 ? (
          <span className="planning-bell-badge" aria-hidden>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
        <span className="ghost-action-label app-nav-action-label">Mises à jour</span>
      </button>
    </div>
  );
}
