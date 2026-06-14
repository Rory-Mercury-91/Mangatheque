const VOLUME_VIEW_STORAGE_KEY = "mangatheque:work-detail-volume-view";

export type WorkDetailVolumeViewMode = "grid" | "list";

/**
 * @description Lit la préférence d'affichage tomes (grille ou liste).
 */
export function readWorkDetailVolumeViewMode(): WorkDetailVolumeViewMode {
  try {
    const raw = localStorage.getItem(VOLUME_VIEW_STORAGE_KEY);
    return raw === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/**
 * @description Enregistre la préférence d'affichage tomes.
 * @param mode - Mode grille ou liste.
 */
export function persistWorkDetailVolumeViewMode(
  mode: WorkDetailVolumeViewMode,
): void {
  try {
    localStorage.setItem(VOLUME_VIEW_STORAGE_KEY, mode);
  } catch {
    // Ignoré si stockage indisponible
  }
}
