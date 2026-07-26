/**
 * Résultat d'une fiche trouvée sur la recherche ADKami.
 */
export interface AdkamiSearchHit {
  adkamiId: number;
  section: string;
  title: string;
  episodeCount: number | null;
  /** 3ᵉ valeur de data-info (souvent nb de saisons). */
  seasonHint: number | null;
  year: number | null;
  coverUrl: string | null;
  pageUrl: string;
}

/**
 * @description Parse le HTML d'une page `/video?search=…` ADKami.
 * @param html - Document HTML brut.
 */
export function parseAdkamiSearchHtml(html: string): AdkamiSearchHit[] {
  const blocks = html.split(/class="video-item-list"/i).slice(1);
  const hits: AdkamiSearchHit[] = [];
  const seen = new Set<number>();

  for (const block of blocks) {
    const chunk = block.slice(0, 2500);
    const hrefMatch = chunk.match(
      /href="(https?:\/\/[^"]*adkami\.com\/(anime|hentai|drama)\/(\d+)\/?)"/i,
    );
    if (!hrefMatch) continue;

    const pageUrl = hrefMatch[1]!.trim();
    const section = hrefMatch[2]!.toLowerCase();
    const adkamiId = Number(hrefMatch[3]);
    if (!Number.isFinite(adkamiId) || adkamiId <= 0 || seen.has(adkamiId)) {
      continue;
    }

    const titleMatch = chunk.match(
      /class="title"[^>]*>([^<]{1,200})</i,
    );
    const title = decodeHtml(titleMatch?.[1] ?? "").trim();
    if (!title) continue;

    const dataInfoMatch = chunk.match(/data-info="(\d+),(\d+),(\d+)"/i);
    const episodeFromData = dataInfoMatch
      ? Number(dataInfoMatch[2])
      : null;
    const seasonHint = dataInfoMatch ? Number(dataInfoMatch[3]) : null;

    const episodeLabelMatch = chunk.match(
      /nombre\s+d['']épisode\s*(\d+)/i,
    );
    const episodeCount =
      episodeFromData != null && Number.isFinite(episodeFromData)
        ? episodeFromData
        : episodeLabelMatch
          ? Number(episodeLabelMatch[1])
          : null;

    const yearMatch = chunk.match(/parution\s+en\s+(\d{4})/i);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    const coverMatch =
      chunk.match(/data-original="(https?:\/\/[^"]+)"/i) ??
      chunk.match(/src="(https?:\/\/image\.adkami\.com[^"]+)"/i);
    const coverUrl = coverMatch?.[1]?.trim() || null;

    seen.add(adkamiId);
    hits.push({
      adkamiId,
      section,
      title,
      episodeCount:
        episodeCount != null && Number.isFinite(episodeCount) && episodeCount > 0
          ? episodeCount
          : null,
      seasonHint:
        seasonHint != null && Number.isFinite(seasonHint) && seasonHint > 0
          ? seasonHint
          : null,
      year: year != null && Number.isFinite(year) ? year : null,
      coverUrl,
      pageUrl,
    });
  }

  return hits;
}

/**
 * @description Construit l'URL de recherche ADKami.
 */
export function buildAdkamiSearchUrl(query: string): string {
  const q = query.trim();
  return `https://www.adkami.com/video?search=${encodeURIComponent(q)}`;
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
