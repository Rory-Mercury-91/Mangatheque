import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowUp,
  BarChart3,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Power,
} from "lucide-react";
import { UpdateBanner } from "@/components/common/UpdateBanner";
import { TampermonkeyDownloadButton } from "@/components/import/TampermonkeyDownloadButton";
import { DesktopImportBridge } from "@/features/import/DesktopImportBridge";
import { NavConfirmModal, type NavConfirmKind } from "@/components/layout/NavConfirmModal";
import { PlanningNotificationsBell } from "@/components/layout/PlanningNotificationsBell";
import { signOut } from "@/services/auth/authActions";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { quitApplication } from "@/lib/appLifecycle";
import { isMobileRuntime } from "@/lib/platform";
import { scrollAppMainToTop } from "@/utils/scrollAppMain";
import { hasPendingLibraryNavigationRestore } from "@/services/libraryNavigationPersistence";
import "@/components/common/ghostActionBtn.css";
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
  { to: "/reading", label: "Suivi lecture", icon: BarChart3 },
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
    if (
      location.pathname === "/library" &&
      hasPendingLibraryNavigationRestore()
    ) {
      return;
    }
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

  const layoutClass = ["app-layout", mobile ? "app-layout--mobile" : ""]
    .filter(Boolean)
    .join(" ");

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
          <div className="app-nav-tab-bar">
            <div className="app-nav-links">
              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `app-nav-link${isActive ? " app-nav-link--active" : ""}`
                  }
                  end={end}
                  title={label}
                >
                  <Icon size={18} aria-hidden />
                  <span className="app-nav-link-label">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
          <div className="app-nav-actions">
            <TampermonkeyDownloadButton header />
            <PlanningNotificationsBell />
            {mobile ? (
              <button
                type="button"
                className="ghost-action-btn"
                onClick={() => scrollAppMainToTop()}
                title="Retour en haut"
                aria-label="Retour en haut de la page"
              >
                <ArrowUp size={18} aria-hidden />
                <span className="ghost-action-label app-nav-action-label">Haut</span>
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-action-btn ghost-action-btn--danger"
              onClick={() => setConfirmKind("logout")}
              title="Se déconnecter"
              aria-label="Se déconnecter"
            >
              <LogOut size={18} aria-hidden />
              <span className="ghost-action-label app-nav-action-label">Déconnexion</span>
            </button>
            {mobile ? (
              <button
                type="button"
                className="ghost-action-btn ghost-action-btn--warning"
                onClick={() => setConfirmKind("quit")}
                title="Quitter l'application"
                aria-label="Quitter l'application"
              >
                <Power size={18} aria-hidden />
                <span className="ghost-action-label app-nav-action-label">Quitter</span>
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
