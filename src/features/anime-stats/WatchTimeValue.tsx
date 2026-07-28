import { useWatchDurationUnit } from "@/hooks/useWatchDurationUnit";
import {
  formatWatchDurationByUnit,
  WATCH_DURATION_UNITS,
} from "@/utils/animeWatchTime";
import "./WatchTimeValue.css";

export interface WatchTimeValueProps {
  /** Total en secondes. */
  seconds: number;
  /** Variante visuelle (carte suivi vs dashboard). */
  variant?: "stats" | "overview";
}

/**
 * @description Valeur de temps visionné + switch d’unité M / J / H.
 */
export function WatchTimeValue({
  seconds,
  variant = "stats",
}: WatchTimeValueProps) {
  const [unit, setUnit] = useWatchDurationUnit();
  const label = formatWatchDurationByUnit(seconds, unit);
  const hours = Math.round(seconds / 3600);

  return (
    <div
      className={`watch-time-value watch-time-value--${variant}`}
      title={
        hours > 0
          ? `Environ ${hours} h (durée MAL × épisodes vus)`
          : "Durée MAL × épisodes vus (fiches avec durée connue)"
      }
    >
      <strong className="watch-time-value-amount">{label}</strong>
      <div
        className="watch-time-unit-switch"
        role="group"
        aria-label="Unité du temps visionné"
      >
        {WATCH_DURATION_UNITS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`watch-time-unit-btn${
              unit === option.id ? " is-active" : ""
            }`}
            title={option.title}
            aria-pressed={unit === option.id}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setUnit(option.id);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
