import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, ClipboardList, LayoutDashboard } from "lucide-react";
import "./AppLayout.css";

/**
 * @description Layout principal avec navigation Bibliothèque / Dashboard / Journal.
 */
export function AppLayout() {
  return (
    <div className="app-layout">
      <nav className="app-nav" aria-label="Navigation principale">
        <NavLink to="/" className="app-nav-link" end>
          <BookOpen size={18} aria-hidden />
          Bibliothèque
        </NavLink>
        <NavLink to="/dashboard" className="app-nav-link">
          <LayoutDashboard size={18} aria-hidden />
          Tableau de bord
        </NavLink>
        <NavLink to="/logs" className="app-nav-link">
          <ClipboardList size={18} aria-hidden />
          Journal
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
