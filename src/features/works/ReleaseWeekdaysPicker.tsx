import {
  parseReleaseWeekdays,
  RELEASE_WEEKDAY_OPTIONS,
  serializeReleaseWeekdays,
} from "@/utils/workReleaseSchedule/releaseWeekdays";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import "./ReleaseWeekdaysPicker.css";

export interface ReleaseWeekdaysPickerProps {
  value: number[] | string;
  onChange: (days: number[]) => void;
  disabled?: boolean;
}

/**
 * @description Sélecteur des jours de sortie (Lun…Dim).
 */
export function ReleaseWeekdaysPicker({
  value,
  onChange,
  disabled = false,
}: ReleaseWeekdaysPickerProps) {
  const selected = new Set(
    Array.isArray(value) ? value : parseReleaseWeekdays(value),
  );

  return (
    <div className="release-weekdays" role="group" aria-label="Jours de sortie">
      {RELEASE_WEEKDAY_OPTIONS.map((opt) => (
        <div key={opt.value} className="release-weekdays-day" title={opt.label}>
          <ToggleSwitch
            checked={selected.has(opt.value)}
            disabled={disabled}
            onChange={(checked) => {
              const next = new Set(selected);
              if (checked) {
                next.add(opt.value);
              } else {
                next.delete(opt.value);
              }
              onChange(
                parseReleaseWeekdays(serializeReleaseWeekdays([...next])),
              );
            }}
          />
          <span className="release-weekdays-label-long">{opt.label}</span>
          <span className="release-weekdays-label-short">{opt.short}</span>
        </div>
      ))}
    </div>
  );
}
