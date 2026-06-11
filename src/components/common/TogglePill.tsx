import "./TogglePill.css";

export interface TogglePillProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  color?: string;
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
  onClick,
}: TogglePillProps) {
  return (
    <button
      type="button"
      className={`toggle-pill${active ? " toggle-pill--active" : ""}`}
      style={{ "--pill-color": color ?? "#6366f1" } as React.CSSProperties}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
