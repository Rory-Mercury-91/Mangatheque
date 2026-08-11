import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDaysFromTodayIso,
  isoDateToDaysFromToday,
  parseDaysOffsetInput,
  resolveStoredDateValue,
} from "@/utils/workReleaseSchedule/releaseWeekdays";
import "./DateInputWithDayOffset.css";

export interface DateInputWithDayOffsetProps {
  id?: string;
  value: string;
  onChange: (isoOrEmpty: string) => void;
  disabled?: boolean;
}

/**
 * @description Saisie date ISO + raccourci « dans X jours ».
 */
export function DateInputWithDayOffset({
  id,
  value,
  onChange,
  disabled = false,
}: DateInputWithDayOffsetProps) {
  const [offsetDraft, setOffsetDraft] = useState("");
  const offsetFocusedRef = useRef(false);
  const skipOffsetSyncRef = useRef(false);

  const isoValue = resolveStoredDateValue(value);
  const showIso = /^\d{4}-\d{2}-\d{2}$/.test(isoValue);

  const syncOffsetDisplayFromIso = useCallback((iso: string) => {
    if (!iso) {
      setOffsetDraft("");
      return;
    }
    const days = isoDateToDaysFromToday(iso);
    if (days !== null) {
      setOffsetDraft(String(days));
    }
  }, []);

  useEffect(() => {
    if (offsetFocusedRef.current || skipOffsetSyncRef.current) {
      return;
    }
    if (!showIso) {
      setOffsetDraft("");
      return;
    }
    syncOffsetDisplayFromIso(isoValue);
  }, [isoValue, showIso, syncOffsetDisplayFromIso]);

  const applyOffset = useCallback(
    (raw: string) => {
      const days = parseDaysOffsetInput(raw);
      if (days === null) {
        return false;
      }
      skipOffsetSyncRef.current = true;
      onChange(addDaysFromTodayIso(days));
      setOffsetDraft(String(days));
      skipOffsetSyncRef.current = false;
      return true;
    },
    [onChange],
  );

  return (
    <div className="date-offset-input">
      <input
        id={id}
        type="date"
        className="date-offset-input-date"
        value={showIso ? isoValue : ""}
        disabled={disabled}
        onChange={(event) => {
          skipOffsetSyncRef.current = true;
          const next = event.target.value;
          onChange(next);
          if (!offsetFocusedRef.current) {
            syncOffsetDisplayFromIso(next);
          }
          skipOffsetSyncRef.current = false;
        }}
      />
      <span className="date-offset-input-sep" aria-hidden>
        ou dans
      </span>
      <input
        id={id ? `${id}-offset` : undefined}
        type="text"
        className="date-offset-input-days"
        inputMode="numeric"
        placeholder="7"
        aria-label="Nombre de jours"
        value={offsetDraft}
        disabled={disabled}
        onChange={(event) => setOffsetDraft(event.target.value)}
        onFocus={() => {
          offsetFocusedRef.current = true;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyOffset(offsetDraft);
          }
        }}
        onBlur={() => {
          offsetFocusedRef.current = false;
          const trimmed = offsetDraft.trim();
          if (!trimmed) {
            onChange("");
            setOffsetDraft("");
            return;
          }
          applyOffset(trimmed);
        }}
      />
      <span className="date-offset-input-unit" aria-hidden>
        j
      </span>
    </div>
  );
}
