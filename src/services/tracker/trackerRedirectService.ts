import { isTauriRuntime } from "@/lib/platform";

const TRACKER_DEEP_LINK_SCHEME = "mangatheque";
const PENDING_TRACKER_DEEP_LINK_KEY = "mangatheque:tracker:pending-deep-link";
const PENDING_TRACKER_PAYLOAD_KEY = "mangatheque:tracker:oauth-payload";

/**
 * @description Écrit dans localStorage + sessionStorage (survie deep link Tauri).
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
 * @description URL de redirection OAuth tracker selon la plateforme.
 * AniList et MAL doivent enregistrer cette URI exacte dans leur console développeur.
 */
export function getTrackerRedirectUrl(): string {
  if (isTauriRuntime()) {
    return `${TRACKER_DEEP_LINK_SCHEME}://tracker-callback`;
  }
  return `${window.location.origin}/tracker-oauth.html`;
}

/**
 * @description Mémorise un deep link tracker reçu par Tauri.
 */
export function storePendingTrackerDeepLink(url: string): void {
  writeStorage(PENDING_TRACKER_DEEP_LINK_KEY, url);
}

/**
 * @description Lit et efface le deep link tracker en attente.
 */
export function consumePendingTrackerDeepLink(): string | null {
  return consumeStorage(PENDING_TRACKER_DEEP_LINK_KEY);
}

/**
 * @description Mémorise le payload OAuth (page bridge HTML).
 */
export function storeTrackerOauthPayload(payload: string): void {
  writeStorage(PENDING_TRACKER_PAYLOAD_KEY, payload);
}

/**
 * @description Lit et efface le payload OAuth bridge.
 */
export function consumeTrackerOauthPayload(): string | null {
  return consumeStorage(PENDING_TRACKER_PAYLOAD_KEY);
}

/**
 * @description Indique si une URL est un callback tracker.
 */
export function isTrackerCallbackUrl(url: string): boolean {
  return (
    url.includes("tracker-callback") ||
    url.includes("tracker-oauth") ||
    url.includes("mangatheque:tracker")
  );
}
