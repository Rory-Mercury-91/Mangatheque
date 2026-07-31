/**
 * Préférence d'ouverture des liens Nautiljon / catalogues Mihon (desktop).
 * Persistée en localStorage — indépendante de la préférence navigateur.
 */

export type CatalogLinkOpenMode = "webview" | "external";

export interface CatalogLinkOpenOption {
  id: CatalogLinkOpenMode;
  label: string;
}

const STORAGE_KEY = "mangatheque.catalogLinkOpenMode";
const CHANGE_EVENT = "mangatheque:catalogLinkOpenMode";

export const CATALOG_LINK_OPEN_OPTIONS: CatalogLinkOpenOption[] = [
  { id: "webview", label: "WebView intégrée (Tauri)" },
  { id: "external", label: "Navigateur du système / préféré" },
];

const VALID_MODES = new Set<CatalogLinkOpenMode>(
  CATALOG_LINK_OPEN_OPTIONS.map((option) => option.id),
);

/**
 * @description Lit le mode d'ouverture des liens catalogue (défaut : WebView).
 */
export function readCatalogLinkOpenMode(): CatalogLinkOpenMode {
  if (typeof window === "undefined") {
    return "webview";
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_MODES.has(raw as CatalogLinkOpenMode)) {
      return raw as CatalogLinkOpenMode;
    }
  } catch {
    // Quota / mode privé.
  }
  return "webview";
}

/**
 * @description Enregistre le mode d'ouverture des liens catalogue.
 */
export function writeCatalogLinkOpenMode(mode: CatalogLinkOpenMode): void {
  if (typeof window === "undefined") {
    return;
  }
  const next = VALID_MODES.has(mode) ? mode : "webview";
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Quota / mode privé.
  }
  window.dispatchEvent(
    new CustomEvent(CHANGE_EVENT, {
      detail: next,
    }),
  );
}

/**
 * @description Abonne un callback aux changements de mode d'ouverture catalogue.
 */
export function subscribeCatalogLinkOpenMode(
  listener: (mode: CatalogLinkOpenMode) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<CatalogLinkOpenMode>).detail;
    listener(detail ?? readCatalogLinkOpenMode());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key == null) {
      listener(readCatalogLinkOpenMode());
    }
  };

  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
