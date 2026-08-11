import type { ReactNode } from "react";
import "@/components/common/ghostActionBtn.css";
import "./DetailExternalLinks.css";

export interface DetailExternalLinkItem {
  id: string;
  label: string;
  onOpen: () => void;
  title?: string;
}

export interface DetailExternalLinksProps {
  links: DetailExternalLinkItem[];
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  /**
   * header : boutons dans la barre d'actions (desktop).
   * section : bloc dédié dans la fiche.
   */
  placement: "header" | "section";
  /** Ancre pour la navigation de fiche. */
  sectionId?: string;
}

/**
 * @description Liens externes fiche (MAL, Nautiljon, etc.) — header desktop / section mobile.
 */
export function DetailExternalLinks({
  links,
  title = "Liens externes",
  children,
  actions,
  placement,
  sectionId,
}: DetailExternalLinksProps) {
  if (links.length === 0 && !children) {
    return null;
  }

  const buttons = links.map((link) => (
    <button
      key={link.id}
      type="button"
      className={
        placement === "section"
          ? "detail-external-link-btn"
          : "ghost-action-btn"
      }
      title={link.title ?? `Ouvrir ${link.label}`}
      aria-label={link.title ?? `Ouvrir ${link.label}`}
      onClick={link.onOpen}
    >
      {placement === "section" ? (
        <span className="detail-external-link-text">{link.label}</span>
      ) : (
        <span className="ghost-action-label">{link.label}</span>
      )}
    </button>
  ));

  if (placement === "header") {
    return (
      <div className="detail-external-links detail-external-links--header">
        {buttons}
      </div>
    );
  }

  return (
    <section
      id={sectionId}
      className="work-detail-section detail-external-links-section"
    >
      <div className="work-detail-section-header">
        <div className="work-detail-section-header-main">
          <h2>{title}</h2>
        </div>
        {actions ? (
          <div className="work-detail-section-actions">{actions}</div>
        ) : null}
      </div>
      {buttons.length > 0 ? (
        <div className="detail-external-links detail-external-links--section">
          {buttons}
        </div>
      ) : null}
      {children ? (
        <div className="detail-external-links-extra">{children}</div>
      ) : null}
    </section>
  );
}
