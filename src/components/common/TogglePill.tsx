import "./TogglePill.css";

export interface TogglePillProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  color?: string;
  /** Affiche la couleur même lorsque le filtre est inactif. */
  showColorWhenIdle?: boolean;
  /** Pastille contour (sans remplissage flashy à l'état actif). */
  visualVariant?: "default" | "outline";
  /** Variante visuelle lorsque la pastille est active (exclusion vs inclusion). */
  activeVariant?: "include" | "exclude";
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
        active && activeVariant === "exclude" ? " toggle-pill--exclude" : ""
      }${showColorWhenIdle && color ? " toggle-pill--colored" : ""}${
        visualVariant === "outline" ? " toggle-pill--outline" : ""
      }`}
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
