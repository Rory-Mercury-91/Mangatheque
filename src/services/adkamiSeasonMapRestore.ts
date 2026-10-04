import type { Anime } from "@/types/anime";
import { normalizeEpisodeCount } from "@/utils/adkamiAgendaWatched";
import type { AdkamiUnitGroupId } from "@/utils/adkamiEpisodePageParser";
import {
  adkamiRangeLength,
  nextAdkamiEpisodeAfter,
  withAdkamiRange,
  type AdkamiSeasonMapUnit,
} from "@/services/adkamiSeasonMapService";

const RANGE_EPS = 0.05;

/**
 * @description Épisode ADKami précédant `episode` (entiers, .5, .9…).
 */
function previousAdkamiEpisodeBefore(episode: number): number {
  const n = normalizeEpisodeCount(episode);
  if (!Number.isInteger(n)) {
    return Math.floor(n);
  }
  return normalizeEpisodeCount(n - 1);
}

function createPartId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * @description Vrai si la fiche porte déjà une plage sur cet ID ADKami.
 */
function hasStoredAdkamiSeasonMapping(anime: Anime, adkamiId: number): boolean {
  if (anime.adkami_id == null || Number(anime.adkami_id) !== Number(adkamiId)) {
    return false;
  }
  const from = anime.adkami_episode_from;
  const to = anime.adkami_episode_to;
  return (
    anime.adkami_season_index != null &&
    anime.adkami_season_index > 0 &&
    from != null &&
    to != null &&
    from > 0 &&
    to >= from
  );
}

/**
 * @description Groupe préféré d'après le type MAL (départage les égalités).
 */
function preferredAdkamiGroup(anime: Anime): AdkamiUnitGroupId | null {
  const media = (anime.media_type ?? "").toLowerCase();
  if (media === "movie") return "films";
  if (media === "ova") return "oav";
  if (media === "special") return "extras";
  if (media === "tv" || media === "ona") return "episodes";
  return null;
}

/**
 * @description Vrai si la plage enregistrée tient dans le bloc ADKami.
 */
function storedRangeFitsUnit(anime: Anime, unit: AdkamiSeasonMapUnit): boolean {
  const from = anime.adkami_episode_from;
  const to = anime.adkami_episode_to;
  if (from == null || to == null || from <= 0 || to < from) return false;
  if (unit.episodeFrom <= 0 && unit.episodeTo <= 0) return false;
  if (unit.seasonIndex !== anime.adkami_season_index) return false;
  return from >= unit.episodeFrom - RANGE_EPS && to <= unit.episodeTo + RANGE_EPS;
}

/**
 * @description Bloc le plus serré qui contient déjà la plage enregistrée.
 */
function findBestStoredUnitIndex(
  units: AdkamiSeasonMapUnit[],
  anime: Anime,
): number {
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  const preferred = preferredAdkamiGroup(anime);
  const storedLen = adkamiRangeLength(
    anime.adkami_episode_from ?? 0,
    anime.adkami_episode_to ?? 0,
  );

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]!;
    if (unit.selectedAnimeId) continue;
    if (!storedRangeFitsUnit(anime, unit)) continue;
    const slack =
      adkamiRangeLength(unit.episodeFrom, unit.episodeTo) - storedLen;
    const groupPenalty = preferred && unit.groupId !== preferred ? 0.25 : 0;
    const score = slack + groupPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/**
 * @description Pose la fiche sur tout le bloc (saison qui a gagné des épisodes).
 */
function assignStoredMappingOnUnit(
  units: AdkamiSeasonMapUnit[],
  unitKey: string,
  anime: Anime,
): AdkamiSeasonMapUnit[] {
  return units.map((unit) =>
    unit.unitKey === unitKey
      ? {
          ...unit,
          selectedAnimeId: anime.id,
          suggestedAnimeId: anime.id,
          markActive: Boolean(anime.adkami_season_active) || unit.markActive,
        }
      : unit,
  );
}

/**
 * @description Découpe le bloc pour coller à la plage déjà enregistrée.
 */
function carveUnitForStoredMapping(
  units: AdkamiSeasonMapUnit[],
  unitKey: string,
  anime: Anime,
): AdkamiSeasonMapUnit[] {
  const idx = units.findIndex((unit) => unit.unitKey === unitKey);
  if (idx < 0) return units;
  const unit = units[idx]!;
  const from = normalizeEpisodeCount(
    anime.adkami_episode_from ?? unit.episodeFrom,
  );
  const to = normalizeEpisodeCount(anime.adkami_episode_to ?? unit.episodeTo);
  const baseKey = unit.unitKey.replace(/#part-[^#]+$/g, "");
  const pieces: AdkamiSeasonMapUnit[] = [];

  if (from > unit.episodeFrom + RANGE_EPS) {
    const beforeTo = previousAdkamiEpisodeBefore(from);
    if (beforeTo >= unit.episodeFrom) {
      pieces.push(
        withAdkamiRange(
          {
            ...unit,
            unitKey: `${baseKey}#part-${createPartId()}`,
            selectedAnimeId: null,
            suggestedAnimeId: null,
            markActive: false,
          },
          unit.episodeFrom,
          beforeTo,
        ),
      );
    }
  }

  const trimmed = pieces.length > 0 || to < unit.episodeTo - RANGE_EPS;
  pieces.push(
    withAdkamiRange(
      {
        ...unit,
        unitKey: trimmed ? `${baseKey}#part-${createPartId()}` : unit.unitKey,
        selectedAnimeId: anime.id,
        suggestedAnimeId: anime.id,
        markActive: Boolean(anime.adkami_season_active),
      },
      from,
      to,
    ),
  );

  if (to < unit.episodeTo - RANGE_EPS) {
    const afterFrom = nextAdkamiEpisodeAfter(to);
    if (afterFrom <= unit.episodeTo) {
      pieces.push(
        withAdkamiRange(
          {
            ...unit,
            unitKey: `${baseKey}#part-${createPartId()}`,
            selectedAnimeId: null,
            suggestedAnimeId: null,
            markActive: false,
            detailLabel: unit.detailLabel
              ? `${unit.detailLabel} (suite)`
              : `Suite · S${unit.seasonIndex}`,
          },
          afterFrom,
          unit.episodeTo,
        ),
      );
    }
  }

  const next = [...units];
  next.splice(idx, 1, ...pieces);
  return next;
}

/**
 * @description Réapplique le mapping déjà enregistré sur le même ID ADKami.
 * Une fiche seule qui commence le bloc absorbe les épisodes ajoutés depuis.
 * Plusieurs fiches sur la même saison retrouvent chacune leur plage.
 * @param units - Blocs issus du scrap, encore vides.
 * @param animes - Catalogue local.
 * @param adkamiId - ID de la fiche en cours d'analyse.
 * @returns Blocs préremplis et nombre de fiches reprises.
 */
export function restoreExistingAdkamiSeasonMappings(
  units: AdkamiSeasonMapUnit[],
  animes: Anime[],
  adkamiId: number,
): { units: AdkamiSeasonMapUnit[]; restoredCount: number } {
  const mapped = animes
    .filter((anime) => hasStoredAdkamiSeasonMapping(anime, adkamiId))
    .sort((a, b) => {
      const season =
        (a.adkami_season_index ?? 0) - (b.adkami_season_index ?? 0);
      if (season !== 0) return season;
      return (a.adkami_episode_from ?? 0) - (b.adkami_episode_from ?? 0);
    });

  let current = units;
  const consumed = new Set<string>();
  let restoredCount = 0;

  for (const anime of mapped) {
    if (consumed.has(anime.id)) continue;
    const idx = findBestStoredUnitIndex(current, anime);
    if (idx < 0) continue;
    const unit = current[idx]!;
    const claimants = mapped.filter((other) => {
      if (consumed.has(other.id)) return false;
      return findBestStoredUnitIndex(current, other) === idx;
    });
    const startsAtUnit =
      Math.abs((anime.adkami_episode_from ?? 0) - unit.episodeFrom) <=
      RANGE_EPS;

    current =
      claimants.length === 1 && startsAtUnit
        ? assignStoredMappingOnUnit(current, unit.unitKey, anime)
        : carveUnitForStoredMapping(current, unit.unitKey, anime);
    consumed.add(anime.id);
    restoredCount += 1;
  }

  if (restoredCount === 0) {
    return { units: current, restoredCount };
  }

  const activeIds = new Set(
    mapped
      .filter((anime) => anime.adkami_season_active)
      .map((anime) => anime.id),
  );
  const matchedActive = current.some(
    (unit) =>
      unit.selectedAnimeId != null && activeIds.has(unit.selectedAnimeId),
  );
  if (!matchedActive) {
    return { units: current, restoredCount };
  }

  return {
    restoredCount,
    units: current.map((unit) => ({
      ...unit,
      markActive:
        unit.groupId === "episodes" &&
        unit.selectedAnimeId != null &&
        activeIds.has(unit.selectedAnimeId),
    })),
  };
}
