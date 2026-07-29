/**
 * Préférence de navigateur pour l'ouverture des liens externes (desktop).
 * Persistée en localStorage — indépendante du navigateur système par défaut.
 */

export type PreferredBrowserId =
  | "system"
  | "chrome"
  | "firefox"
  | "msedge"
  | "brave"
  | "opera"
  | "custom";

export interface BrowserPreference {
  id: PreferredBrowserId;
  /** Commande / chemin exe quand `id === "custom"`. */
  customCommand: string;
}

export interface BrowserOption {
  id: PreferredBrowserId;
  label: string;
}

const STORAGE_KEY = "mangatheque.preferredBrowser";
const CUSTOM_STORAGE_KEY = "mangatheque.preferredBrowser.custom";
const CHANGE_EVENT = "mangatheque:preferredBrowser";

export const BROWSER_OPTIONS: BrowserOption[] = [
  { id: "system", label: "Navigateur par défaut du système" },
  { id: "chrome", label: "Google Chrome" },
  { id: "firefox", label: "Mozilla Firefox" },
  { id: "msedge", label: "Microsoft Edge" },
  { id: "brave", label: "Brave" },
  { id: "opera", label: "Opera" },
  { id: "custom", label: "Personnalisé (commande / chemin)" },
];

const VALID_IDS = new Set<PreferredBrowserId>(
  BROWSER_OPTIONS.map((option) => option.id),
);

/**
 * @description Indique si l'OS courant ressemble à macOS.
 */
function isMacOs(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
}

/**
 * @description Indique si l'OS courant ressemble à Linux bureau.
 */
function isLinuxDesktop(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /linux/i.test(navigator.userAgent) &&
    !/android/i.test(navigator.userAgent)
  );
}

/**
 * @description Convertit un identifiant navigateur en commande `openWith` Tauri.
 */
export function resolveBrowserOpenWithCommand(
  id: Exclude<PreferredBrowserId, "system" | "custom">,
): string {
  if (id === "chrome") {
    if (isMacOs()) return "Google Chrome";
    if (isLinuxDesktop()) return "google-chrome";
    return "chrome";
  }
  if (id === "firefox") {
    if (isMacOs()) return "Firefox";
    return "firefox";
  }
  if (id === "msedge") {
    if (isMacOs()) return "Microsoft Edge";
    if (isLinuxDesktop()) return "microsoft-edge";
    return "msedge";
  }
  if (id === "brave") {
    if (isMacOs()) return "Brave Browser";
    if (isLinuxDesktop()) return "brave-browser";
    return "brave";
  }
  if (id === "opera") {
    if (isMacOs()) return "Opera";
    return "opera";
  }
  return id;
}

/**
 * @description Lit la préférence navigateur (localStorage).
 */
export function readBrowserPreference(): BrowserPreference {
  if (typeof window === "undefined") {
    return { id: "system", customCommand: "" };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const id =
      raw && VALID_IDS.has(raw as PreferredBrowserId)
        ? (raw as PreferredBrowserId)
        : "system";
    const customCommand =
      window.localStorage.getItem(CUSTOM_STORAGE_KEY)?.trim() || "";
    return { id, customCommand };
  } catch {
    return { id: "system", customCommand: "" };
  }
}

/**
 * @description Enregistre la préférence navigateur.
 */
export function writeBrowserPreference(next: BrowserPreference): void {
  if (typeof window === "undefined") {
    return;
  }
  const id = VALID_IDS.has(next.id) ? next.id : "system";
  const customCommand = next.customCommand.trim();
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, customCommand);
  } catch {
    // Quota / mode privé.
  }
  window.dispatchEvent(
    new CustomEvent(CHANGE_EVENT, {
      detail: { id, customCommand } satisfies BrowserPreference,
    }),
  );
}

/**
 * @description Normalise une commande / chemin navigateur (guillemets, slash).
 */
export function normalizeBrowserOpenWith(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  // Chemins Windows : unifier les séparateurs.
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    value = value.replace(/\//g, "\\");
  }
  return value;
}

/**
 * @description Valeur `openWith` pour le plugin opener, ou `undefined` = système.
 */
export function getPreferredBrowserOpenWith(): string | undefined {
  const pref = readBrowserPreference();
  if (pref.id === "system") {
    return undefined;
  }
  if (pref.id === "custom") {
    const custom = normalizeBrowserOpenWith(pref.customCommand);
    return custom || undefined;
  }
  return resolveBrowserOpenWithCommand(pref.id);
}

/**
 * @description Abonne un callback aux changements de préférence navigateur.
 */
export function subscribeBrowserPreference(
  listener: (pref: BrowserPreference) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<BrowserPreference>).detail;
    listener(detail ?? readBrowserPreference());
  };
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === STORAGE_KEY ||
      event.key === CUSTOM_STORAGE_KEY ||
      event.key == null
    ) {
      listener(readBrowserPreference());
    }
  };

  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
