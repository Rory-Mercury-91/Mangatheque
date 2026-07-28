import { Navigate, Outlet, useLocation } from "react-router-dom";
import { MediaSubTabs } from "@/components/common/MediaSubTabs";
import { useDevMode } from "@/hooks/useDevMode";
import "./ReadingHubPage.css";

/**
 * @description Hub Suivi avec sous-onglets Lectures / Anime / Planning / Trackers (/ Mihon en dév).
 */
export function ReadingHubPage() {
  const location = useLocation();
  const [devMode] = useDevMode();

  if (location.pathname === "/reading" || location.pathname === "/reading/") {
    return <Navigate to="/reading/lectures" replace />;
  }

  const items = [
    { to: "/reading/lectures", label: "Lectures", end: true },
    { to: "/reading/anime", label: "Anime", end: true },
    { to: "/reading/planning", label: "Planning", end: true },
    { to: "/reading/trackers", label: "Trackers", end: true },
    ...(devMode
      ? [{ to: "/reading/mihon", label: "Mihon", end: true }]
      : []),
  ];

  return (
    <div className="reading-hub-page">
      <MediaSubTabs ariaLabel="Sous-onglets suivi" items={items} />
      <Outlet />
    </div>
  );
}
