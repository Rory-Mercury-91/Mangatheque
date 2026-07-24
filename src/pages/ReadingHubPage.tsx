import { Navigate, Outlet, useLocation } from "react-router-dom";
import { MediaSubTabs } from "@/components/common/MediaSubTabs";

/**
 * @description Hub Suivi avec sous-onglets Lectures / Anime / Planning / Trackers.
 */
export function ReadingHubPage() {
  const location = useLocation();
  if (location.pathname === "/reading" || location.pathname === "/reading/") {
    return <Navigate to="/reading/lectures" replace />;
  }

  return (
    <div className="reading-hub-page">
      <MediaSubTabs
        ariaLabel="Sous-onglets suivi"
        items={[
          { to: "/reading/lectures", label: "Lectures", end: true },
          { to: "/reading/anime", label: "Anime", end: true },
          { to: "/reading/planning", label: "Planning", end: true },
          { to: "/reading/trackers", label: "Trackers", end: true },
        ]}
      />
      <Outlet />
    </div>
  );
}
