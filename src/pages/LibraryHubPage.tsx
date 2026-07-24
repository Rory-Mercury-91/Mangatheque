import { Navigate, Outlet, useLocation } from "react-router-dom";
import { MediaSubTabs } from "@/components/common/MediaSubTabs";

/**
 * @description Hub Bibliothèque avec sous-onglets Lectures / Anime.
 */
export function LibraryHubPage() {
  const location = useLocation();
  if (location.pathname === "/library" || location.pathname === "/library/") {
    return <Navigate to="/library/lectures" replace />;
  }

  return (
    <div className="library-hub-page">
      <MediaSubTabs
        ariaLabel="Sous-onglets bibliothèque"
        items={[
          { to: "/library/lectures", label: "Lectures", end: true },
          { to: "/library/anime", label: "Anime", end: true },
        ]}
      />
      <Outlet />
    </div>
  );
}
