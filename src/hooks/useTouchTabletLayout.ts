import { useEffect, useState } from "react";

/** Largeur minimale (px) pour le layout tablette tactile. */
export const TOUCH_TABLET_MIN_WIDTH = 768;

/**
 * @description true sur tablette Tauri (Android / iOS) selon la largeur viewport.
 * @param enabled - Actif uniquement en runtime mobile Tauri.
 */
export function useTouchTabletLayout(enabled: boolean): boolean {
  const [isTablet, setIsTablet] = useState(
    () =>
      enabled &&
      typeof window !== "undefined" &&
      window.innerWidth >= TOUCH_TABLET_MIN_WIDTH,
  );

  useEffect(() => {
    if (!enabled) {
      setIsTablet(false);
      return;
    }

    const media = window.matchMedia(
      `(min-width: ${TOUCH_TABLET_MIN_WIDTH}px)`,
    );
    const sync = () => setIsTablet(media.matches);

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [enabled]);

  return enabled && isTablet;
}
