import { normalizeTitleForComparison } from "@/utils/textNormalize";
import { buildAdkamiAnimeUrl } from "@/utils/animeExternalLinks";
import { normalizeEpisodeCount } from "@/utils/adkamiAgendaWatched";

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
 * @description Extrait l'ID et le n° d'épisode depuis une URL fiche ADKami.
 * Ex. `/anime/3070/88/1/2/4/` → `{ adkamiId: 3070, episodeNumber: 88 }`.
 */
export function parseAdkamiEpisodeFromUrl(
  url: string | null | undefined,
): { adkamiId: number; episodeNumber: number | null } | null {
  if (!url?.trim()) return null;
  const match = url
    .trim()
    .match(
      /adkami\.com\/(?:anime|hentai|drama)\/(\d+)(?:\/(\d+(?:\.\d+)?))?/i,
    );
  if (!match) return null;
  const adkamiId = Number(match[1]);
  if (!Number.isFinite(adkamiId) || adkamiId <= 0) return null;
  const episodeRaw = match[2] != null ? Number(match[2]) : null;
  const episodeNumber =
    episodeRaw != null && Number.isFinite(episodeRaw) && episodeRaw > 0
      ? normalizeEpisodeCount(episodeRaw)
      : null;
  return { adkamiId, episodeNumber };
}

/**
 * @description Parse le HTML de l'agenda ADKami (semaine).
 * Identifie la série via l'ID dans l'URL / `data-info` (pas le titre).
 * N° d'épisode : URL > libellé « Episode X » > `data-info`.
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
      const adkamiIdFromInfo = infoParts[0];
      if (!Number.isFinite(adkamiIdFromInfo) || adkamiIdFromInfo <= 0) continue;

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

      const pageUrl =
        wrapperUrl ||
        innerUrlMatch?.[1]?.trim() ||
        buildAdkamiAnimeUrl(adkamiIdFromInfo);

      const fromUrl = parseAdkamiEpisodeFromUrl(pageUrl);
      const adkamiId = fromUrl?.adkamiId ?? adkamiIdFromInfo;

      const episodeFromInfoRaw =
        Number.isFinite(infoParts[1]) && infoParts[1] > 0 ? infoParts[1] : null;
      const episodeFromInfo =
        episodeFromInfoRaw != null
          ? normalizeEpisodeCount(episodeFromInfoRaw)
          : null;
      const episodeFromLabel = parseEpisodeNumber(episodeLabel);
      // Priorité : numéro dans l'URL (fiable) → libellé → data-info.
      const episodeNumber =
        fromUrl?.episodeNumber ?? episodeFromLabel ?? episodeFromInfo;

      entries.push({
        adkamiId,
        episodeNumber,
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
 * @description Extrait le n° d'épisode depuis un libellé (« Episode 9 », « Episode 36.5 »…).
 */
function parseEpisodeNumber(label: string): number | null {
  const match = label.match(/episode\s+(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return normalizeEpisodeCount(n);
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
