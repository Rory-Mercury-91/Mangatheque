import type { Anime } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import { normalizeAdkamiTitle } from "@/utils/adkamiAgendaParser";
import {
  formatEpisodeNumber,
  normalizeEpisodeCount,
} from "@/utils/adkamiAgendaWatched";
import { normalizeTitleForComparison } from "@/utils/textNormalize";

/**
 * @description Indique si une fiche couvre un n° d'épisode ADKami (plage from/to).
 * Sans plage renseignée, accepte tout épisode (comportement legacy).
 */
export function animeCoversAdkamiEpisode(
  anime: Pick<Anime, "adkami_episode_from" | "adkami_episode_to">,
  episodeNumber: number | null | undefined,
): boolean {
  const from = anime.adkami_episode_from;
  const to = anime.adkami_episode_to;
  if (from == null && to == null) return true;
  if (episodeNumber == null || episodeNumber <= 0) return false;
  const lo = from != null ? Number(from) : Number.NEGATIVE_INFINITY;
  const hi = to != null ? Number(to) : Number.POSITIVE_INFINITY;
  return episodeNumber >= lo && episodeNumber <= hi;
}

/**
 * @description Offset dérivé de la plage (from − 1), sinon offset stocké.
 */
export function resolveAdkamiEpisodeOffset(
  anime: Pick<Anime, "adkami_episode_from" | "adkami_episode_offset">,
): number {
  if (anime.adkami_episode_from != null && Number(anime.adkami_episode_from) > 0) {
    return normalizeEpisodeCount(Number(anime.adkami_episode_from) - 1);
  }
  return normalizeEpisodeCount(Number(anime.adkami_episode_offset) || 0);
}

/**
 * @description Épisode local (MAL) depuis le n° ADKami absolu + plage/offset.
 */
export function toLocalEpisodeFromAnime(
  adkamiEpisode: number,
  anime: Pick<Anime, "adkami_episode_from" | "adkami_episode_offset">,
): number {
  return normalizeEpisodeCount(
    adkamiEpisode - resolveAdkamiEpisodeOffset(anime),
  );
}

/**
 * @description Libellé uniforme « Épisode X » (numéro local si possible).
 */
export function formatPlanningEpisodeLabel(
  episodeNumber: number | null | undefined,
  episodeOffset: number = 0,
): string {
  if (episodeNumber == null || episodeNumber <= 0) return "Épisode";
  const local = normalizeEpisodeCount(episodeNumber - (episodeOffset || 0));
  if (local <= 0) return `Épisode ${formatEpisodeNumber(episodeNumber)}`;
  return `Épisode ${formatEpisodeNumber(local)}`;
}

/**
 * @description Score de proximité titre agenda ↔ fiche (repli si plusieurs saisons).
 */
function scoreAnimeTitleAgainstAgenda(anime: Anime, entryTitle: string): number {
  const entryFull = normalizeTitleForComparison(entryTitle);
  const entryBase = normalizeAdkamiTitle(entryTitle);
  let best = 0;
  for (const candidate of [
    anime.title,
    anime.title_fr,
    anime.title_en,
    anime.title_ja,
    resolveAnimeDisplayTitle(anime),
  ]) {
    if (!candidate?.trim()) continue;
    const full = normalizeTitleForComparison(candidate);
    const base = normalizeAdkamiTitle(candidate);
    if (full === entryFull) best = Math.max(best, 3);
    else if (full === entryBase || base === entryFull) best = Math.max(best, 2);
    else if (base === entryBase) best = Math.max(best, 1);
  }
  return best;
}

/**
 * @description Choisit la fiche saison pour une sortie agenda (ID ADKami déjà groupé).
 * Priorité : index saison ADKami → plage d'épisodes → saison active → score titre.
 * Si au moins une fiche a une plage, les fiches sans plage sont ignorées.
 * @param candidates - Fiches partageant le même `adkami_id`.
 * @param entryTitle - Titre brut agenda (repli).
 * @param episodeNumber - N° ADKami absolu.
 * @param seasonIndex - N° de saison ADKami (URL), optionnel.
 */
export function pickAnimeForAgendaEntry(
  candidates: Anime[],
  entryTitle: string,
  episodeNumber: number | null | undefined,
  seasonIndex?: number | null,
): Anime | null {
  if (candidates.length === 0) return null;

  let pool = candidates;
  if (seasonIndex != null && seasonIndex > 0) {
    const bySeason = candidates.filter(
      (anime) => anime.adkami_season_index === seasonIndex,
    );
    if (bySeason.length > 0) pool = bySeason;
  }

  if (pool.length === 1) {
    const only = pool[0]!;
    const anyRange =
      only.adkami_episode_from != null || only.adkami_episode_to != null;
    if (anyRange && !animeCoversAdkamiEpisode(only, episodeNumber)) {
      return null;
    }
    return only;
  }

  const ranged = pool.filter(
    (anime) =>
      anime.adkami_episode_from != null || anime.adkami_episode_to != null,
  );
  const rangedPool =
    ranged.length > 0
      ? ranged.filter((anime) =>
          animeCoversAdkamiEpisode(anime, episodeNumber),
        )
      : pool;
  if (rangedPool.length === 0) return null;

  const active = rangedPool.filter((anime) => anime.adkami_season_active);
  const ranked = active.length > 0 ? active : rangedPool;
  if (ranked.length === 1) return ranked[0]!;

  let best = ranked[0]!;
  let bestScore = -1;
  for (const anime of ranked) {
    const score = scoreAnimeTitleAgainstAgenda(anime, entryTitle);
    if (score > bestScore) {
      bestScore = score;
      best = anime;
    }
  }
  return best;
}

/**
 * @description Supprime les doublons scrap exacts (même id + horaire + n° épisode).
 * Deux épisodes distincts au même horaire (ex. Bai Ri Cheng Wang 3 et 4) sont conservés.
 */
export function dedupeAdkamiAgendaEntries<
  T extends {
    adkamiId?: number;
    adkami_id?: number;
    releaseAtUnix?: number;
    release_at?: string;
    episodeNumber?: number | null;
    episode_number?: number | null;
  },
>(entries: T[]): T[] {
  const bySlot = new Map<string, T>();
  for (const entry of entries) {
    const adkamiId = Number(entry.adkamiId ?? entry.adkami_id);
    if (!Number.isFinite(adkamiId) || adkamiId <= 0) continue;
    const releaseKey =
      entry.releaseAtUnix != null
        ? String(entry.releaseAtUnix)
        : (entry.release_at ?? "");
    if (!releaseKey) continue;
    const episodeKey = String(
      entry.episodeNumber ?? entry.episode_number ?? "",
    );
    const key = `${adkamiId}|${releaseKey}|${episodeKey}`;
    if (!bySlot.has(key)) {
      bySlot.set(key, entry);
    }
  }
  return Array.from(bySlot.values());
}
