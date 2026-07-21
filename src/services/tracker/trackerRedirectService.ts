import { isTauriRuntime } from "@/lib/platform";

const TRACKER_DEEP_LINK_SCHEME = "mangatheque";
const PENDING_TRACKER_DEEP_LINK_KEY = "mangatheque:tracker:pending-deep-link";
const PENDING_TRACKER_PAYLOAD_KEY = "mangatheque:tracker:oauth-payload";

/**
 * @description URL de redirection OAuth tracker selon la plateforme.
 * AniList (implicit) et MAL (code) doivent enregistrer cette URI exacte.
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
  try {
    sessionStorage.setItem(PENDING_TRACKER_DEEP_LINK_KEY, url);
  } catch {
    /* stockage indisponible */
  }
}

/**
 * @description Lit et efface le deep link tracker en attente.
 */
export function consumePendingTrackerDeepLink(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TRACKER_DEEP_LINK_KEY);
    sessionStorage.removeItem(PENDING_TRACKER_DEEP_LINK_KEY);
    return raw;
  } catch {
    return null;
  }
}

/**
 * @description Mémorise le payload OAuth (page bridge HTML).
 */
export function storeTrackerOauthPayload(payload: string): void {
  try {
    sessionStorage.setItem(PENDING_TRACKER_PAYLOAD_KEY, payload);
  } catch {
    /* ignore */
  }
}

/**
 * @description Lit et efface le payload OAuth bridge.
 */
export function consumeTrackerOauthPayload(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TRACKER_PAYLOAD_KEY);
    sessionStorage.removeItem(PENDING_TRACKER_PAYLOAD_KEY);
    return raw;
  } catch {
    return null;
  }
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
