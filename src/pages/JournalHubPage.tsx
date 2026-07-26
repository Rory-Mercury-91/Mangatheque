import { Navigate, Outlet, useLocation } from "react-router-dom";
import { MediaSubTabs } from "@/components/common/MediaSubTabs";

/**
 * @description Hub Journal : activité + contrôles.
 */
export function JournalHubPage() {
  const location = useLocation();
  if (location.pathname === "/logs" || location.pathname === "/logs/") {
    return <Navigate to="/logs/activity" replace />;
  }

  return (
    <div className="journal-hub-page">
      <MediaSubTabs
        ariaLabel="Sous-onglets journal"
        items={[
          { to: "/logs/activity", label: "Journal d'activité", end: true },
          { to: "/logs/control", label: "Contrôle", end: true },
        ]}
      />
      <Outlet />
    </div>
  );
}
