import type { ScrapePayloadV1 } from "@/types/database";
import { absolutizeNautiljonUrl } from "@/utils/nautiljonSearchParser";
import { normalizeCoverImageUrl } from "@/utils/coverUrl";
import { normalizeMediaTag } from "@/constants/mediaTags";
import { mapNautiljonReadingStatus } from "@/services/importMapService";
import {
  extractNautiljonVfVolumeRows,
  parseNautiljonPriceEur,
} from "@/utils/nautiljonVolumeParser";

export { extractNautiljonVolumeDetailsFromHtml } from "@/utils/nautiljonVolumeParser";

/**
 * @description Parse le HTML d'une fiche manga/animé Nautiljon en payload d'import v1.
 * Couvre métadonnées série + liste de tomes VF déjà sortis (comme Tampermonkey).
 * Genres / thèmes / type sont lus sur les lignes labellisées (comme le userscript).
 * @param html - Document HTML brut de la fiche.
 * @param pageUrl - URL canonique de la fiche.
 */
export function parseNautiljonMangaPageHtml(
  html: string,
  pageUrl: string,
): ScrapePayloadV1 {
  const title =
    extractH1Title(html) ||
    extractItemprop(html, "name") ||
    "Sans titre";

  const synopsis =
    extractClassBlock(html, "description") ||
    extractItemprop(html, "description") ||
    undefined;

  const coverRaw =
    extractCoverFromFiche(html) ||
    extractItempropContent(html, "image") ||
    null;

  // Type (Shonen…) : lien dans la ligne « Type : », pas Type volume.
  const demographicType =
    extractMetaLinks(html, ["Type"], { exactLabel: true })[0] ||
    extractMetaPlainText(html, ["Type"], { exactLabel: true }) ||
    undefined;

  // Ne pas utiliser itemprop=genre (Nautiljon y met aussi les thèmes).
  const genres = extractMetaLinks(html, ["Genres", "Genre"]);
  const themes = extractMetaLinks(html, ["Thèmes", "Thème"]);

  const publisherVf =
    extractMetaLinks(html, ["Éditeurs VF", "Éditeur VF", "Editeur VF"])[0] ||
    extractMetaPlainText(html, ["Éditeurs VF", "Éditeur VF", "Editeur VF"]) ||
    undefined;

  const vfCount = parseOptionalInt(
    extractMetaPlainText(html, ["Nb volumes VF", "Nb. volumes VF"]),
  );
  const voCount = parseOptionalInt(
    extractMetaPlainText(html, ["Nb volumes VO", "Nb. volumes VO"]),
  );
  const chaptersVfCount = parseOptionalInt(
    extractMetaPlainText(html, [
      "Nb chapitres VF",
      "Nb. chapitres VF",
      "Nb chapitres",
    ]),
  );
  const chaptersVoTotal = parseOptionalInt(
    extractMetaPlainText(html, ["Nb chapitres VO", "Nb. chapitres VO"]),
  );

  const statusLabel =
    extractParenStatus(html, "Nb volumes VF") ||
    extractParenStatus(html, "Nb chapitres VF") ||
    extractMetaPlainText(html, ["Statut VF"]) ||
    null;
  const readingStatus = mapNautiljonReadingStatus(statusLabel);

  const volumes = extractNautiljonVfVolumeRows(html, pageUrl, vfCount);
  const defaultPrice = extractDefaultPrice(html);
  const webcomic = /Webcomic\s*:?\s*Oui/i.test(html);

  const preferChapters =
    webcomic ||
    ((vfCount == null || vfCount <= 0) &&
      (chaptersVfCount != null ||
        chaptersVoTotal != null ||
        volumes.length > 0));

  const volumesWithPrice =
    defaultPrice != null
      ? volumes.map((volume) => ({
          ...volume,
          catalogPrice: volume.catalogPrice ?? defaultPrice,
        }))
      : volumes;

  return {
    schemaVersion: 1,
    title: title.trim(),
    demographicType: demographicType
      ? normalizeMediaTag(demographicType.trim())
      : undefined,
    genres: genres.length ? genres : undefined,
    themes: themes.length ? themes : undefined,
    publisherVf: publisherVf?.trim() || undefined,
    volumesVfCount: vfCount ?? undefined,
    volumesVoTotal: voCount ?? undefined,
    chaptersVfCount: chaptersVfCount ?? undefined,
    chaptersVoTotal: chaptersVoTotal ?? undefined,
    hasVolumeTracking: !preferChapters,
    hasChapterTracking: preferChapters,
    trackingUnit: preferChapters ? "chapter" : "volume",
    synopsis: synopsis?.trim() || undefined,
    coverUrl: coverRaw ? normalizeCoverImageUrl(coverRaw) : undefined,
    sourceUrl: pageUrl.trim(),
    readingStatus: readingStatus ?? undefined,
    defaultPrice: defaultPrice ?? undefined,
    volumes: volumesWithPrice.length ? volumesWithPrice : undefined,
  };
}

function extractItemprop(html: string, prop: string): string | null {
  const re = new RegExp(
    `itemprop="${prop}"[^>]*>([^<]{1,300})<`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] ? decodeHtml(m[1]).trim() : null;
}

function extractItempropContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `itemprop="${prop}"[^>]*content="([^"]+)"`,
    "i",
  );
  const m = html.match(re);
  return m?.[1]?.trim() || null;
}

function extractH1Title(html: string): string | null {
  const m =
    html.match(/class="h1titre"[^>]*>[\s\S]*?itemprop="name"[^>]*>([^<]+)</i) ||
    html.match(/<h1[^>]*>\s*<span[^>]*itemprop="name"[^>]*>([^<]+)</i) ||
    html.match(/<h1[^>]*>([\s\S]{2,200}?)<\/h1>/i);
  if (!m?.[1]) return null;
  return decodeHtml(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractClassBlock(html: string, className: string): string | null {
  const re = new RegExp(
    `class="${className}"[^>]*>([\\s\\S]{20,4000}?)</div>`,
    "i",
  );
  const m = html.match(re);
  if (!m?.[1]) return null;
  return decodeHtml(m[1].replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s*Lire la suite\s*/gi, "")
    .trim();
}

function extractCoverFromFiche(html: string): string | null {
  const m =
    html.match(
      /class="image_fiche[^"]*"[^>]*>[\s\S]{0,800}?src="([^"]+)"/i,
    ) ||
    html.match(/itemprop="image"[^>]*src="([^"]+)"/i) ||
    html.match(/src="([^"]*\/images\/manga\/[^"]+)"/i);
  if (!m?.[1]) return null;
  return absolutizeNautiljonUrl(m[1]);
}

/**
 * @description Extrait les liens d'une ligne métadonnée labellisée (Genres, Thèmes…).
 */
function extractMetaLinks(
  html: string,
  labels: string[],
  options?: { exactLabel?: boolean },
): string[] {
  const chunk = findMetaChunk(html, labels, options);
  if (!chunk) return [];
  const links: string[] = [];
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk)) != null) {
    const text = decodeHtml(stripTags(m[1] ?? ""))
      .replace(/\s+/g, " ")
      .trim();
    if (text && !links.includes(text)) links.push(text);
  }
  return links;
}

/**
 * @description Texte brut d'une ligne métadonnée (sans les liens exclusifs).
 */
function extractMetaPlainText(
  html: string,
  labels: string[],
  options?: { exactLabel?: boolean },
): string | null {
  const chunk = findMetaChunk(html, labels, options);
  if (!chunk) return null;
  // Si des liens existent, prendre le premier (évite « Pika - Shojo »).
  const links = extractMetaLinks(html, labels, options);
  if (links.length > 0) return links[0] ?? null;
  const text = decodeHtml(stripTags(chunk))
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

/**
 * @description Tranche HTML après le libellé jusqu'à la fin du `<li>` (ou équivalent).
 */
function findMetaChunk(
  html: string,
  labels: string[],
  options?: { exactLabel?: boolean },
): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Exact : « Type : » ne matche pas « Type volume : ».
    const labelPattern = options?.exactLabel
      ? `${escaped}(?!\\s*(?:volume|VO|VF)\\b)`
      : escaped;
    const re = new RegExp(
      `(?:<(?:span|b|strong)[^>]*>\\s*)?${labelPattern}\\s*:\\s*(?:</(?:span|b|strong)>)?([\\s\\S]{0,600}?)(?:</li>|<li\\b|</ul>)`,
      "i",
    );
    const m = html.match(re);
    if (m?.[1]?.trim()) return m[1];
  }
  return null;
}

function extractParenStatus(html: string, nearLabel: string): string | null {
  const escaped = nearLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}[\\s\\S]{0,120}?\\(([^)]{2,40})\\)`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] ? decodeHtml(m[1]).trim() : null;
}

function parseOptionalInt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @description Prix indicatif série (ligne « Prix : »).
 */
function extractDefaultPrice(html: string): number | null {
  const fromMeta = extractMetaPlainText(html, ["Prix"]);
  const parsedMeta = parseNautiljonPriceEur(fromMeta);
  if (parsedMeta != null) return parsedMeta;

  const m = html.match(/Prix\s*:?\s*(\d+[,.]\d{2})\s*€?/i);
  return m?.[1] ? parseNautiljonPriceEur(m[1]) : null;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
}
