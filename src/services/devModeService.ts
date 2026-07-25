const DEV_MODE_STORAGE_KEY = "mangatheque.devMode";
const DEV_MODE_EVENT = "mangatheque:devMode";

/**
 * @description Indique si le mode dév (filtres IDs, outils) est activé.
 */
export function isDevModeEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(DEV_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * @description Active ou désactive le mode dév (persisté en localStorage).
 * @param enabled - Nouvel état.
 */
export function setDevModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // Quota ou mode privé — ignorer.
  }
  window.dispatchEvent(
    new CustomEvent(DEV_MODE_EVENT, { detail: enabled }),
  );
}

/**
 * @description Abonne un callback aux changements de mode dév (onglet courant + storage).
 * @param listener - Callback appelé avec le nouvel état.
 * @returns Fonction de désabonnement.
 */
export function subscribeDevMode(
  listener: (enabled: boolean) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<boolean>).detail;
    listener(typeof detail === "boolean" ? detail : isDevModeEnabled());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEV_MODE_STORAGE_KEY || event.key == null) {
      listener(isDevModeEnabled());
    }
  };

  window.addEventListener(DEV_MODE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(DEV_MODE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
