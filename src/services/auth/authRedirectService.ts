import { isTauriRuntime } from "@/lib/platform";
import {
  isTrackerCallbackUrl,
  storePendingTrackerDeepLink,
} from "@/services/tracker/trackerRedirectService";

const AUTH_DEEP_LINK_SCHEME = "mangatheque";
const PENDING_AUTH_DEEP_LINK_KEY = "mangatheque:auth:pending-deep-link";

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
  try {
    sessionStorage.setItem(PENDING_AUTH_DEEP_LINK_KEY, url);
  } catch {
    /* stockage indisponible */
  }
}

/**
 * @description Lit et efface le deep link OAuth en attente.
 * @returns URL mémorisée ou null.
 */
export function consumePendingAuthDeepLink(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_AUTH_DEEP_LINK_KEY);
    sessionStorage.removeItem(PENDING_AUTH_DEEP_LINK_KEY);
    return raw;
  } catch {
    return null;
  }
}

/**
 * @description Initialise l'écoute des deep links OAuth (auth + trackers) pour Tauri.
 */
export async function initTauriAuthDeepLinks(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  try {
    const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");

    const processUrls = (urls: unknown[]) => {
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
    };

    const initial = await getCurrent();
    if (initial?.length) {
      processUrls(initial);
    }

    await onOpenUrl((urls) => processUrls(urls));
  } catch {
    /* plugin deep-link indisponible hors bundle Tauri */
  }
}
