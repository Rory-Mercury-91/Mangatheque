/**
 * @description Extrait les paramètres OAuth / récupération depuis une URL (hash ou query).
 * @param rawUrl - URL complète du callback ou de la page courante.
 */
export function extractAuthParams(rawUrl: string): URLSearchParams {
  const hashIndex = rawUrl.indexOf("#");
  if (hashIndex >= 0) {
    const fragment = rawUrl.slice(hashIndex + 1);
    const routeSplit = fragment.indexOf("?");
    if (routeSplit >= 0) {
      return new URLSearchParams(fragment.slice(routeSplit + 1));
    }
    if (fragment.includes("=") && !fragment.startsWith("/")) {
      return new URLSearchParams(fragment);
    }
    if (fragment.includes("?")) {
      const queryStart = fragment.lastIndexOf("?");
      return new URLSearchParams(fragment.slice(queryStart + 1));
    }
  }

  const queryIndex = rawUrl.indexOf("?");
  if (queryIndex >= 0) {
    return new URLSearchParams(rawUrl.slice(queryIndex + 1));
  }

  return new URLSearchParams();
}

/**
 * @description Indique si l'URL correspond à un lien de récupération de mot de passe.
 * @param rawUrl - URL à analyser.
 */
export function isRecoveryAuthUrl(rawUrl: string): boolean {
  return extractAuthParams(rawUrl).get("type") === "recovery";
}
