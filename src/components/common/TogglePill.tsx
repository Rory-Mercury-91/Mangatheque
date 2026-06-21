import "./TogglePill.css";

export interface TogglePillProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  color?: string;
  /** Affiche la couleur même lorsque le filtre est inactif. */
  showColorWhenIdle?: boolean;
  /** Pastille contour ; `soft` conservé comme alias de `outline`. */
  visualVariant?: "default" | "outline" | "soft" | "dash";
  /** Variante visuelle lorsque la pastille est active (inclusion, seul, exclusion Mihon). */
  activeVariant?: "include" | "exclusive" | "exclude";
  title?: string;
  onClick: () => void;
}

/**
 * @description Bouton pastille partagé (propriétaires, Mihon…).
 */
export function TogglePill({
  label,
  active,
  disabled,
  color,
  showColorWhenIdle = false,
  visualVariant = "default",
  activeVariant = "include",
  title,
  onClick,
}: TogglePillProps) {
  return (
    <button
      type="button"
      className={`toggle-pill${active ? " toggle-pill--active" : ""}${
        active && activeVariant === "exclusive" ? " toggle-pill--exclusive" : ""
      }${active && activeVariant === "exclude" ? " toggle-pill--exclude" : ""}${
        showColorWhenIdle && color ? " toggle-pill--colored" : ""
      }${
        visualVariant === "outline" || visualVariant === "soft"
          ? " toggle-pill--outline"
          : ""
      }${visualVariant === "dash" ? " toggle-pill--dash" : ""}`}
      style={{ "--pill-color": color ?? "#6366f1" } as React.CSSProperties}
      disabled={disabled}
      title={title}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
