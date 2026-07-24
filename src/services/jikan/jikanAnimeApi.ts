/**
 * Client Jikan (scraping MAL) pour enrichir relations / streaming / thèmes.
 */

const JIKAN_API = "https://api.jikan.moe/v4";

export interface JikanAnimeEnrichment {
  themes: string[];
  demographics: string[];
  explicitGenres: string[];
  streaming: { name: string; url: string }[];
  related: {
    malId: number;
    type: string;
    name: string;
    relation: string;
    url?: string;
  }[];
  titleFr: string | null;
  season: string | null;
  year: number | null;
}

/**
 * @description Récupère les métadonnées enrichies Jikan pour un animé MAL.
 */
export async function fetchJikanAnimeFull(
  malId: number,
): Promise<JikanAnimeEnrichment | null> {
  const response = await fetch(`${JIKAN_API}/anime/${malId}/full`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Jikan HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: {
      titles?: Array<{ type?: string; title?: string }>;
      themes?: Array<{ name?: string }>;
      demographics?: Array<{ name?: string }>;
      explicit_genres?: Array<{ name?: string }>;
      streaming?: Array<{ name?: string; url?: string }>;
      relations?: Array<{
        relation?: string;
        entry?: Array<{
          mal_id?: number;
          type?: string;
          name?: string;
          url?: string;
        }>;
      }>;
      season?: string;
      year?: number;
    };
  };

  const data = json.data;
  if (!data) return null;

  const titleFr =
    (data.titles ?? []).find(
      (t) => String(t.type ?? "").toLowerCase() === "french",
    )?.title ?? null;

  const related: JikanAnimeEnrichment["related"] = [];
  for (const group of data.relations ?? []) {
    for (const entry of group.entry ?? []) {
      if (entry.mal_id == null) continue;
      related.push({
        malId: entry.mal_id,
        type: String(entry.type ?? "unknown").toLowerCase(),
        name: entry.name ?? "",
        relation: String(group.relation ?? "other")
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/-/g, "_"),
        url: entry.url,
      });
    }
  }

  return {
    themes: (data.themes ?? [])
      .map((t) => t.name)
      .filter((n): n is string => Boolean(n)),
    demographics: (data.demographics ?? [])
      .map((t) => t.name)
      .filter((n): n is string => Boolean(n)),
    explicitGenres: (data.explicit_genres ?? [])
      .map((t) => t.name)
      .filter((n): n is string => Boolean(n)),
    streaming: (data.streaming ?? [])
      .filter((s) => s.name && s.url)
      .map((s) => ({ name: s.name!, url: s.url! })),
    related,
    titleFr: titleFr?.trim() || null,
    season: data.season ?? null,
    year: data.year ?? null,
  };
}
