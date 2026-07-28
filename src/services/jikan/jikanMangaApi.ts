/**
 * Client Jikan pour enrichir les relations manga → animé
 * et les fiches minimales (import Mihon).
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

/** Données minimales manga pour préremplir une fiche Lectures. */
export interface JikanMangaMinimal {
  malId: number;
  title: string;
  coverUrl: string;
  synopsis: string;
  genres: string[];
  demographicType: string;
  volumes: number | null;
  chapters: number | null;
  statusLabel: string;
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

/**
 * @description Récupère les champs minimaux d'un manga MAL via Jikan.
 * @param malId - Identifiant MyAnimeList manga.
 */
export async function fetchJikanMangaMinimal(
  malId: number,
): Promise<JikanMangaMinimal | null> {
  const response = await fetch(`${JIKAN_API}/manga/${malId}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Jikan manga HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: {
      mal_id?: number;
      title?: string;
      title_english?: string | null;
      synopsis?: string | null;
      status?: string | null;
      volumes?: number | null;
      chapters?: number | null;
      images?: {
        jpg?: { large_image_url?: string; image_url?: string };
        webp?: { large_image_url?: string; image_url?: string };
      };
      genres?: Array<{ name?: string }>;
      demographics?: Array<{ name?: string }>;
    };
  };

  const data = json.data;
  if (!data?.mal_id) return null;

  const coverUrl =
    data.images?.jpg?.large_image_url ||
    data.images?.jpg?.image_url ||
    data.images?.webp?.large_image_url ||
    data.images?.webp?.image_url ||
    "";

  const genres = (data.genres ?? [])
    .map((g) => String(g.name ?? "").trim())
    .filter(Boolean);

  const demographicType = String(data.demographics?.[0]?.name ?? "").trim();

  return {
    malId: data.mal_id,
    title: String(data.title_english || data.title || "").trim() || `MAL ${malId}`,
    coverUrl,
    synopsis: String(data.synopsis ?? "").trim(),
    genres,
    demographicType,
    volumes:
      data.volumes != null && Number.isFinite(Number(data.volumes))
        ? Number(data.volumes)
        : null,
    chapters:
      data.chapters != null && Number.isFinite(Number(data.chapters))
        ? Number(data.chapters)
        : null,
    statusLabel: String(data.status ?? "").trim(),
  };
}
