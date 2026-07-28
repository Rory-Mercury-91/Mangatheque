import { useCallback, useEffect, useState } from "react";
import {
  isWatchDurationUnit,
  type WatchDurationUnit,
} from "@/utils/animeWatchTime";

const STORAGE_KEY = "mangatheque.watchDurationUnit";
const EVENT_NAME = "mangatheque:watchDurationUnit";

/**
 * @description Lit l’unité d’affichage du temps visionné (localStorage).
 */
export function getWatchDurationUnit(): WatchDurationUnit {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isWatchDurationUnit(raw)) return raw;
  } catch {
    // ignore
  }
  return "hours";
}

/**
 * @description Persiste l’unité d’affichage du temps visionné.
 */
export function setWatchDurationUnit(unit: WatchDurationUnit): void {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: unit }),
  );
}

/**
 * @description État réactif de l’unité M / J / H (partagé dashboard + suivi).
 */
export function useWatchDurationUnit(): [
  WatchDurationUnit,
  (unit: WatchDurationUnit) => void,
] {
  const [unit, setUnit] = useState<WatchDurationUnit>(() =>
    getWatchDurationUnit(),
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (event.newValue && isWatchDurationUnit(event.newValue)) {
        setUnit(event.newValue);
      }
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<WatchDurationUnit>).detail;
      if (isWatchDurationUnit(detail)) setUnit(detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT_NAME, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT_NAME, onCustom);
    };
  }, []);

  const update = useCallback((next: WatchDurationUnit) => {
    setWatchDurationUnit(next);
    setUnit(next);
  }, []);

  return [unit, update];
}
