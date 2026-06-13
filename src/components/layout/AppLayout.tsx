import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowUp,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Power,
} from "lucide-react";
import { UpdateBanner } from "@/components/common/UpdateBanner";
import { DesktopImportBridge } from "@/features/import/DesktopImportBridge";
import { NavConfirmModal, type NavConfirmKind } from "@/components/layout/NavConfirmModal";
import { PlanningNotificationsBell } from "@/components/layout/PlanningNotificationsBell";
import { signOut } from "@/services/auth/authActions";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { quitApplication } from "@/lib/appLifecycle";
import { isMobileRuntime } from "@/lib/platform";
import { scrollAppMainToTop } from "@/utils/scrollAppMain";
import "./AppLayout.css";

type NavItem = {
  to: string;
  label: string;
  icon: typeof BookOpen;
  end?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard, end: true },
  { to: "/library", label: "Bibliothèque", icon: BookOpen },
  { to: "/logs", label: "Journal", icon: ClipboardList },
];

/**
 * @description Layout principal avec navigation adaptée desktop / mobile.
 */
export function AppLayout() {
  const mobile = isMobileRuntime();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const { updateInfo, installing, applyUpdate, dismiss } = useAppUpdater();
  const [confirmKind, setConfirmKind] = useState<NavConfirmKind | null>(null);

  useLayoutEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  async function handleConfirm() {
    const kind = confirmKind;
    setConfirmKind(null);
    if (kind === "logout") {
      await signOut();
    } else if (kind === "quit") {
      await quitApplication();
    }
  }

  const layoutClass = ["app-layout", mobile ? "app-layout--mobile" : ""].filter(Boolean).join(" ");

  return (
    <div className={layoutClass}>
      <header className="app-header">
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
            <PlanningNotificationsBell />
            {mobile ? (
              <button
                type="button"
                className="app-nav-scroll-top"
                onClick={() => scrollAppMainToTop()}
                title="Retour en haut"
                aria-label="Retour en haut de la page"
              >
                <ArrowUp size={18} aria-hidden />
                <span className="app-nav-link-label">Haut</span>
              </button>
            ) : null}
            <button
              type="button"
              className="app-nav-logout"
              onClick={() => setConfirmKind("logout")}
              title="Se déconnecter"
            >
              <LogOut size={18} aria-hidden />
              <span className="app-nav-link-label">Déconnexion</span>
            </button>
            {mobile ? (
              <button
                type="button"
                className="app-nav-quit"
                onClick={() => setConfirmKind("quit")}
                title="Quitter l'application"
              >
                <Power size={18} aria-hidden />
                <span className="app-nav-link-label">Quitter</span>
              </button>
            ) : null}
          </div>
        </nav>
      </header>
      <main ref={mainRef} className="app-main">
        <div className="app-scroll-sticky-rail" aria-hidden="true" />
        <Outlet />
      </main>
      <DesktopImportBridge />
      <NavConfirmModal
        kind={confirmKind}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => void handleConfirm()}
      />
    </div>
  );
}
