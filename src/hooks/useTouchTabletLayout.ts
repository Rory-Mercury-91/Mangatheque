import { useEffect, useState } from "react";

/**
 * Plus petit côté écran (px CSS) pour distinguer tablette (Galaxy Tab ~800)
 * et téléphone (Galaxy S24 ~360).
 */
export const TOUCH_TABLET_MIN_SCREEN_SIDE = 600;

/**
 * @description true si l'écran correspond à une tablette tactile (pas un téléphone).
 */
export function isTouchTabletScreen(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const minSide = Math.min(window.screen.width, window.screen.height);
  return minSide >= TOUCH_TABLET_MIN_SCREEN_SIDE;
}

/**
 * @description true sur tablette Tauri (Android / iOS) selon la taille physique de l'écran.
 * @param enabled - Actif uniquement en runtime mobile Tauri.
 */
export function useTouchTabletLayout(enabled: boolean): boolean {
  const [isTablet, setIsTablet] = useState(
    () => enabled && isTouchTabletScreen(),
  );

  useEffect(() => {
    if (!enabled) {
      setIsTablet(false);
      return;
    }

    const sync = () => setIsTablet(isTouchTabletScreen());

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [enabled]);

  return enabled && isTablet;
}

/**
 * @description true sur téléphone Tauri (Android / iOS), hors tablette.
 * @param enabled - Actif uniquement en runtime mobile Tauri.
 */
export function useTouchPhoneLayout(enabled: boolean): boolean {
  const touchTabletLayout = useTouchTabletLayout(enabled);
  return enabled && !touchTabletLayout;
}
