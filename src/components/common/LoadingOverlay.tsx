import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import "./LoadingOverlay.css";

export type LoadingOverlayScope = "container" | "fullscreen";

export interface LoadingOverlayProps {
  /** @default true */
  visible?: boolean;
  /** Message affiché sous le spinner. */
  message?: string;
  /** `container` = parent `.loading-overlay-host` ; `fullscreen` = écran entier. */
  scope?: LoadingOverlayScope;
}

export interface LoadingOverlayHostProps {
  children?: ReactNode;
  className?: string;
  /** Zone réduite (panneau, liste déroulante…). */
  compact?: boolean;
  /** Hauteur adaptée au corps d'une modale. */
  modal?: boolean;
}

/**
 * @description Conteneur positionné pour accueillir un `LoadingOverlay` centré.
 */
export function LoadingOverlayHost({
  children,
  className = "",
  compact = false,
  modal = false,
}: LoadingOverlayHostProps) {
  const classes = [
    "loading-overlay-host",
    compact ? "loading-overlay-host--compact" : "",
    modal ? "loading-overlay-host--modal" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}

/**
 * @description Overlay centré de chargement (zone principale de l'application).
 */
export function LoadingOverlay({
  visible = true,
  message = "Chargement…",
  scope = "container",
}: LoadingOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className={`loading-overlay${scope === "fullscreen" ? " loading-overlay--fullscreen" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="loading-overlay-panel">
        <Loader2 size={32} className="spin" aria-hidden />
        <p>{message}</p>
      </div>
    </div>
  );
}
