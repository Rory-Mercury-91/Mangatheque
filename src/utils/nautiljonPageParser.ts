import type { ScrapePayloadV1 } from "@/types/database";
import { absolutizeNautiljonUrl } from "@/utils/nautiljonSearchParser";
import { normalizeCoverImageUrl } from "@/utils/coverUrl";
import { mapNautiljonReadingStatus } from "@/services/importMapService";

/**
 * @description Parse le HTML d'une fiche manga/animé Nautiljon en payload d'import v1.
 * Couvre métadonnées série + liste de tomes (numéros) si présents dans la page.
 * Les couvertures/prix par tome restent à enrichir via Tampermonkey si besoin.
 * @param html - Document HTML brut de la fiche.
 * @param pageUrl - URL canonique de la fiche.
 */
export function parseNautiljonMangaPageHtml(
  html: string,
  pageUrl: string,
): ScrapePayloadV1 {
  const title =
    extractItemprop(html, "name") ||
    extractH1Title(html) ||
    "Sans titre";

  const synopsis =
    extractClassBlock(html, "description") ||
    extractItemprop(html, "description") ||
    undefined;

  const coverRaw =
    extractCoverFromFiche(html) ||
    extractItempropContent(html, "image") ||
    null;

  const demographicType =
    extractMetaLine(html, "Type") ||
    extractMetaLine(html, "Type VO") ||
    undefined;

  const genres = extractItempropAll(html, "genre");
  const themes = splitMetaList(extractMetaLine(html, "Thème") || extractMetaLine(html, "Thèmes"));

  const publisherVf =
    extractMetaLine(html, "Éditeur VF") ||
    extractMetaLine(html, "Editeur VF") ||
    undefined;

  const vfCount = parseOptionalInt(
    extractMetaLine(html, "Nb volumes VF") ||
      extractMetaLine(html, "Nb. volumes VF"),
  );
  const voCount = parseOptionalInt(
    extractMetaLine(html, "Nb volumes VO") ||
      extractMetaLine(html, "Nb. volumes VO"),
  );

  const statusLabel =
    extractParenStatus(html, "Nb volumes VF") ||
    extractMetaLine(html, "Statut VF") ||
    null;
  const readingStatus = mapNautiljonReadingStatus(statusLabel);

  const volumes = extractVolumeRows(html, pageUrl);

  return {
    schemaVersion: 1,
    title: title.trim(),
    demographicType: demographicType?.trim() || undefined,
    genres: genres.length ? genres : undefined,
    themes: themes.length ? themes : undefined,
    publisherVf: publisherVf?.trim() || undefined,
    volumesVfCount: vfCount ?? undefined,
    volumesVoTotal: voCount ?? undefined,
    hasVolumeTracking: true,
    hasChapterTracking: false,
    synopsis: synopsis?.trim() || undefined,
    coverUrl: coverRaw ? normalizeCoverImageUrl(coverRaw) : undefined,
    sourceUrl: pageUrl.trim(),
    readingStatus: readingStatus ?? undefined,
    volumes: volumes.length ? volumes : undefined,
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

function extractItempropAll(html: string, prop: string): string[] {
  const re = new RegExp(`itemprop="${prop}"[^>]*>([^<]{1,80})<`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    const v = decodeHtml(m[1] ?? "").trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
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
      /class="image_fiche[^"]*"[^>]*>[\s\S]{0,400}?src="([^"]+)"/i,
    ) ||
    html.match(
      /class="image_fiche[^"]*"[\s\S]{0,400}?src="([^"]+)"/i,
    );
  if (!m?.[1]) return null;
  return absolutizeNautiljonUrl(m[1]);
}

/**
 * @description Lit une ligne « Libellé : valeur » dans le HTML métadonnées.
 */
function extractMetaLine(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}\\s*:\\s*</(?:span|b|strong)>\\s*([^<]{1,200})`,
    "i",
  );
  const m = html.match(re);
  if (m?.[1]) return decodeHtml(m[1]).trim();

  const re2 = new RegExp(
    `${escaped}\\s*:\\s*([^<\\n]{1,200})`,
    "i",
  );
  const m2 = html.match(re2);
  return m2?.[1] ? decodeHtml(m2[1]).trim() : null;
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

function splitMetaList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,|/•·]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseOptionalInt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @description Extrait les tomes listés sur la fiche (liens volume-N).
 */
function extractVolumeRows(
  html: string,
  pageUrl: string,
): NonNullable<ScrapePayloadV1["volumes"]> {
  const seriesSlug = pageUrl.match(
    /nautiljon\.com\/(?:mangas|animes|artbook|manhwa|manhua)\/([^/?#]+)\.html/i,
  )?.[1];
  if (!seriesSlug) return [];

  const escaped = seriesSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `href="(/[^"]*/${escaped}/volume-(\\d+)(?:,\\d+)?\\.html)"`,
    "gi",
  );
  const seen = new Set<number>();
  const volumes: NonNullable<ScrapePayloadV1["volumes"]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    const num = Number(m[2]);
    if (!Number.isFinite(num) || num <= 0 || seen.has(num)) continue;
    seen.add(num);
    volumes.push({
      volumeNumber: num,
      volumeLabel: `Tome ${num}`,
    });
  }
  volumes.sort(
    (a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0),
  );
  return volumes;
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
