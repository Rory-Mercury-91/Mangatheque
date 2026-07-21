import { openExternalUrl } from "@/services/platform/linkService";
import {
  getAniListClientId,
  getAniListClientSecret,
  getMalClientId,
  getTrackerConfigHelpMessage,
  isTrackerProviderConfigured,
} from "@/services/tracker/trackerConfig";
import { createMalCodeChallenge, createOauthState, createPkceVerifier } from "@/services/tracker/pkce";
import { getTrackerRedirectUrl } from "@/services/tracker/trackerRedirectService";
import type { TrackerProvider } from "@/types/tracker";

const MAL_PKCE_VERIFIER_KEY = "mangatheque:tracker:mal-pkce-verifier";
const OAUTH_STATE_KEY = "mangatheque:tracker:oauth-state";
const OAUTH_REDIRECT_URI_KEY = "mangatheque:tracker:oauth-redirect-uri";
const PENDING_PROVIDER_KEY = "mangatheque:tracker:pending-provider";

/**
 * @description Écrit une valeur OAuth dans localStorage + sessionStorage.
 * localStorage survit au deep link / redémarrage WebView Tauri.
 */
function writeOauthStorage(key: string, value: string): void {
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
 * @description Lit une valeur OAuth (localStorage prioritaire).
 */
function readOauthStorage(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

/**
 * @description Efface une valeur OAuth des deux stocks.
 */
function clearOauthStorage(key: string): void {
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
}

/**
 * @description Mémorise le provider OAuth en cours.
 */
export function storePendingTrackerProvider(provider: TrackerProvider): void {
  writeOauthStorage(PENDING_PROVIDER_KEY, provider);
}

/**
 * @description Lit le provider OAuth en cours (sans l'effacer).
 */
export function peekPendingTrackerProvider(): TrackerProvider | null {
  const raw = readOauthStorage(PENDING_PROVIDER_KEY);
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
  clearOauthStorage(PENDING_PROVIDER_KEY);
  return provider;
}

/**
 * @description Lance l'authentification AniList (Authorization Code + secret).
 */
export async function startAniListOauth(): Promise<void> {
  if (!isTrackerProviderConfigured("anilist")) {
    throw new Error(getTrackerConfigHelpMessage("anilist"));
  }

  const clientId = getAniListClientId();
  const redirectUri = getTrackerRedirectUrl();
  const state = createOauthState();

  writeOauthStorage(OAUTH_STATE_KEY, state);
  writeOauthStorage(OAUTH_REDIRECT_URI_KEY, redirectUri);
  storePendingTrackerProvider("anilist");

  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

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

  writeOauthStorage(MAL_PKCE_VERIFIER_KEY, verifier);
  writeOauthStorage(OAUTH_STATE_KEY, state);
  writeOauthStorage(OAUTH_REDIRECT_URI_KEY, redirectUri);
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
 * @description Échange le code AniList contre un access_token.
 */
export async function exchangeAniListAuthorizationCode(
  code: string,
  state: string | null,
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}> {
  const expectedState = readOauthStorage(OAUTH_STATE_KEY);
  const redirectUri =
    readOauthStorage(OAUTH_REDIRECT_URI_KEY) ?? getTrackerRedirectUrl();
  clearOauthStorage(OAUTH_STATE_KEY);
  clearOauthStorage(OAUTH_REDIRECT_URI_KEY);

  if (expectedState && state && expectedState !== state) {
    throw new Error("État OAuth AniList invalide. Relancez la connexion.");
  }

  const clientSecret = getAniListClientSecret();
  if (!clientSecret) {
    throw new Error(
      "VITE_ANILIST_CLIENT_SECRET manquant — ajoutez le secret AniList dans .env et les secrets GitHub Actions.",
    );
  }

  const { postOauthTokenRequest } = await import(
    "@/services/tracker/oauthHttp"
  );
  const response = await postOauthTokenRequest(
    "https://anilist.co/api/v2/oauth/token",
    "application/json",
    JSON.stringify({
      grant_type: "authorization_code",
      client_id: getAniListClientId(),
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Échange token AniList impossible : ${response.body || response.status}`,
    );
  }

  let json: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  try {
    json = JSON.parse(response.body) as typeof json;
  } catch {
    throw new Error("Réponse AniList invalide (JSON attendu).");
  }

  if (!json.access_token) {
    throw new Error("Réponse AniList sans access_token.");
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
  const expectedState = readOauthStorage(OAUTH_STATE_KEY);
  const verifier = readOauthStorage(MAL_PKCE_VERIFIER_KEY);
  const redirectUri =
    readOauthStorage(OAUTH_REDIRECT_URI_KEY) ?? getTrackerRedirectUrl();
  clearOauthStorage(OAUTH_STATE_KEY);
  clearOauthStorage(MAL_PKCE_VERIFIER_KEY);
  clearOauthStorage(OAUTH_REDIRECT_URI_KEY);

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
    redirect_uri: redirectUri,
  });

  const { postOauthTokenRequest } = await import(
    "@/services/tracker/oauthHttp"
  );
  const response = await postOauthTokenRequest(
    "https://myanimelist.net/v1/oauth2/token",
    "application/x-www-form-urlencoded",
    body.toString(),
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Échange token MAL impossible : ${response.body || response.status}`,
    );
  }

  let json: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  try {
    json = JSON.parse(response.body) as typeof json;
  } catch {
    throw new Error("Réponse MAL invalide (JSON attendu).");
  }

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
