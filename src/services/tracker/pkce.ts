/**
 * @description Génère un code_verifier PKCE (MAL).
 */
export function createPkceVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

/**
 * @description Calcule le code_challenge S256 pour MAL (challenge = verifier plain).
 * MAL exige code_challenge_method=plain pour la plupart des apps publiques.
 */
export function createMalCodeChallenge(verifier: string): string {
  return verifier;
}

/**
 * @description Génère un state OAuth aléatoire.
 */
export function createOauthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
