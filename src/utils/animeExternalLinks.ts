/** Sections de fiche ADKami connues. */
export type AdkamiSection = "anime" | "hentai" | "drama" | string;

const ADKAMI_URL_RE =
  /adkami\.com\/(anime|hentai|drama)\/(\d+)(?:\/|$|\?|#)/i;

/**
 * @description Construit l'URL fiche ADKami (anime, hentai, drama…).
 * @param adkamiId - Identifiant numérique ADKami.
 * @param section - Segment d'URL (défaut : anime).
 */
export function buildAdkamiAnimeUrl(
  adkamiId: number,
  section: AdkamiSection = "anime",
): string {
  const seg = normalizeAdkamiSection(section);
  return `https://www.adkami.com/${seg}/${adkamiId}`;
}

/**
 * @description Normalise le segment d'URL ADKami (défaut anime).
 */
export function normalizeAdkamiSection(
  value: string | null | undefined,
): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "hentai" || raw === "drama" || raw === "anime") return raw;
  if (/^[a-z0-9_-]+$/i.test(raw)) return raw;
  return "anime";
}

/**
 * @description Extrait l'ID et la section depuis une URL ou un texte ADKami.
 * @param raw - URL complète, chemin, ou ID numérique.
 */
export function parseAdkamiUrl(raw: string | null | undefined): {
  adkamiId: number;
  section: string;
} | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 0 && /^\d+$/.test(trimmed)) {
    return { adkamiId: asNumber, section: "anime" };
  }

  const match = trimmed.match(ADKAMI_URL_RE);
  if (!match) return null;
  const section = normalizeAdkamiSection(match[1]);
  const adkamiId = Number(match[2]);
  if (!Number.isFinite(adkamiId) || adkamiId <= 0) return null;
  return { adkamiId, section };
}

/**
 * @description Construit l'URL fiche MyAnimeList animé.
 */
export function buildMalAnimeUrl(malId: number): string {
  return `https://myanimelist.net/anime/${malId}`;
}

/**
 * @description Indique si une URL ressemble à une fiche Nautiljon animé.
 */
export function isNautiljonAnimeUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return /nautiljon\.com\/animes\//i.test(url.trim());
}
