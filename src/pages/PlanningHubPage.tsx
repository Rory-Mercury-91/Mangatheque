import { Navigate, Outlet, useLocation } from "react-router-dom";
import { MediaSubTabs } from "@/components/common/MediaSubTabs";
import "./PlanningHubPage.css";

/**
 * @description Hub Planning avec sous-onglets Animé / Webtoon.
 */
export function PlanningHubPage() {
  const location = useLocation();
  if (
    location.pathname === "/reading/planning" ||
    location.pathname === "/reading/planning/"
  ) {
    return <Navigate to="/reading/planning/anime" replace />;
  }

  return (
    <div className="planning-hub-page">
      <MediaSubTabs
        ariaLabel="Sous-onglets planning"
        items={[
          { to: "/reading/planning/anime", label: "Animé", end: true },
          { to: "/reading/planning/webtoon", label: "Webtoon", end: true },
        ]}
      />
      <Outlet />
    </div>
  );
}
