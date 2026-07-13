import { normalizeCoverImageUrl } from "@/utils/coverUrl";
import {
  normalizeVolumeNumberToken,
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
 * @description Normalise un titre pour comparaison (accents, casse, espaces).
 */
export function normalizeTitleForComparison(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function toAbsoluteNautiljonUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `${NAUTILJON_BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function extractSeriesTitleFromVolumeLabel(label: string): string {
  return label
    .replace(/\s+Vol\.?\s*\d+(?:[.,]\d+)?\s*$/i, "")
    .replace(/\s+\d+(?:[.,]\d+)?\s*$/, "")
    .trim();
}

/**
 * @description Parse le HTML du planning manga Nautiljon.
 * @param html - Source HTML de la page planning.
 */
export function parseNautiljonPlanningHtml(html: string): PlanningVolumeEntry[] {
  const entries: PlanningVolumeEntry[] = [];
  const rowRegex = /<tr id="tr_col_(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const nautiljonId = rowMatch[1];
    const rowHtml = rowMatch[2];
    const dateMatch = rowHtml.match(/<td>(\d{2}\/\d{2}\/\d{4})<\/td>/i);
    const releaseDate = dateMatch ? parseFrDateToIso(dateMatch[1]) : null;
    if (!releaseDate) continue;

    const linkMatch = rowHtml.match(
      /<a href="(\/mangas\/[^"]+\/volume-(?:vol\.\+[\d.,]+|\d+(?:[._-]\d+)?),\d+\.html)"[^>]*title="([^"]+)"/i,
    );
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const volumeLabel = linkMatch[2];
    const slugMatch = href.match(
      /\/mangas\/([^/]+)\/(?:volume-vol\.\+(\d+(?:[.,]\d+)?)|volume-(\d+(?:[._-]\d+)?)),/i,
    );
    if (!slugMatch) continue;

    const seriesSlug = slugMatch[1];
    const volumeNumber =
      normalizeVolumeNumberToken(slugMatch[2] ?? slugMatch[3]) ??
      parseVolumeNumberFromText(volumeLabel);
    if (volumeNumber == null || volumeNumber <= 0) continue;

    const imgMatch = rowHtml.match(/<img src="([^"]+)"/i);
    const coverUrl = normalizeCoverImageUrl(imgMatch?.[1] ?? null) || null;
    const priceMatch = rowHtml.match(/(\d+(?:[.,]\d+)?)\s*(?:&nbsp;|\s)*€/i);
    const priceEur = priceMatch
      ? Number(priceMatch[1].replace(",", "."))
      : null;

    entries.push({
      nautiljonId,
      releaseDate,
      volumeNumber,
      seriesTitle: extractSeriesTitleFromVolumeLabel(volumeLabel),
      seriesSlug,
      coverUrl,
      priceEur: Number.isFinite(priceEur) ? priceEur : null,
      volumePageUrl: toAbsoluteNautiljonUrl(href),
    });
  }

  return entries;
}
