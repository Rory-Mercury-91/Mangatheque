import {
  ADKAMI_CONTENT_TYPE,
  ADKAMI_MAPPABLE_CONTENT_TYPES,
  adkamiAudioCodeForPreference,
  formatAdkamiContentTypeLabel,
  isKnownAdkamiContentType,
  parseAdkamiEpisodeUrlParts,
  type AdkamiAudioPreference,
  type AdkamiEpisodeUrlParts,
} from "@/utils/adkamiUrlParts";
import { normalizeEpisodeCount } from "@/utils/adkamiAgendaWatched";

/** Lien épisode extrait de la fiche ADKami. */
export interface AdkamiEpisodePageLink extends AdkamiEpisodeUrlParts {
  label: string;
  titleAttr: string | null;
}

/** Résultat du parse de la page fiche. */
export interface AdkamiEpisodePageParseResult {
  adkamiId: number | null;
  section: string;
  links: AdkamiEpisodePageLink[];
  unknownContentTypes: Array<{
    code: number;
    sampleUrl: string;
    label: string;
  }>;
}

/** Groupe d'affichage dans la modale d'attribution. */
export type AdkamiUnitGroupId = "episodes" | "extras" | "oav" | "films";

/**
 * @description Unité de contenu à attribuer (ex. épisodes TV S4, OAV S1…).
 */
export interface AdkamiContentUnit {
  unitKey: string;
  seasonIndex: number;
  contentType: number;
  contentLabel: string;
  /** Sous-libellé (titre ADKami : digression, 24.5…). */
  detailLabel: string | null;
  episodeFrom: number;
  episodeTo: number;
  episodeCount: number;
  sampleUrl: string;
  numberingMode: "continuous" | "reset" | "single";
  groupId: AdkamiUnitGroupId;
}

/**
 * @description Parse le HTML d'une fiche ADKami (liste d'épisodes / saisons).
 * Déduplique sur (épisode, type, saison) après filtre audio.
 */
export function parseAdkamiEpisodePageHtml(
  html: string,
  audioPreference: AdkamiAudioPreference = "vostfr",
): AdkamiEpisodePageParseResult {
  const audioCode = adkamiAudioCodeForPreference(audioPreference);
  const hrefRegex =
    /href="(https?:\/\/[^"]*adkami\.com\/(?:anime|hentai|drama)\/\d+\/\d+(?:\.\d+)?\/\d+\/\d+\/\d+\/?[^"]*)"/gi;

  const rawLinks: AdkamiEpisodePageLink[] = [];
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    const pageUrl = match[1]!.trim();
    const parts = parseAdkamiEpisodeUrlParts(pageUrl);
    if (!parts) continue;

    const around = html.slice(
      Math.max(0, match.index - 20),
      Math.min(html.length, match.index + match[0].length + 120),
    );
    const labelMatch = around.match(/>([^<]{1,80})</);
    const titleMatch = around.match(/\btitle="([^"]*)"/i);
    rawLinks.push({
      ...parts,
      label: decodeHtml(labelMatch?.[1] ?? "").trim() || parts.pageUrl,
      titleAttr: titleMatch?.[1] ? decodeHtml(titleMatch[1]).trim() : null,
    });
  }

  const unknownMap = new Map<
    number,
    { code: number; sampleUrl: string; label: string }
  >();
  for (const link of rawLinks) {
    if (!isKnownAdkamiContentType(link.contentType)) {
      if (!unknownMap.has(link.contentType)) {
        unknownMap.set(link.contentType, {
          code: link.contentType,
          sampleUrl: link.pageUrl,
          label: link.label,
        });
      }
    }
  }

  const filtered = rawLinks.filter((link) => link.audio === audioCode);
  const dedup = new Map<string, AdkamiEpisodePageLink>();
  for (const link of filtered) {
    const key = `${link.episodeNumber}|${link.contentType}|${link.seasonIndex}`;
    if (!dedup.has(key)) dedup.set(key, link);
  }

  const links = Array.from(dedup.values()).sort((a, b) => {
    if (a.seasonIndex !== b.seasonIndex) return a.seasonIndex - b.seasonIndex;
    if (a.contentType !== b.contentType) return a.contentType - b.contentType;
    return a.episodeNumber - b.episodeNumber;
  });

  const first = links[0] ?? rawLinks[0] ?? null;

  return {
    adkamiId: first?.adkamiId ?? null,
    section: first?.section ?? "anime",
    links,
    unknownContentTypes: Array.from(unknownMap.values()),
  };
}

/**
 * @description Analyse les liens mappables en unités saison × type.
 * Les ép. 000 et spéciaux sont des unités individuelles (souvent demi-ép. MAL).
 */
export function analyzeAdkamiContentUnits(
  links: AdkamiEpisodePageLink[],
): AdkamiContentUnit[] {
  const mappable = links.filter((l) =>
    ADKAMI_MAPPABLE_CONTENT_TYPES.includes(l.contentType),
  );
  const numberingMode = detectNumberingMode(mappable);

  const groups = new Map<string, AdkamiEpisodePageLink[]>();
  for (const link of mappable) {
    const key = resolveGroupKey(link);
    const list = groups.get(key) ?? [];
    list.push(link);
    groups.set(key, list);
  }

  const units: AdkamiContentUnit[] = [];
  for (const [key, group] of groups) {
    const first = group[0]!;
    const hint = extractMalEpisodeHint(first.titleAttr, first.label);
    const isZeroEpisode =
      first.contentType === ADKAMI_CONTENT_TYPE.EPISODE &&
      first.episodeNumber === 0;
    const isSpecial = first.contentType === ADKAMI_CONTENT_TYPE.SPECIAL;
    const isSingleExtra = isZeroEpisode || isSpecial;

    const numbers = group
      .map((g) => g.episodeNumber)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);

    let episodeFrom: number;
    let episodeTo: number;
    let episodeCount: number;

    if (isSingleExtra && hint != null && hint > 0) {
      episodeFrom = hint;
      episodeTo = hint;
      episodeCount = 1;
    } else if (isZeroEpisode) {
      episodeFrom = 0;
      episodeTo = 0;
      episodeCount = 1;
    } else {
      episodeFrom = numbers[0] ?? 0;
      episodeTo = numbers[numbers.length - 1] ?? 0;
      episodeCount = numbers.length > 0 ? numbers.length : group.length;
    }

    units.push({
      unitKey: key,
      seasonIndex: first.seasonIndex,
      contentType: first.contentType,
      contentLabel: buildContentLabel(first, hint, isZeroEpisode),
      detailLabel: first.titleAttr?.trim() || null,
      episodeFrom,
      episodeTo,
      episodeCount,
      sampleUrl: first.pageUrl,
      numberingMode,
      groupId: resolveUnitGroupId(first, isZeroEpisode),
    });
  }

  return units.sort((a, b) => {
    const ga = groupOrder(a.groupId);
    const gb = groupOrder(b.groupId);
    if (ga !== gb) return ga - gb;
    if (a.seasonIndex !== b.seasonIndex) return a.seasonIndex - b.seasonIndex;
    if (a.contentType !== b.contentType) return a.contentType - b.contentType;
    return a.episodeFrom - b.episodeFrom;
  });
}

function resolveGroupKey(link: AdkamiEpisodePageLink): string {
  // Épisode 000 : unité individuelle (digression / récap).
  if (
    link.contentType === ADKAMI_CONTENT_TYPE.EPISODE &&
    link.episodeNumber === 0
  ) {
    const hint = extractMalEpisodeHint(link.titleAttr, link.label);
    return `${link.seasonIndex}|1|0|${hint ?? "zero"}`;
  }
  // Spéciaux : une unité par entrée (souvent un demi-épisode MAL).
  if (link.contentType === ADKAMI_CONTENT_TYPE.SPECIAL) {
    const hint = extractMalEpisodeHint(link.titleAttr, link.label);
    return `${link.seasonIndex}|4|${link.episodeNumber}|${hint ?? link.episodeNumber}`;
  }
  // Films : une unité par n°.
  if (link.contentType === ADKAMI_CONTENT_TYPE.FILM) {
    return `${link.seasonIndex}|3|${link.episodeNumber}`;
  }
  // Épisodes normaux / OAV : agrégés par saison.
  return `${link.seasonIndex}|${link.contentType}`;
}

function resolveUnitGroupId(
  link: AdkamiEpisodePageLink,
  isZeroEpisode: boolean,
): AdkamiUnitGroupId {
  if (link.contentType === ADKAMI_CONTENT_TYPE.FILM) return "films";
  if (link.contentType === ADKAMI_CONTENT_TYPE.OAV) return "oav";
  if (link.contentType === ADKAMI_CONTENT_TYPE.SPECIAL || isZeroEpisode) {
    return "extras";
  }
  return "episodes";
}

function buildContentLabel(
  link: AdkamiEpisodePageLink,
  hint: number | null,
  isZeroEpisode: boolean,
): string {
  if (isZeroEpisode) {
    return hint != null
      ? `Ép. 000 → ${formatHint(hint)}`
      : "Ép. 000 (digression / récap)";
  }
  if (link.contentType === ADKAMI_CONTENT_TYPE.SPECIAL) {
    return hint != null
      ? `Spécial → ${formatHint(hint)}`
      : "Spécial";
  }
  if (link.contentType === ADKAMI_CONTENT_TYPE.FILM) {
    return `${formatAdkamiContentTypeLabel(link.contentType)} ${link.episodeNumber}`;
  }
  return formatAdkamiContentTypeLabel(link.contentType);
}

function formatHint(value: number): string {
  const n = normalizeEpisodeCount(value);
  return Number.isInteger(n) ? `ép. ${n}` : `ép. ${n.toFixed(1)}`;
}

/**
 * @description Extrait un n° MAL depuis le titre ADKami (« Épisode 24.5 », « Episode 24.9 »…).
 */
export function extractMalEpisodeHint(
  titleAttr: string | null | undefined,
  label: string = "",
): number | null {
  const text = `${titleAttr ?? ""} ${label}`;
  const match = text.match(/(?:épisode|episode)\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return normalizeEpisodeCount(n);
}

function groupOrder(id: AdkamiUnitGroupId): number {
  switch (id) {
    case "episodes":
      return 0;
    case "extras":
      return 1;
    case "oav":
      return 2;
    case "films":
      return 3;
    default:
      return 9;
  }
}

function detectNumberingMode(
  links: AdkamiEpisodePageLink[],
): "continuous" | "reset" | "single" {
  const episodes = links.filter(
    (l) =>
      l.contentType === ADKAMI_CONTENT_TYPE.EPISODE && l.episodeNumber > 0,
  );
  const bySeason = new Map<number, number[]>();
  for (const link of episodes) {
    const list = bySeason.get(link.seasonIndex) ?? [];
    list.push(link.episodeNumber);
    bySeason.set(link.seasonIndex, list);
  }
  if (bySeason.size <= 1) return "single";

  const seasons = Array.from(bySeason.keys()).sort((a, b) => a - b);
  let looksReset = false;
  let looksContinuous = false;
  for (let i = 1; i < seasons.length; i += 1) {
    const prev = bySeason.get(seasons[i - 1]!)!;
    const curr = bySeason.get(seasons[i]!)!;
    const prevMax = Math.max(...prev);
    const currMin = Math.min(...curr);
    if (currMin <= 1) looksReset = true;
    if (currMin > prevMax) looksContinuous = true;
  }
  if (looksContinuous && !looksReset) return "continuous";
  if (looksReset) return "reset";
  return "continuous";
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
