import { useEffect, useState } from "react";
import { isMobileRuntime } from "@/lib/platform";

/** Séries par page — mobile et tablette tactile. */
export const LIBRARY_PAGE_SIZE_TOUCH = 24;

/** Séries par page — bureau fenêtre réduite / demi-écran. */
export const LIBRARY_PAGE_SIZE_DESKTOP = 25;

/** Séries par page — bureau plein écran (multiple de 8 colonnes courantes). */
export const LIBRARY_PAGE_SIZE_LARGE_DESKTOP = 32;

const LARGE_DESKTOP_MIN_WIDTH = 1600;
const DESKTOP_MIN_WIDTH = 900;

/**
 * @description Calcule la taille de page bibliothèque selon la largeur et la plateforme.
 * @param width - Largeur viewport en px.
 * @param touchRuntime - true sur Android / iOS (Tauri mobile).
 */
export function resolveLibraryPageSize(
  width: number,
  touchRuntime: boolean,
): number {
  if (touchRuntime) {
    return LIBRARY_PAGE_SIZE_TOUCH;
  }
  if (width >= LARGE_DESKTOP_MIN_WIDTH) {
    return LIBRARY_PAGE_SIZE_LARGE_DESKTOP;
  }
  if (width >= DESKTOP_MIN_WIDTH) {
    return LIBRARY_PAGE_SIZE_DESKTOP;
  }
  return LIBRARY_PAGE_SIZE_TOUCH;
}

/**
 * @description Taille de page bibliothèque adaptée au viewport (32 / 25 / 24).
 */
export function useLibraryPageSize(): number {
  const touchRuntime = isMobileRuntime();

  const [pageSize, setPageSize] = useState(() =>
    resolveLibraryPageSize(
      typeof window !== "undefined" ? window.innerWidth : 1280,
      touchRuntime,
    ),
  );

  useEffect(() => {
    const update = () => {
      setPageSize(resolveLibraryPageSize(window.innerWidth, touchRuntime));
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [touchRuntime]);

  return pageSize;
}
