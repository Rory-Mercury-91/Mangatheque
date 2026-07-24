/**
 * Client Jikan pour enrichir les relations manga → animé.
 */

const JIKAN_API = "https://api.jikan.moe/v4";

export interface JikanMangaRelatedEntry {
  malId: number;
  type: string;
  name: string;
  relation: string;
  url?: string;
}

export interface JikanMangaEnrichment {
  related: JikanMangaRelatedEntry[];
}

/**
 * @description Récupère les relations Jikan d’un manga MAL.
 * @param malId - Identifiant MyAnimeList manga.
 */
export async function fetchJikanMangaFull(
  malId: number,
): Promise<JikanMangaEnrichment | null> {
  const response = await fetch(`${JIKAN_API}/manga/${malId}/full`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Jikan manga HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: {
      relations?: Array<{
        relation?: string;
        entry?: Array<{
          mal_id?: number;
          type?: string;
          name?: string;
          url?: string;
        }>;
      }>;
    };
  };

  const data = json.data;
  if (!data) return null;

  const related: JikanMangaRelatedEntry[] = [];
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

  return { related };
}
