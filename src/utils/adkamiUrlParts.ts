/**
 * Types de contenu ADKami (3ᵉ segment d'URL).
 * @see https://www.adkami.com/anime/{id}/{ep}/{type}/{audio}/{saison}/
 */
export const ADKAMI_CONTENT_TYPE = {
  EPISODE: 1,
  OAV: 2,
  FILM: 3,
  SPECIAL: 4,
  OPENING: 6,
  ENDING: 7,
  PV: 8,
} as const;

export type AdkamiContentTypeCode =
  (typeof ADKAMI_CONTENT_TYPE)[keyof typeof ADKAMI_CONTENT_TYPE];

/** Types inclus dans les plages / attribution (hors OP/ED/PV). */
export const ADKAMI_MAPPABLE_CONTENT_TYPES: readonly number[] = [
  ADKAMI_CONTENT_TYPE.EPISODE,
  ADKAMI_CONTENT_TYPE.OAV,
  ADKAMI_CONTENT_TYPE.FILM,
  ADKAMI_CONTENT_TYPE.SPECIAL,
];

/** Préférence audio ADKami (4ᵉ segment). */
export type AdkamiAudioPreference = "vostfr" | "vf";

export const ADKAMI_AUDIO_CODE = {
  vf: 1,
  vostfr: 2,
} as const;

/** Parties d'une URL épisode ADKami. */
export interface AdkamiEpisodeUrlParts {
  section: string;
  adkamiId: number;
  episodeNumber: number;
  contentType: number;
  audio: number;
  seasonIndex: number;
  pageUrl: string;
}

/**
 * @description Libellé français d'un type de contenu ADKami connu.
 */
export function formatAdkamiContentTypeLabel(code: number): string {
  switch (code) {
    case ADKAMI_CONTENT_TYPE.EPISODE:
      return "Épisode";
    case ADKAMI_CONTENT_TYPE.OAV:
      return "OAV";
    case ADKAMI_CONTENT_TYPE.FILM:
      return "Film";
    case ADKAMI_CONTENT_TYPE.SPECIAL:
      return "Spécial";
    case ADKAMI_CONTENT_TYPE.OPENING:
      return "Opening";
    case ADKAMI_CONTENT_TYPE.ENDING:
      return "Ending";
    case ADKAMI_CONTENT_TYPE.PV:
      return "PV";
    default:
      return `Type ${code}`;
  }
}

/**
 * @description Indique si le type est connu du catalogue applicatif.
 */
export function isKnownAdkamiContentType(code: number): boolean {
  return (
    code === ADKAMI_CONTENT_TYPE.EPISODE ||
    code === ADKAMI_CONTENT_TYPE.OAV ||
    code === ADKAMI_CONTENT_TYPE.FILM ||
    code === ADKAMI_CONTENT_TYPE.SPECIAL ||
    code === ADKAMI_CONTENT_TYPE.OPENING ||
    code === ADKAMI_CONTENT_TYPE.ENDING ||
    code === ADKAMI_CONTENT_TYPE.PV
  );
}

/**
 * @description Parse une URL épisode ADKami complète en segments.
 * Ex. `/anime/3070/88/1/2/4/` → id 3070, ép. 88, type 1, audio 2, saison 4.
 */
export function parseAdkamiEpisodeUrlParts(
  url: string | null | undefined,
): AdkamiEpisodeUrlParts | null {
  if (!url?.trim()) return null;
  const match = url
    .trim()
    .match(
      /adkami\.com\/(anime|hentai|drama)\/(\d+)\/(\d+(?:\.\d+)?)\/(\d+)\/(\d+)\/(\d+)/i,
    );
  if (!match) return null;
  const adkamiId = Number(match[2]);
  const episodeNumber = Number(match[3]);
  const contentType = Number(match[4]);
  const audio = Number(match[5]);
  const seasonIndex = Number(match[6]);
  if (
    !Number.isFinite(adkamiId) ||
    adkamiId <= 0 ||
    !Number.isFinite(episodeNumber) ||
    episodeNumber < 0 ||
    !Number.isFinite(contentType) ||
    !Number.isFinite(audio) ||
    !Number.isFinite(seasonIndex) ||
    seasonIndex <= 0
  ) {
    return null;
  }
  return {
    section: match[1]!.toLowerCase(),
    adkamiId,
    episodeNumber,
    contentType,
    audio,
    seasonIndex,
    pageUrl: url.trim(),
  };
}

/**
 * @description Code audio attendu selon la préférence utilisateur.
 */
export function adkamiAudioCodeForPreference(
  preference: AdkamiAudioPreference,
): number {
  return ADKAMI_AUDIO_CODE[preference];
}
