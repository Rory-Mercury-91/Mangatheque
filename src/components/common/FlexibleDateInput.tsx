import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import {
  formatDateInputCompact,
  parseFlexibleDateInput,
} from "@/utils/dateFormat";
import "./FlexibleDateInput.css";

export interface FlexibleDateInputProps {
  /** Date ISO YYYY-MM-DD ou vide. */
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Texte d'aide affiché au survol. */
  title?: string;
}

/**
 * @description Champ date : saisie raccourcie J-M-A (ex. 4-6-26) + sélecteur calendrier natif.
 */
export function FlexibleDateInput({
  value,
  onChange,
  disabled = false,
  placeholder = "J-M-A (ex. 4-6-26)",
  title = "Saisie J-M-A (ex. 4-6-26) ou bouton calendrier. Les tirets séparent jour, mois et année.",
}: FlexibleDateInputProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) {
      setDraft(value ? formatDateInputCompact(value) : "");
    }
  }, [value, focused]);

  const applyIsoDate = (isoDate: string) => {
    onChange(isoDate);
    setDraft(isoDate ? formatDateInputCompact(isoDate) : "");
  };

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      applyIsoDate("");
      return;
    }

    const parsed = parseFlexibleDateInput(trimmed);
    if (parsed) {
      applyIsoDate(parsed);
      return;
    }

    setDraft(value ? formatDateInputCompact(value) : "");
  };

  const openPicker = () => {
    if (disabled) {
      return;
    }

    const picker = pickerRef.current;
    if (!picker) {
      return;
    }

    picker.focus({ preventScroll: true });
    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        // Fallback ci-dessous (navigateurs sans showPicker ou politique autoplay).
      }
    }

    picker.click();
  };

  return (
    <div
      className={`flexible-date-input${disabled ? " flexible-date-input--disabled" : ""}`}
      title={title}
    >
      <input
        type="text"
        className="flexible-date-input-text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={focused ? draft : value ? formatDateInputCompact(value) : ""}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setFocused(true);
          setDraft(value ? formatDateInputCompact(value) : "");
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setFocused(false);
          commitDraft();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />

      <button
        type="button"
        className="flexible-date-input-picker-btn"
        aria-label="Ouvrir le calendrier"
        disabled={disabled}
        onClick={openPicker}
      >
        <Calendar size={16} aria-hidden />
      </button>

      <input
        ref={pickerRef}
        type="date"
        className="flexible-date-input-native"
        tabIndex={-1}
        aria-hidden
        min="1990-01-01"
        max="2100-12-31"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          applyIsoDate(event.target.value);
          setFocused(false);
        }}
      />
    </div>
  );
}
