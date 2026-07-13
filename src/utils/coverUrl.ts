const NAUTILJON_BASE = "https://www.nautiljon.com";

/**
 * @description Rend une URL Nautiljon relative ou protocol-relative absolue.
 */
function toAbsoluteNautiljonUrl(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }
  return `${NAUTILJON_BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/**
 * @description Indique si l'URL provient de Nautiljon (absolue ou chemin relatif).
 */
function isNautiljonCoverUrl(url: string): boolean {
  return url.includes("nautiljon.com") || url.startsWith("/");
}

/**
 * @description Convertit une URL de couverture Nautiljon miniature en URL pleine résolution.
 * @param url - URL brute (relative ou absolue).
 * @returns URL normalisée, ou chaîne vide si absente.
 */
export function normalizeCoverImageUrl(url: string | null | undefined): string {
  if (!url?.trim()) {
    return "";
  }

  let normalized = url.trim();
  if (!isNautiljonCoverUrl(normalized)) {
    return normalized;
  }

  normalized = toAbsoluteNautiljonUrl(normalized);
  normalized = normalized
    .replace(/\/imagesmin\//gi, "/images/")
    .replace(/\/mini\//gi, "/")
    .replace(/\?1(\d{10,})/, "?$1");

  return normalized;
}

/**
 * @description Prépare une URL de couverture pour persistance en base (null si vide).
 */
export function persistCoverImageUrl(
  url: string | null | undefined,
): string | null {
  const normalized = normalizeCoverImageUrl(url);
  return normalized || null;
}
