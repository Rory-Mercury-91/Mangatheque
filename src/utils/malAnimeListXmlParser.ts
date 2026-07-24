import type { AnimeListStatus } from "@/types/anime";
import { normalizeAnimeListStatus } from "@/constants/animeStatus";

/** Entrée d'un export XML liste animé MyAnimeList. */
export interface MalAnimeListXmlEntry {
  malId: number;
  title: string;
  mediaType: string | null;
  episodes: number | null;
  listStatus: AnimeListStatus;
  episodesWatched: number;
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * @description Indique si le XML est un export de liste personnelle MAL.
 */
export function isMalAnimeListXml(xml: string): boolean {
  return (
    /<myanimelist>/i.test(xml) &&
    /<my_status>/i.test(xml) &&
    /<series_animedb_id>/i.test(xml)
  );
}

/**
 * @description Indique si le XML est un mapping ADKami (MAL ↔ ADKami).
 */
export function isAdkamiMalMappingXml(xml: string): boolean {
  return /<series_adk_id>/i.test(xml) && /<series_animedb_id>/i.test(xml);
}

/**
 * @description Parse un export XML « anime list » MyAnimeList (Version 1.1).
 */
export function parseMalAnimeListXml(xml: string): MalAnimeListXmlEntry[] {
  const entries: MalAnimeListXmlEntry[] = [];
  const animeRegex = /<anime>([\s\S]*?)<\/anime>/gi;
  let match: RegExpExecArray | null;

  while ((match = animeRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const malId = extractTagNumber(block, "series_animedb_id");
    if (malId == null) continue;

    const title = extractTagCdata(block, "series_title") ?? `MAL ${malId}`;
    const statusRaw = extractTagText(block, "my_status") ?? "Plan to Watch";
    const listStatus = normalizeAnimeListStatus(
      statusRaw.trim().toLowerCase().replace(/[\s-]+/g, "_"),
    );

    entries.push({
      malId,
      title,
      mediaType: normalizeMediaType(extractTagText(block, "series_type")),
      episodes: extractTagNumber(block, "series_episodes"),
      listStatus,
      episodesWatched: Math.max(
        0,
        extractTagNumber(block, "my_watched_episodes") ?? 0,
      ),
      startedAt: normalizeMalXmlDate(extractTagText(block, "my_start_date")),
      finishedAt: normalizeMalXmlDate(extractTagText(block, "my_finish_date")),
    });
  }

  return entries;
}

/**
 * @description Convertit une date MAL XML (`YYYY-MM-DD` ou `0000-00-00`) en ISO date ou null.
 */
function normalizeMalXmlDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("0000")) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * @description Normalise le type média MAL XML vers le vocabulaire app.
 */
function normalizeMediaType(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (value === "tv" || value === "ova" || value === "ona" || value === "movie") {
    return value;
  }
  if (value === "special" || value === "specials") return "special";
  if (value === "music") return "music";
  return value;
}

function extractTagNumber(block: string, tag: string): number | null {
  const text = extractTagText(block, tag);
  if (text == null) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function extractTagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  return m[1]!.trim();
}

function extractTagCdata(block: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
    "i",
  );
  const m = block.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? "").trim() || null;
}
