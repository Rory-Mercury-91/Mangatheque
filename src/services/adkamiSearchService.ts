import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/platform";
import { resolveErrorMessage } from "@/utils/errorMessage";
import {
  buildAdkamiSearchUrl,
  parseAdkamiSearchHtml,
  type AdkamiSearchHit,
} from "@/utils/adkamiSearchParser";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import type { Anime } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import {
  analyzeAdkamiContentUnits,
  parseAdkamiEpisodePageHtml,
} from "@/utils/adkamiEpisodePageParser";
import { fetchAdkamiAnimePageHtml } from "@/services/adkamiSeasonMapService";
import { buildAdkamiAnimeUrl } from "@/utils/animeExternalLinks";
import { getAdkamiAudioPreference } from "@/utils/adkamiUnknownTypes";

export type { AdkamiSearchHit };

/** Décision après une recherche unitaire. */
export type AdkamiSearchDecision =
  | { kind: "none"; query: string; hits: AdkamiSearchHit[] }
  | { kind: "auto"; query: string; hit: AdkamiSearchHit; hits: AdkamiSearchHit[] }
  | { kind: "pick"; query: string; hits: AdkamiSearchHit[] };

/**
 * @description Titre de requête ADKami : EN → titre principal → JA.
 */
export function resolveAdkamiSearchQuery(
  anime: Pick<Anime, "title" | "title_en" | "title_ja"> | {
    title?: string | null;
    titleEn?: string | null;
    titleJa?: string | null;
    title_en?: string | null;
    title_ja?: string | null;
  },
): string {
  const en =
    ("title_en" in anime ? anime.title_en : null) ??
    ("titleEn" in anime ? anime.titleEn : null) ??
    null;
  const ja =
    ("title_ja" in anime ? anime.title_ja : null) ??
    ("titleJa" in anime ? anime.titleJa : null) ??
    null;
  const main = anime.title ?? null;
  return (en?.trim() || main?.trim() || ja?.trim() || "").trim();
}

/**
 * @description Indique si deux titres se correspondent assez pour une auto-liaison.
 */
export function titlesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeTitleForComparison(a);
  const nb = normalizeTitleForComparison(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return shorter / longer >= 0.65;
  }
  return false;
}

/**
 * @description Télécharge le HTML de recherche ADKami (Tauri).
 */
export async function fetchAdkamiSearchHtml(query: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error(
      "La recherche ADKami nécessite l'application native.",
    );
  }
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Saisissez un titre pour la recherche ADKami.");
  }
  try {
    return await invoke<string>("fetch_adkami_search_html", {
      query: trimmed,
    });
  } catch (error) {
    throw new Error(
      resolveErrorMessage(error, "Recherche ADKami impossible."),
    );
  }
}

/**
 * @description Recherche ADKami + classification (0 / 1 auto / multi).
 * Si 0 résultat et titre type « … Part 2 », retente sans le suffixe (fiche ADKami souvent unique).
 */
export async function searchAdkamiAndDecide(
  query: string,
  matchAgainstTitles: string[],
): Promise<AdkamiSearchDecision> {
  const trimmed = query.trim();
  let decision = await searchAdkamiOnce(trimmed, matchAgainstTitles);

  if (decision.kind === "none") {
    const fallback = stripSeasonPartSuffix(trimmed);
    if (fallback && fallback.toLowerCase() !== trimmed.toLowerCase()) {
      const retry = await searchAdkamiOnce(fallback, matchAgainstTitles);
      if (retry.kind !== "none") {
        // Conserver la query d'origine pour l'UI, mais les hits du fallback.
        return { ...retry, query: trimmed };
      }
    }
  }

  return decision;
}

async function searchAdkamiOnce(
  query: string,
  matchAgainstTitles: string[],
): Promise<AdkamiSearchDecision> {
  const trimmed = query.trim();
  const html = await fetchAdkamiSearchHtml(trimmed);
  const hits = parseAdkamiSearchHtml(html);

  if (hits.length === 0) {
    return { kind: "none", query: trimmed, hits };
  }

  if (hits.length === 1) {
    const hit = hits[0]!;
    const ok = matchAgainstTitles.some((t) => titlesLikelyMatch(t, hit.title));
    if (ok) {
      return { kind: "auto", query: trimmed, hit, hits };
    }
    return { kind: "pick", query: trimmed, hits };
  }

  return { kind: "pick", query: trimmed, hits };
}

/**
 * @description Retire un suffixe « Part 2 / Cour 2 / Season 2… » pour retomber sur la fiche ADKami parent.
 */
export function stripSeasonPartSuffix(title: string): string | null {
  const stripped = title
    .replace(
      /\s*[:\-]?\s*(part|cour|season|saison|arc)\s*\d+\s*$/i,
      "",
    )
    .replace(/\s*[:\-]?\s*(2nd|3rd|4th|5th)\s*(season|cour|part)?\s*$/i, "")
    .trim();
  if (!stripped || stripped.length < 2) return null;
  if (stripped.toLowerCase() === title.trim().toLowerCase()) return null;
  return stripped;
}

/**
 * @description Titres candidats pour matching depuis une fiche / formulaire.
 */
export function collectAnimeMatchTitles(
  anime: {
    title?: string | null;
    title_en?: string | null;
    title_ja?: string | null;
    title_fr?: string | null;
    titleEn?: string | null;
    titleJa?: string | null;
    titleFr?: string | null;
  },
): string[] {
  return [
    anime.title,
    anime.title_en ?? anime.titleEn,
    anime.title_ja ?? anime.titleJa,
    anime.title_fr ?? anime.titleFr,
  ].filter((t): t is string => Boolean(t?.trim()));
}

/**
 * @description Ouvre l'URL de recherche dans le navigateur (fallback manuel).
 */
export function buildAdkamiSearchPageUrl(query: string): string {
  return buildAdkamiSearchUrl(query);
}

/**
 * @description Détecte si une fiche ADKami a plusieurs blocs saison TV.
 */
export async function detectAdkamiMultiSeason(
  adkamiId: number,
  section: string = "anime",
): Promise<{ multiSeason: boolean; seasonCount: number; unitCount: number }> {
  const url = buildAdkamiAnimeUrl(adkamiId, section);
  const html = await fetchAdkamiAnimePageHtml(url);
  const audio = getAdkamiAudioPreference();
  const parsed = parseAdkamiEpisodePageHtml(html, audio);
  const units = analyzeAdkamiContentUnits(parsed.links);
  const episodeUnits = units.filter((u) => u.groupId === "episodes");
  const seasons = new Set(episodeUnits.map((u) => u.seasonIndex));
  return {
    multiSeason: seasons.size > 1 || episodeUnits.length > 1,
    seasonCount: seasons.size,
    unitCount: episodeUnits.length,
  };
}

/**
 * @description Libellé d'affichage pour un hit de recherche.
 */
export function formatAdkamiSearchHitLabel(hit: AdkamiSearchHit): string {
  const parts = [hit.title];
  if (hit.year != null) parts.push(String(hit.year));
  if (hit.episodeCount != null) parts.push(`${hit.episodeCount} ép.`);
  parts.push(`ID ${hit.adkamiId}`);
  return parts.join(" · ");
}

/**
 * @description Titre d'affichage local pour logs / UI bulk.
 */
export function formatAnimeLookupLabel(anime: Anime): string {
  return `${resolveAnimeDisplayTitle(anime)}${
    anime.year != null ? ` (${anime.year})` : ""
  } · MAL ${anime.mal_id}`;
}
