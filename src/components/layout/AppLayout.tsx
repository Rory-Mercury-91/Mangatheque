import { NavLink, Outlet } from "react-router-dom";
import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Palette,
  Power,
} from "lucide-react";
import { UpdateBanner } from "@/components/common/UpdateBanner";
import { signOut } from "@/services/auth/authActions";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { quitApplication } from "@/lib/appLifecycle";
import { isMobileRuntime } from "@/lib/platform";
import "./AppLayout.css";

type NavItem = {
  to: string;
  label: string;
  icon: typeof BookOpen;
  end?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/", label: "Bibliothèque", icon: BookOpen, end: true },
  { to: "/personalization", label: "Personnalisation", icon: Palette },
  { to: "/logs", label: "Journal", icon: ClipboardList },
];

/**
 * @description Layout principal avec navigation adaptée desktop / mobile.
 */
export function AppLayout() {
  const mobile = isMobileRuntime();
  const { updateInfo, installing, applyUpdate, dismiss } = useAppUpdater();

  async function handleSignOut() {
    await signOut();
  }

  async function handleQuit() {
    await quitApplication();
  }

  return (
    <div className={`app-layout${mobile ? " app-layout--mobile" : ""}`}>
      {updateInfo ? (
        <UpdateBanner
          version={updateInfo.version}
          platformLabel={
            updateInfo.kind === "desktop"
              ? "Une nouvelle version Windows est disponible."
              : "Téléchargez la nouvelle version Android sur GitHub."
          }
          installing={installing}
          onApply={() => void applyUpdate()}
          onDismiss={dismiss}
        />
      ) : null}
      <nav className="app-nav" aria-label="Navigation principale">
        <div className="app-nav-links">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              className="app-nav-link"
              end={end}
              title={label}
            >
              <Icon size={20} aria-hidden />
              <span className="app-nav-link-label">{label}</span>
            </NavLink>
          ))}
        </div>
        <div className="app-nav-actions">
          <button
            type="button"
            className="app-nav-logout"
            onClick={() => void handleSignOut()}
            title="Se déconnecter"
          >
            <LogOut size={18} aria-hidden />
            <span className="app-nav-link-label">Déconnexion</span>
          </button>
          {mobile ? (
            <button
              type="button"
              className="app-nav-quit"
              onClick={() => void handleQuit()}
              title="Quitter l'application"
            >
              <Power size={18} aria-hidden />
              <span className="app-nav-link-label">Quitter</span>
            </button>
          ) : null}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
