const STORAGE_KEY = "mangatheque.libraryNavigation";

export interface LibraryNavigationState {
  page: number;
  scrollTop: number;
}

/**
 * @description Mémorise la page et le scroll avant d'ouvrir une fiche série.
 */
export function saveLibraryNavigationState(state: LibraryNavigationState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignorer quota / mode privé.
  }
}

/**
 * @description Lit l'état de navigation bibliothèque mémorisé.
 */
export function readLibraryNavigationState(): LibraryNavigationState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw) as Partial<LibraryNavigationState>;
    if (
      typeof data.page !== "number" ||
      !Number.isFinite(data.page) ||
      data.page < 1 ||
      typeof data.scrollTop !== "number" ||
      !Number.isFinite(data.scrollTop)
    ) {
      return null;
    }
    return { page: Math.floor(data.page), scrollTop: Math.max(0, data.scrollTop) };
  } catch {
    return null;
  }
}

/**
 * @description Supprime l'état mémorisé après restauration.
 */
export function clearLibraryNavigationState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignorer.
  }
}

/**
 * @description Restaure le scroll du conteneur principal de l'application.
 */
export function restoreAppMainScroll(scrollTop: number): void {
  requestAnimationFrame(() => {
    document.querySelector(".app-main")?.scrollTo({
      top: scrollTop,
      behavior: "auto",
    });
  });
}
