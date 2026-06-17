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
 * @description Indique si un retour bibliothèque doit restaurer page et scroll.
 */
export function hasPendingLibraryNavigationRestore(): boolean {
  return readLibraryNavigationState() !== null;
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
 * @description Lit puis supprime l'état mémorisé.
 */
export function consumeLibraryNavigationState(): LibraryNavigationState | null {
  const state = readLibraryNavigationState();
  if (state) {
    clearLibraryNavigationState();
  }
  return state;
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
 * @description Restaure le scroll du conteneur principal (plusieurs tentatives si le DOM charge encore).
 */
export function restoreAppMainScroll(
  scrollTop: number,
  options?: { maxAttempts?: number },
): void {
  const maxAttempts = options?.maxAttempts ?? 30;
  let attempts = 0;
  let settledFrames = 0;

  const tryScroll = () => {
    const main = document.querySelector(".app-main");
    if (!(main instanceof HTMLElement)) {
      if (attempts < maxAttempts) {
        attempts += 1;
        window.setTimeout(tryScroll, 32);
      }
      return;
    }

    main.scrollTo({ top: scrollTop, behavior: "auto" });

    const canReachTarget =
      main.scrollHeight >= scrollTop + main.clientHeight * 0.25;
    const isCloseEnough = Math.abs(main.scrollTop - scrollTop) < 4;

    if (isCloseEnough) {
      settledFrames += 1;
      if (settledFrames >= 2) {
        return;
      }
    } else {
      settledFrames = 0;
    }

    if ((!isCloseEnough || !canReachTarget) && attempts < maxAttempts) {
      attempts += 1;
      window.setTimeout(tryScroll, 32);
    }
  };

  window.setTimeout(tryScroll, 0);
}
