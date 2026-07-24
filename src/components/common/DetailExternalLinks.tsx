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
  /**
   * header : boutons dans la barre d'actions (desktop).
   * section : bloc « Liens externes » (mobile).
   */
  placement: "header" | "section";
}

/**
 * @description Liens externes fiche (MAL, Nautiljon, etc.) — header desktop / section mobile.
 */
export function DetailExternalLinks({
  links,
  placement,
}: DetailExternalLinksProps) {
  if (links.length === 0) {
    return null;
  }

  const buttons = links.map((link) => (
    <button
      key={link.id}
      type="button"
      className="ghost-action-btn"
      title={link.title ?? `Ouvrir ${link.label}`}
      aria-label={link.title ?? `Ouvrir ${link.label}`}
      onClick={link.onOpen}
    >
      <span className="ghost-action-label">{link.label}</span>
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
    <section className="work-detail-section detail-external-links-section">
      <h2>Liens externes</h2>
      <div className="detail-external-links detail-external-links--section">
        {buttons}
      </div>
    </section>
  );
}
