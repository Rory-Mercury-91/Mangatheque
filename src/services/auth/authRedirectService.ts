import { isTauriRuntime } from "@/lib/platform";
import {
  isTrackerCallbackUrl,
  storePendingTrackerDeepLink,
} from "@/services/tracker/trackerRedirectService";

const AUTH_DEEP_LINK_SCHEME = "mangatheque";
const PENDING_AUTH_DEEP_LINK_KEY = "mangatheque:auth:pending-deep-link";

/**
 * @description Écrit une valeur dans localStorage + sessionStorage.
 */
function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * @description Lit puis efface une clé des deux stocks.
 */
function consumeStorage(key: string): string | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    try {
      raw = sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  return raw;
}

/**
 * @description URL de redirection OAuth / confirmation e-mail selon la plateforme.
 * @returns Deep link Tauri ou route hash web.
 */
export function getAuthRedirectUrl(): string {
  if (isTauriRuntime()) {
    return `${AUTH_DEEP_LINK_SCHEME}://auth-callback`;
  }
  return `${window.location.origin}/#/auth/callback`;
}

/**
 * @description URL de retour pour l'e-mail « mot de passe oublié ».
 * @description Pointe vers la page de saisie du nouveau mot de passe (navigateur).
 */
export function getPasswordResetRedirectUrl(): string {
  if (isTauriRuntime()) {
    return `${AUTH_DEEP_LINK_SCHEME}://auth-callback`;
  }
  return `${window.location.origin}/#/auth/reset-password`;
}

/**
 * @description Mémorise un deep link OAuth reçu par Tauri avant navigation interne.
 * @param url URL complète du callback.
 */
export function storePendingAuthDeepLink(url: string): void {
  writeStorage(PENDING_AUTH_DEEP_LINK_KEY, url);
}

/**
 * @description Lit et efface le deep link OAuth en attente.
 * @returns URL mémorisée ou null.
 */
export function consumePendingAuthDeepLink(): string | null {
  return consumeStorage(PENDING_AUTH_DEEP_LINK_KEY);
}

/**
 * @description Traite une liste d'URL deep link (auth ou tracker).
 */
function processDeepLinkUrls(urls: unknown[]): void {
  const first = urls[0];
  if (!first) {
    return;
  }
  const normalized =
    typeof first === "string"
      ? first
      : first && typeof first === "object" && "href" in first
        ? String((first as { href: string }).href)
        : String(first);

  if (isTrackerCallbackUrl(normalized)) {
    storePendingTrackerDeepLink(normalized);
    window.location.hash = "/tracker/callback";
    return;
  }

  storePendingAuthDeepLink(normalized);
  window.location.hash = "/auth/callback";
}

/**
 * @description Initialise l'écoute des deep links OAuth (auth + trackers) pour Tauri.
 */
export async function initTauriAuthDeepLinks(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  let plugin: typeof import("@tauri-apps/plugin-deep-link");
  try {
    plugin = await import("@tauri-apps/plugin-deep-link");
  } catch (error) {
    console.warn("Plugin deep-link indisponible :", error);
    return;
  }

  // Cold start : getCurrent peut échouer sans bloquer le listener warm
  try {
    const initial = await plugin.getCurrent();
    if (initial?.length) {
      processDeepLinkUrls(initial);
    }
  } catch (error) {
    console.warn("Deep link getCurrent impossible :", error);
  }

  try {
    await plugin.onOpenUrl((urls) => processDeepLinkUrls(urls));
  } catch (error) {
    console.error(
      "Écoute deep-link impossible (vérifiez deep-link:default dans capabilities) :",
      error,
    );
  }
}
