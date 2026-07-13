import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { parseTagList } from "@/services/importMapService";

export interface CommaSeparatedTagInputHandle {
  /** @description Parse et valide la saisie en cours (ex. avant enregistrement). */
  commit: () => string[];
}

export interface CommaSeparatedTagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

/**
 * @description Champ texte pour listes de tags séparées par des virgules.
 * Conserve la saisie brute (espaces inclus) jusqu'au blur ou commit explicite.
 */
export const CommaSeparatedTagInput = forwardRef<
  CommaSeparatedTagInputHandle,
  CommaSeparatedTagInputProps
>(function CommaSeparatedTagInput(
  { value, onChange, disabled = false, id, "aria-label": ariaLabel },
  ref,
) {
  const [draft, setDraft] = useState(() => value.join(", "));
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraft(value.join(", "));
    }
  }, [value]);

  const commitDraft = (): string[] => {
    const parsed = parseTagList(draft);
    const normalized = parsed.join(", ");
    setDraft(normalized);
    onChange(parsed);
    return parsed;
  };

  useImperativeHandle(ref, () => ({
    commit: commitDraft,
  }));

  return (
    <input
      id={id}
      type="text"
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={() => {
        isEditingRef.current = true;
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        isEditingRef.current = false;
        commitDraft();
      }}
    />
  );
});
