import { normalizeCoverImageUrl } from "@/utils/coverUrl";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import {
  parseVolumeNumberFromHref,
  parseVolumeNumberFromText,
} from "@/utils/volumeNumber";

const NAUTILJON_BASE = "https://www.nautiljon.com";

/** Entrée tome extraite du planning Nautiljon. */
export interface PlanningVolumeEntry {
  nautiljonId: string;
  releaseDate: string;
  volumeNumber: number;
  seriesTitle: string;
  seriesSlug: string;
  coverUrl: string | null;
  priceEur: number | null;
  volumePageUrl: string;
}

/**
 * @description Normalise un slug Nautiljon pour comparaison.
 */
export function normalizeNautiljonSlug(slug: string): string {
  const decoded = decodeURIComponent(slug.replace(/\+/g, " "));
  return normalizeTitleForComparison(decoded.replace(/-/g, " "));
}

/**
 * @description Extrait le slug série depuis une URL source Nautiljon.
 */
export function extractNautiljonSlug(sourceUrl: string | null): string | null {
  if (!sourceUrl?.trim()) return null;
  const match = sourceUrl.match(/\/mangas\/([^/?#]+)/i);
  if (!match) return null;
  return normalizeNautiljonSlug(match[1]);
}

function parseFrDateToIso(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

/**
 * @description Accepte une date ISO déjà présente (ex. data-planning-date).
 */
function parseIsoDate(value: string): string | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function toAbsoluteNautiljonUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `${NAUTILJON_BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function extractSeriesTitleFromVolumeLabel(label: string): string {
  return label
    .replace(/\s+Vol\.?\s*\d+(?:[.,]\d+)?(?:\s*[-–].*)?\s*$/i, "")
    .replace(/\s+\d+(?:[.,]\d+)?\s*$/, "")
    .trim();
}

/**
 * @description Ignore les packs / intégrales sans tome unique exploitable.
 */
function isNonSingleVolumeRelease(href: string, label: string): boolean {
  const haystack = `${decodeURIComponent(href.replace(/\+/g, " "))} ${label}`.toLowerCase();
  if (/int[ée]grale|pack\s*d[ée]couverte|vol\.\s*\d+\s*[àa]\s*\d+/i.test(haystack)) {
    return true;
  }
  // Coffret sans « Vol. N » explicite (ex. Coffret Intégrale).
  if (/coffret/i.test(haystack) && !/vol\.?\s*\d+/i.test(haystack)) {
    return true;
  }
  return false;
}

/**
 * @description Extrait la date de sortie d'une ligne planning (nouveau ou ancien HTML).
 */
function extractReleaseDate(rowOpenTag: string, rowHtml: string): string | null {
  const attrMatch = rowOpenTag.match(
    /data-planning-date=["'](\d{4}-\d{2}-\d{2})["']/i,
  );
  if (attrMatch) {
    return parseIsoDate(attrMatch[1]);
  }
  const tdMatch = rowHtml.match(/<td>(\d{1,2}\/\d{1,2}\/\d{4})<\/td>/i);
  if (tdMatch) {
    return parseFrDateToIso(tdMatch[1]);
  }
  return null;
}

/**
 * @description Extrait le lien tome + libellé (URLs relatives ou absolues,
 * y compris éditions collector / coffrets).
 */
function extractVolumeLink(
  rowHtml: string,
): { href: string; label: string } | null {
  // Nouveau HTML : URL absolue + segment volume libre (vol.14 collector, coffret…).
  // Ancien HTML : URL relative /mangas/.../volume-7,123.html
  const absoluteOrRelative =
    /<a[^>]*href=["']((?:https?:\/\/(?:www\.)?nautiljon\.com)?\/mangas\/[^"']+\/volume-[^"'?]+\.html)["'][^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = absoluteOrRelative.exec(rowHtml)) !== null) {
    const href = match[1];
    const tag = match[0];
    const titleAttr = tag.match(/\btitle=["']([^"']+)["']/i)?.[1] ?? "";
    const seriesTitle = rowHtml.match(
      /<span[^>]*class=["'][^"']*planning_series_title[^"']*["'][^>]*>([^<]+)<\/span>/i,
    )?.[1];
    const volumeLabel = rowHtml.match(
      /<span[^>]*class=["'][^"']*planning_volume_number[^"']*["'][^>]*>([^<]+)<\/span>/i,
    )?.[1];

    let label = titleAttr.trim();
    if (seriesTitle && volumeLabel) {
      label = `${seriesTitle.trim()} ${volumeLabel.trim()}`;
    } else if (seriesTitle) {
      label = seriesTitle.trim();
    }
    if (!label) {
      continue;
    }
    return { href, label };
  }
  return null;
}

/**
 * @description Extrait l'URL de couverture (préfère data-preview-image Nautiljon).
 */
function extractCoverUrl(rowHtml: string): string | null {
  const preview = rowHtml.match(
    /data-preview-image=["'](\/images\/[^"']+)["']/i,
  )?.[1];
  if (preview) {
    return normalizeCoverImageUrl(toAbsoluteNautiljonUrl(preview)) || null;
  }
  const imgMatch = rowHtml.match(/<img[^>]*\bsrc=["']([^"']+)["']/i);
  const src = imgMatch?.[1] ?? "";
  // Ignore les chemins locaux d'une page enregistrée (Ctrl+S).
  if (
    !src ||
    src.startsWith("data:") ||
    /_files\//i.test(src) ||
    !/nautiljon\.com|\.webp|\.jpe?g|\.png/i.test(src)
  ) {
    return null;
  }
  return normalizeCoverImageUrl(toAbsoluteNautiljonUrl(src)) || null;
}

/**
 * @description Parse le HTML du planning manga Nautiljon.
 * Compatible ancien format (date en &lt;td&gt;, liens relatifs) et nouveau
 * (data-planning-date, liens absolus, spans titre/volume).
 * @param html - Source HTML de la page planning.
 */
export function parseNautiljonPlanningHtml(html: string): PlanningVolumeEntry[] {
  const entries: PlanningVolumeEntry[] = [];
  const rowRegex =
    /<tr\b([^>]*\bid=["']tr_col_(\d+)["'][^>]*)>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowOpenAttrs = rowMatch[1];
    const nautiljonId = rowMatch[2];
    const rowHtml = rowMatch[3];

    const releaseDate = extractReleaseDate(rowOpenAttrs, rowHtml);
    if (!releaseDate) continue;

    const link = extractVolumeLink(rowHtml);
    if (!link) continue;

    const href = link.href;
    const volumeLabel = link.label;
    const slugMatch = href.match(/\/mangas\/([^/?#]+)\/volume-/i);
    if (!slugMatch) continue;

    const seriesSlug = slugMatch[1];
    if (isNonSingleVolumeRelease(href, volumeLabel)) continue;

    const volumeNumber =
      parseVolumeNumberFromHref(href) ??
      parseVolumeNumberFromText(volumeLabel);
    // Coffrets sans numéro de tome unique : on ignore.
    if (volumeNumber == null || volumeNumber <= 0) continue;

    const structuredTitle = rowHtml.match(
      /<span[^>]*class=["'][^"']*planning_series_title[^"']*["'][^>]*>([^<]+)<\/span>/i,
    )?.[1];
    const seriesTitle = (
      structuredTitle?.trim() ||
      extractSeriesTitleFromVolumeLabel(volumeLabel)
    ).trim();
    if (!seriesTitle) continue;

    const priceMatch = rowHtml.match(/(\d+(?:[.,]\d+)?)\s*(?:&nbsp;|\s)*€/i);
    const priceEur = priceMatch
      ? Number(priceMatch[1].replace(",", "."))
      : null;

    entries.push({
      nautiljonId,
      releaseDate,
      volumeNumber,
      seriesTitle,
      seriesSlug,
      coverUrl: extractCoverUrl(rowHtml),
      priceEur: Number.isFinite(priceEur) ? priceEur : null,
      volumePageUrl: toAbsoluteNautiljonUrl(href),
    });
  }

  return entries;
}
