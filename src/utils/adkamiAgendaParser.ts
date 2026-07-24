import { normalizeTitleForComparison } from "@/utils/textNormalize";
import { buildAdkamiAnimeUrl } from "@/utils/animeExternalLinks";

/** Entrée agenda ADKami (semaine). */
export interface AdkamiAgendaEntry {
  adkamiId: number;
  episodeNumber: number | null;
  episodeLabel: string;
  title: string;
  /** Epoch secondes (attribut data-time). */
  releaseAtUnix: number;
  dayLabel: string;
  coverUrl: string | null;
  pageUrl: string;
  isVf: boolean;
  isSpecial: boolean;
}

/**
 * @description Retire les suffixes de saison type « S2 » pour le match titre.
 */
export function stripAnimeSeasonSuffix(title: string): string {
  return title
    .replace(/\s+S\d+\s*$/i, "")
    .replace(/\s+Season\s*\d+\s*$/i, "")
    .trim();
}

/**
 * @description Normalise un titre animé pour comparaison ADKami ↔ catalogue.
 */
export function normalizeAdkamiTitle(title: string): string {
  return normalizeTitleForComparison(stripAnimeSeasonSuffix(title))
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @description Parse le HTML de l'agenda ADKami (semaine).
 * Gère les colonnes avec attributs (ex. style Jeudi) et les deux layouts
 * (lien autour de la carte vs lien uniquement sur le titre).
 */
export function parseAdkamiAgendaHtml(html: string): AdkamiAgendaEntry[] {
  const entries: AdkamiAgendaEntry[] = [];
  const columns = html.split(/<div\s+class="colone"[^>]*>/i).slice(1);

  for (const column of columns) {
    const dayMatch = column.match(/<h3>([^<]+)<\/h3>/i);
    const dayLabel = dayMatch?.[1]?.trim() ?? "";

    const startRegex =
      /(?:<a\s+href="(https?:\/\/[^"]*\/(?:anime|hentai|drama)\/\d+[^"]*)"\s*>\s*)?<div\s+class="col-12 episode[^"]*"\s+data-info="([^"]+)"/gi;

    let startMatch: RegExpExecArray | null;
    while ((startMatch = startRegex.exec(column)) !== null) {
      const wrapperUrl = startMatch[1]?.trim() || null;
      const dataInfo = startMatch[2];
      const rest = column.slice(startMatch.index + startMatch[0].length);
      const bodyMatch = rest.match(
        /^([\s\S]*?)<div class="info">([\s\S]*?)<\/div>\s*<\/div>/i,
      );
      if (!bodyMatch) continue;

      const beforeInfo = bodyMatch[1];
      const infoHtml = bodyMatch[2];

      const infoParts = dataInfo.split(",").map((p) => Number(p.trim()));
      const adkamiId = infoParts[0];
      if (!Number.isFinite(adkamiId) || adkamiId <= 0) continue;

      const coverMatch = beforeInfo.match(/<img[^>]+src="([^"]+)"/i);
      const timeMatch = beforeInfo.match(/data-time="(\d+)"/i);
      const episMatch = infoHtml.match(/<p class="epis">([\s\S]*?)<\/p>/i);
      const titleMatch = infoHtml.match(
        /<p class="title"[^>]*(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/p>/i,
      );
      const innerUrlMatch = infoHtml.match(
        /href="(https?:\/\/[^"]*\/(?:anime|hentai|drama)\/\d+[^"]*)"/i,
      );

      const releaseAtUnix = timeMatch ? Number(timeMatch[1]) : NaN;
      const episodeLabel = decodeHtml(episMatch?.[1] ?? "").trim();
      const title = decodeHtml(titleMatch?.[1] || titleMatch?.[2] || "").trim();
      if (!title || !Number.isFinite(releaseAtUnix)) continue;

      const episodeFromInfo =
        Number.isFinite(infoParts[1]) && infoParts[1] > 0 ? infoParts[1] : null;
      const episodeFromLabel = parseEpisodeNumber(episodeLabel);
      const pageUrl =
        wrapperUrl ||
        innerUrlMatch?.[1]?.trim() ||
        buildAdkamiAnimeUrl(adkamiId);

      entries.push({
        adkamiId,
        episodeNumber: episodeFromLabel ?? episodeFromInfo,
        episodeLabel,
        title,
        releaseAtUnix,
        dayLabel,
        coverUrl: coverMatch?.[1]?.trim() || null,
        pageUrl,
        isVf: /\bvf\b/i.test(episodeLabel),
        isSpecial: !/^episode\b/i.test(episodeLabel.trim()),
      });
    }
  }

  return entries;
}

/**
 * @description Extrait le n° d'épisode depuis un libellé « Episode 9 multi ».
 */
function parseEpisodeNumber(label: string): number | null {
  const match = label.match(/episode\s+(\d+)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}
