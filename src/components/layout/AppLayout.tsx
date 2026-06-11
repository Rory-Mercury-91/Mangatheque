import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, ClipboardList, LayoutDashboard, LogOut, Palette } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/services/auth/authActions";
import "./AppLayout.css";

/**
 * @description Layout principal avec navigation Bibliothèque / Dashboard / Journal.
 */
export function AppLayout() {
  const { user } = useAuth();
  const displayEmail = user?.email ?? user?.user_metadata?.full_name ?? "Compte";

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="app-layout">
      <nav className="app-nav" aria-label="Navigation principale">
        <div className="app-nav-links">
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
          <NavLink to="/personalization" className="app-nav-link">
            <Palette size={18} aria-hidden />
            Personnalisation
          </NavLink>
        </div>
        <div className="app-nav-user">
          <span className="app-nav-email" title={displayEmail}>
            {displayEmail}
          </span>
          <button
            type="button"
            className="app-nav-logout"
            onClick={() => void handleSignOut()}
            title="Se déconnecter"
          >
            <LogOut size={16} aria-hidden />
            <span className="sr-only">Se déconnecter</span>
          </button>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
