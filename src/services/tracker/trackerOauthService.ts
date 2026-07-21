import { openExternalUrl } from "@/services/platform/linkService";
import {
  getAniListClientId,
  getMalClientId,
  getTrackerConfigHelpMessage,
  isTrackerProviderConfigured,
} from "@/services/tracker/trackerConfig";
import { createMalCodeChallenge, createOauthState, createPkceVerifier } from "@/services/tracker/pkce";
import { getTrackerRedirectUrl } from "@/services/tracker/trackerRedirectService";
import type { TrackerProvider } from "@/types/tracker";

const MAL_PKCE_VERIFIER_KEY = "mangatheque:tracker:mal-pkce-verifier";
const MAL_OAUTH_STATE_KEY = "mangatheque:tracker:mal-oauth-state";
const PENDING_PROVIDER_KEY = "mangatheque:tracker:pending-provider";

/**
 * @description Mémorise le provider OAuth en cours.
 */
export function storePendingTrackerProvider(provider: TrackerProvider): void {
  sessionStorage.setItem(PENDING_PROVIDER_KEY, provider);
}

/**
 * @description Lit le provider OAuth en cours (sans l'effacer).
 */
export function peekPendingTrackerProvider(): TrackerProvider | null {
  const raw = sessionStorage.getItem(PENDING_PROVIDER_KEY);
  if (raw === "mal" || raw === "anilist") {
    return raw;
  }
  return null;
}

/**
 * @description Lit et efface le provider OAuth en cours.
 */
export function consumePendingTrackerProvider(): TrackerProvider | null {
  const provider = peekPendingTrackerProvider();
  sessionStorage.removeItem(PENDING_PROVIDER_KEY);
  return provider;
}

/**
 * @description Lance l'authentification AniList (Implicit Grant, sans secret).
 */
export async function startAniListOauth(): Promise<void> {
  if (!isTrackerProviderConfigured("anilist")) {
    throw new Error(getTrackerConfigHelpMessage("anilist"));
  }

  const clientId = getAniListClientId();
  const redirectUri = getTrackerRedirectUrl();
  storePendingTrackerProvider("anilist");

  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("redirect_uri", redirectUri);

  await openExternalUrl(url.toString());
}

/**
 * @description Lance l'authentification MyAnimeList (OAuth + PKCE plain).
 */
export async function startMalOauth(): Promise<void> {
  if (!isTrackerProviderConfigured("mal")) {
    throw new Error(getTrackerConfigHelpMessage("mal"));
  }

  const clientId = getMalClientId();
  const redirectUri = getTrackerRedirectUrl();
  const verifier = createPkceVerifier();
  const state = createOauthState();
  const challenge = createMalCodeChallenge(verifier);

  sessionStorage.setItem(MAL_PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(MAL_OAUTH_STATE_KEY, state);
  storePendingTrackerProvider("mal");

  const url = new URL("https://myanimelist.net/v1/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "plain");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);

  await openExternalUrl(url.toString());
}

/**
 * @description Échange le code MAL contre un access_token.
 */
export async function exchangeMalAuthorizationCode(
  code: string,
  state: string | null,
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}> {
  const expectedState = sessionStorage.getItem(MAL_OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(MAL_PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(MAL_OAUTH_STATE_KEY);
  sessionStorage.removeItem(MAL_PKCE_VERIFIER_KEY);

  if (!verifier) {
    throw new Error("Session PKCE MAL expirée. Relancez la connexion.");
  }
  if (expectedState && state && expectedState !== state) {
    throw new Error("État OAuth MAL invalide. Relancez la connexion.");
  }

  const body = new URLSearchParams({
    client_id: getMalClientId(),
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: getTrackerRedirectUrl(),
  });

  const response = await fetch("https://myanimelist.net/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Échange token MAL impossible : ${text || response.status}`);
  }

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    throw new Error("Réponse MAL sans access_token.");
  }

  const expiresAt =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt,
  };
}

/**
 * @description Extrait access_token / code depuis une URL de callback tracker.
 */
export function parseTrackerCallbackUrl(rawUrl: string): {
  accessToken: string | null;
  expiresIn: number | null;
  code: string | null;
  state: string | null;
  error: string | null;
} {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    url = new URL(rawUrl.replace(/^mangatheque:/, "https://mangatheque.local"));
  }

  const hashParams = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  const query = url.searchParams;

  const accessToken =
    hashParams.get("access_token") ?? query.get("access_token");
  const expiresRaw = hashParams.get("expires_in") ?? query.get("expires_in");
  const expiresIn = expiresRaw ? Number(expiresRaw) : null;

  return {
    accessToken,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
    code: query.get("code") ?? hashParams.get("code"),
    state: query.get("state") ?? hashParams.get("state"),
    error:
      query.get("error_description") ??
      query.get("error") ??
      hashParams.get("error_description") ??
      hashParams.get("error"),
  };
}
