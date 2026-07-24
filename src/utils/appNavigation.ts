import type { NavigateFunction } from "react-router-dom";

/**
 * @description Indique s'il existe une entrée d'historique SPA avant la page courante.
 */
export function canNavigateBackInApp(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === "number" && idx > 0;
}

/**
 * @description Revient à la page précédente si possible, sinon ouvre le chemin de repli
 * (ex. onglet bibliothèque Lectures / Anime).
 * @param navigate - Fonction de navigation React Router.
 * @param fallbackPath - Chemin si aucun historique (deep link, onglet neuf).
 */
export function navigateBackOr(
  navigate: NavigateFunction,
  fallbackPath: string,
): void {
  if (canNavigateBackInApp()) {
    navigate(-1);
    return;
  }
  navigate(fallbackPath);
}
