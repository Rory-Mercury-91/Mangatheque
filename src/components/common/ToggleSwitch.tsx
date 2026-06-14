import "./ToggleSwitch.css";

export interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  label?: string;
  title?: string;
  onChange: (checked: boolean) => void;
}

/**
 * @description Interrupteur glissant (on/off) pour préférences booléennes.
 */
export function ToggleSwitch({
  checked,
  disabled,
  label,
  title,
  onChange,
}: ToggleSwitchProps) {
  return (
    <label
      className={`toggle-switch${disabled ? " toggle-switch--disabled" : ""}`}
      title={title}
    >
      {label ? (
        <span className="toggle-switch-label">{label}</span>
      ) : null}
      <input
        type="checkbox"
        className="toggle-switch-input"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-switch-track" aria-hidden>
        <span className="toggle-switch-thumb" />
      </span>
    </label>
  );
}
