import "./TogglePill.css";

export interface TogglePillProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  color?: string;
  /** Affiche la couleur même lorsque le filtre est inactif. */
  showColorWhenIdle?: boolean;
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
  onClick,
}: TogglePillProps) {
  return (
    <button
      type="button"
      className={`toggle-pill${active ? " toggle-pill--active" : ""}${
        showColorWhenIdle && color ? " toggle-pill--colored" : ""
      }`}
      style={{ "--pill-color": color ?? "#6366f1" } as React.CSSProperties}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
