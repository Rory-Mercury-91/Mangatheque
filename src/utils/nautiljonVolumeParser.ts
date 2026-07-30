import type { ScrapePayloadV1 } from "@/types/database";
import { absolutizeNautiljonUrl } from "@/utils/nautiljonSearchParser";
import { normalizeCoverImageUrl } from "@/utils/coverUrl";

type VolumeRow = NonNullable<ScrapePayloadV1["volumes"]>[number];

/**
 * @description Convertit une date VF Nautiljon en ISO YYYY-MM-DD.
 */
export function nautiljonDateToIso(raw: string): string | null {
  const trimmed = raw.trim();
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  }

  const monthsFr: Record<string, string> = {
    janvier: "01",
    fevrier: "02",
    mars: "03",
    avril: "04",
    mai: "05",
    juin: "06",
    juillet: "07",
    aout: "08",
    septembre: "09",
    octobre: "10",
    novembre: "11",
    decembre: "12",
  };
  const fr = trimmed.match(/^(\d{1,2})\s+([a-zéûôîàùç]+)\s+(\d{4})$/i);
  if (fr) {
    const monthKey = fr[2]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const month = monthsFr[monthKey];
    if (month) {
      return `${fr[3]}-${month}-${fr[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * @description Extrait la date de parution VF dans un bloc texte.
 */
export function extractReleaseDateVfFromText(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const vfMatch = normalized.match(
    /(?:Date de parution|Parution)\s*VF\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
  );
  if (vfMatch?.[1]) return nautiljonDateToIso(vfMatch[1]);

  const genericMatch = normalized.match(
    /(?:Date de parution|Parution)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
  );
  if (genericMatch?.[1] && genericMatch.index != null) {
    const labelSlice = normalized.slice(
      Math.max(0, genericMatch.index - 5),
      genericMatch.index + 20,
    );
    if (!/VO/i.test(labelSlice)) {
      return nautiljonDateToIso(genericMatch[1]);
    }
  }

  const bare = normalized.match(
    /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
  );
  return bare?.[1] ? nautiljonDateToIso(bare[1]) : null;
}

/**
 * @description Date du jour en ISO (local).
 */
function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * @description Indique si une date ISO est déjà sortie (ou absente = on conserve).
 */
export function isNautiljonVolumeReleased(releaseDate?: string | null): boolean {
  const iso = releaseDate?.trim();
  if (!iso) return true;
  return iso <= todayIsoLocal();
}

/**
 * @description Parse un prix euros (« 7,20 » / « 7.20 € »).
 */
export function parseNautiljonPriceEur(
  raw: string | null | undefined,
): number | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d+)[,.](\d{2})/);
  if (!m) return null;
  const value = Number(`${m[1]}.${m[2]}`);
  return Number.isFinite(value) && value > 0 ? value : null;
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

function normalizeAscii(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * @description Identifiants d'éditions VF (drapeau France / libellé VF).
 */
function findFrenchEditionIds(html: string): Set<string> {
  const ids = new Set<string>();
  const headerRe =
    /<a\b[^>]*class="[^"]*\binfos_edition\b[^"]*"[^>]*onclick="[^"]*swap\(\s*'([^']+)'\s*\)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(html)) != null) {
    const id = match[1];
    const inner = match[2] ?? "";
    if (!id) continue;
    const text = normalizeAscii(decodeHtml(stripTags(inner)));
    const imgBlob = normalizeAscii(inner);
    const isFr =
      /france|francais|\bvf\b/.test(text) ||
      /france|francais/.test(imgBlob);
    const isVoOnly =
      !isFr &&
      (/japon|japan|coree|korea|\bvo\b|usa|etats/.test(text) ||
        /japon|japan/.test(imgBlob));
    if (isFr) {
      ids.add(id);
    } else if (!isVoOnly && /\(vf\)/.test(text)) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * @description Contenu HTML d'un bloc `edition_N`.
 */
function extractEditionBlockHtml(html: string, editionId: string): string | null {
  const escaped = editionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<div[^>]*\\bid="${escaped}"[^>]*>([\\s\\S]*?)(?=<div[^>]*\\bid="edition_\\d+"|$)`,
    "i",
  );
  const match = html.match(re);
  return match?.[1] ?? null;
}

/**
 * @description Zone HTML VF uniquement (éditions France), sinon page entière.
 */
function resolveVfScopeHtml(html: string): string {
  const frenchIds = findFrenchEditionIds(html);
  if (frenchIds.size === 0) {
    // Pas d'en-têtes infos_edition : tenter le premier bloc édition sous « Volumes ».
    const first = html.match(
      /<div[^>]*\bid="(edition_\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*\bid="edition_\d+"|$)/i,
    );
    return first?.[0] ?? html;
  }

  const parts: string[] = [];
  for (const id of frenchIds) {
    const block = extractEditionBlockHtml(html, id);
    if (block) {
      parts.push(block);
    }
  }
  return parts.length > 0 ? parts.join("\n") : html;
}

/**
 * @description Parse une carte `.unVol` : numéro, cover, date, URL fiche.
 */
function parseUnVolCard(
  block: string,
  seriesSlug: string,
): VolumeRow | null {
  const escaped = seriesSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hrefMatch = block.match(
    new RegExp(
      `href="(/[^"]*/${escaped}/volume-(\\d+)(?:,\\d+)?\\.html)"`,
      "i",
    ),
  );
  if (!hrefMatch?.[1] || !hrefMatch[2]) return null;

  const num = Number(hrefMatch[2]);
  if (!Number.isFinite(num) || num <= 0) return null;

  let coverUrl: string | undefined;
  const img = block.match(/src="([^"]+)"/i);
  if (img?.[1]) {
    const abs = absolutizeNautiljonUrl(
      img[1].replace(/\/mini\//g, "/").replace(/\/imagesmin\//g, "/images/"),
    );
    coverUrl = normalizeCoverImageUrl(abs) || undefined;
  }

  const text = decodeHtml(stripTags(block)).replace(/\s+/g, " ").trim();
  const releaseDate = extractReleaseDateVfFromText(text) ?? undefined;
  const catalogPrice = parseNautiljonPriceEur(text) ?? undefined;
  const pageUrl = absolutizeNautiljonUrl(hrefMatch[1]);

  return {
    volumeNumber: num,
    volumeLabel: `Tome ${num}`,
    coverUrl,
    releaseDate,
    catalogPrice,
    pageUrl,
  };
}

/**
 * @description Tomes VF depuis les cartes `.unVol` d'une zone HTML.
 */
function extractVolumesFromUnVolCards(
  scopeHtml: string,
  seriesSlug: string,
): VolumeRow[] {
  const cardRe =
    /<div[^>]*class="[^"]*\bunVol\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*\bunVol\b|<div[^>]*class="[^"]*\bunChap\b|<h3\b|$)/gi;
  const seen = new Set<number>();
  const volumes: VolumeRow[] = [];

  let card: RegExpExecArray | null;
  while ((card = cardRe.exec(scopeHtml)) != null) {
    const parsed = parseUnVolCard(card[1] ?? "", seriesSlug);
    if (!parsed || parsed.volumeNumber == null) continue;
    if (seen.has(parsed.volumeNumber)) continue;
    seen.add(parsed.volumeNumber);
    volumes.push(parsed);
  }

  volumes.sort(
    (a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0),
  );
  return volumes;
}

/**
 * @description Fallback : liens volume-N dans une zone HTML.
 */
function extractVolumesFromHrefFallback(
  scopeHtml: string,
  seriesSlug: string,
): VolumeRow[] {
  const escaped = seriesSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `href="(/[^"]*/${escaped}/volume-(\\d+)(?:,\\d+)?\\.html)"`,
    "gi",
  );
  const seen = new Set<number>();
  const volumes: VolumeRow[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(scopeHtml)) != null) {
    const num = Number(match[2]);
    const href = match[1];
    if (!Number.isFinite(num) || num <= 0 || seen.has(num) || !href) continue;
    seen.add(num);
    volumes.push({
      volumeNumber: num,
      volumeLabel: `Tome ${num}`,
      pageUrl: absolutizeNautiljonUrl(href),
    });
  }
  volumes.sort(
    (a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0),
  );
  return volumes;
}

/**
 * @description Filtre comme Tampermonkey : VF déjà sortis (compteur VF + date).
 * @param volumes - Tomes bruts.
 * @param volumesVfCount - Nb volumes VF Nautiljon (parus).
 */
export function filterReleasedVfVolumes(
  volumes: VolumeRow[],
  volumesVfCount?: number | null,
): VolumeRow[] {
  const maxVf =
    volumesVfCount != null && volumesVfCount > 0 ? volumesVfCount : null;

  return volumes.filter((volume) => {
    if (maxVf != null && volume.volumeNumber != null && volume.volumeNumber > maxVf) {
      return false;
    }
    if (!isNautiljonVolumeReleased(volume.releaseDate)) {
      return false;
    }
    return true;
  });
}

/**
 * @description Extrait les tomes VF listés sur la fiche (édition France uniquement).
 * @param html - HTML fiche série.
 * @param pageUrl - URL canonique.
 * @param volumesVfCount - Compteur VF pour exclure les annoncés non parus.
 */
export function extractNautiljonVfVolumeRows(
  html: string,
  pageUrl: string,
  volumesVfCount?: number | null,
): VolumeRow[] {
  const seriesSlug = pageUrl.match(
    /nautiljon\.com\/(?:mangas|animes|artbook|manhwa|manhua)\/([^/?#]+)\.html/i,
  )?.[1];
  if (!seriesSlug) return [];

  const scopeHtml = resolveVfScopeHtml(html);
  const fromCards = extractVolumesFromUnVolCards(scopeHtml, seriesSlug);
  const raw =
    fromCards.length > 0
      ? fromCards
      : extractVolumesFromHrefFallback(scopeHtml, seriesSlug);

  return filterReleasedVfVolumes(raw, volumesVfCount);
}

/**
 * @description Extrait couverture / date / prix depuis le HTML d'une fiche tome.
 */
export function extractNautiljonVolumeDetailsFromHtml(html: string): {
  coverUrl: string | null;
  releaseDate: string | null;
  catalogPrice: number | null;
} {
  let releaseDate: string | null = null;

  const metaVf =
    html.match(
      /(?:Date de parution|Parution)\s*VF\s*:?\s*(?:<\/[^>]+>)?\s*([^<]{6,40})/i,
    )?.[1] ?? null;
  if (metaVf) {
    const cleaned = decodeHtml(stripTags(metaVf)).replace(/\s+/g, " ").trim();
    releaseDate =
      nautiljonDateToIso(cleaned) ||
      extractReleaseDateVfFromText(`Parution VF: ${cleaned}`);
  }
  if (!releaseDate) {
    releaseDate = extractReleaseDateVfFromText(
      decodeHtml(stripTags(html)).slice(0, 12000),
    );
  }

  let coverUrl: string | null = null;
  const coverHref =
    html.match(
      /href="([^"]*\/images\/manga_volumes\/[^"]+)"[^>]*(?:id="[^"]*couverture|class="[^"]*cbox)/i,
    ) ||
    html.match(
      /href="([^"]*\/images\/manga_volumes\/(?!mini\/)[^"]+\.(?:webp|jpg|jpeg|png)[^"]*)"/i,
    );
  if (coverHref?.[1]) {
    coverUrl = absolutizeNautiljonUrl(coverHref[1].replace(/\/mini\//g, "/"));
  }
  if (!coverUrl) {
    const img = html.match(
      /src="([^"]*\/(?:images\/)?manga_volumes\/[^"]+)"/i,
    );
    if (img?.[1]) {
      coverUrl = absolutizeNautiljonUrl(
        img[1].replace(/\/mini\//g, "/").replace(/\/imagesmin\//g, "/images/"),
      );
    }
  }

  const priceMatch =
    html.match(/Prix\s*:?\s*(\d+[,.]\d{2})\s*€?/i)?.[1] ?? null;

  return {
    coverUrl: coverUrl ? normalizeCoverImageUrl(coverUrl) : null,
    releaseDate,
    catalogPrice: parseNautiljonPriceEur(priceMatch),
  };
}
