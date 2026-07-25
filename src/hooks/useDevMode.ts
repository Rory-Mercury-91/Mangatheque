import { useCallback, useEffect, useState } from "react";
import {
  isDevModeEnabled,
  setDevModeEnabled,
  subscribeDevMode,
} from "@/services/devModeService";

/**
 * @description État réactif du mode dév (Journal → filtres bibliothèque).
 * @returns `[enabled, setEnabled]`.
 */
export function useDevMode(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(() => isDevModeEnabled());

  useEffect(() => subscribeDevMode(setEnabled), []);

  const update = useCallback((next: boolean) => {
    setDevModeEnabled(next);
    setEnabled(next);
  }, []);

  return [enabled, update];
}
