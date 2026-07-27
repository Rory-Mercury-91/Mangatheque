import { invoke } from "@tauri-apps/api/core";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { isTauriRuntime } from "@/lib/platform";
import type { Anime } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import { mapAnimeRow } from "@/services/animeService";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import { normalizeEpisodeCount } from "@/utils/adkamiAgendaWatched";
import { resolveErrorMessage } from "@/utils/errorMessage";
import {
  analyzeAdkamiContentUnits,
  parseAdkamiEpisodePageHtml,
  type AdkamiContentUnit,
} from "@/utils/adkamiEpisodePageParser";
import {
  buildAdkamiAnimeUrl,
  parseAdkamiUrl,
} from "@/utils/animeExternalLinks";
import {
  getAdkamiAudioPreference,
  recordUnknownAdkamiContentTypes,
  type AdkamiUnknownContentTypeRecord,
} from "@/utils/adkamiUnknownTypes";
import type { AdkamiAudioPreference } from "@/utils/adkamiUrlParts";

/** Unité prête pour attribution manuelle. */
export interface AdkamiSeasonMapUnit extends AdkamiContentUnit {
  suggestedAnimeId: string | null;
  selectedAnimeId: string | null;
  markActive: boolean;
}

/** Résultat d'analyse d'une fiche ADKami. */
export interface AdkamiSeasonMapDraft {
  adkamiId: number;
  section: string;
  audioPreference: AdkamiAudioPreference;
  numberingMode: "continuous" | "reset" | "single";
  units: AdkamiSeasonMapUnit[];
  unknownContentTypes: AdkamiUnknownContentTypeRecord[];
  /** Candidats franchise (suggestions auto), hors cadenas. */
  candidateAnimes: Anime[];
  /** Catalogue complet pour la recherche manuelle (hors cadenas). */
  libraryAnimes: Anime[];
  /** Fiches masquées car déjà validées (cadenas). */
  lockedExcludedCount: number;
}

/**
 * @description Télécharge le HTML d'une fiche ADKami (Tauri).
 */
export async function fetchAdkamiAnimePageHtml(pageUrl: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error(
      "Le scrap de fiche ADKami nécessite l'application native.",
    );
  }
  try {
    return await invoke<string>("fetch_adkami_anime_page_html", {
      url: pageUrl,
    });
  } catch (error) {
    throw new Error(
      resolveErrorMessage(error, "Impossible de télécharger la fiche ADKami."),
    );
  }
}

/**
 * @description Construit l'URL fiche depuis un ID / URL saisi.
 */
export function resolveAdkamiAnimePageUrl(raw: string): string {
  const trimmed = raw.trim();
  const parsed = parseAdkamiUrl(trimmed);
  if (parsed) {
    return buildAdkamiAnimeUrl(parsed.adkamiId, parsed.section);
  }
  throw new Error("Saisissez un ID ADKami ou une URL de fiche valide.");
}

/**
 * @description Scrap + analyse + suggestions d'attribution (sans écriture BDD).
 */
export async function buildAdkamiSeasonMapDraft(
  rawIdOrUrl: string,
  options?: {
    audioPreference?: AdkamiAudioPreference;
    seedAnimeId?: string | null;
  },
): Promise<AdkamiSeasonMapDraft> {
  const audioPreference =
    options?.audioPreference ?? getAdkamiAudioPreference();
  const pageUrl = resolveAdkamiAnimePageUrl(rawIdOrUrl);
  const html = await fetchAdkamiAnimePageHtml(pageUrl);
  const parsed = parseAdkamiEpisodePageHtml(html, audioPreference);
  if (parsed.adkamiId == null) {
    throw new Error("Aucun épisode ADKami détecté sur cette fiche.");
  }

  const unknown = recordUnknownAdkamiContentTypes(parsed.unknownContentTypes);
  const units = analyzeAdkamiContentUnits(parsed.links);
  if (units.length === 0) {
    throw new Error(
      "Aucun contenu mappable (épisodes / OAV / films / spéciaux) pour cet audio.",
    );
  }

  const animes = await fetchAllAnimesMapped();
  const seed =
    (options?.seedAnimeId
      ? animes.find((a) => a.id === options.seedAnimeId)
      : null) ??
    animes.find((a) => a.adkami_id === parsed.adkamiId) ??
    null;

  const franchise = seed
    ? collectFranchiseAnimes(seed, animes)
    : animes.filter((a) => a.adkami_id === parsed.adkamiId);

  const rawPool =
    franchise.length > 0
      ? franchise
      : animes.slice().sort((a, b) =>
          resolveAnimeDisplayTitle(a).localeCompare(
            resolveAnimeDisplayTitle(b),
            "fr",
          ),
        );

  const { candidates, lockedExcludedCount } = filterUnlockedCandidates(rawPool);
  const { candidates: libraryAnimes, lockedExcludedCount: libraryLocked } =
    filterUnlockedCandidates(animes);

  const orderedForSeasons = orderAnimesForSeasons(candidates);
  const maxSeason = Math.max(...units.map((u) => u.seasonIndex));

  // Attribution séquentielle : une fiche consommée ne peut plus être
  // réutilisée (évite S3 ADKami → S2 Partie 2 MAL). Les restes de
  // scission auto sont immédiatement ré-attribués.
  const usedAnimeIds = new Set<string>();
  const queue: AdkamiSeasonMapUnit[] = units.map((unit) => ({
    ...unit,
    suggestedAnimeId: null,
    selectedAnimeId: null,
    markActive: unit.contentType === 1 && unit.seasonIndex === maxSeason,
  }));
  const fittedUnits: AdkamiSeasonMapUnit[] = [];

  while (queue.length > 0) {
    const unit = queue.shift()!;
    const suggested = suggestAnimeForUnit(
      unit,
      orderedForSeasons,
      seed,
      usedAnimeIds,
    );
    const withSelection: AdkamiSeasonMapUnit = {
      ...unit,
      suggestedAnimeId: suggested?.id ?? null,
      selectedAnimeId: suggested?.id ?? null,
    };
    if (suggested) {
      usedAnimeIds.add(suggested.id);
    }

    const beforeFit = [withSelection];
    const afterFit = suggested
      ? assignAnimeToUnitWithRangeFit(beforeFit, withSelection.unitKey, suggested)
      : beforeFit;

    const head = afterFit[0]!;
    fittedUnits.push(head);
    for (let r = 1; r < afterFit.length; r += 1) {
      queue.unshift(afterFit[r]!);
    }
  }

  // Digressions / spéciaux : proposer la fiche qui couvre déjà le n° (18.5 → Part 2).
  const withExtras = fittedUnits.map((unit) => {
    if (unit.groupId !== "extras" || unit.selectedAnimeId) return unit;
    const cover = fittedUnits.find(
      (u) =>
        u.groupId === "episodes" &&
        Boolean(u.selectedAnimeId) &&
        u.episodeFrom > 0 &&
        unit.episodeFrom > 0 &&
        unit.episodeFrom >= u.episodeFrom &&
        unit.episodeFrom <= u.episodeTo,
    );
    const sameSeason =
      cover ??
      fittedUnits.find(
        (u) =>
          u.groupId === "episodes" &&
          u.seasonIndex === unit.seasonIndex &&
          Boolean(u.selectedAnimeId),
      );
    if (!sameSeason?.selectedAnimeId) return unit;
    return {
      ...unit,
      suggestedAnimeId: sameSeason.selectedAnimeId,
      selectedAnimeId: sameSeason.selectedAnimeId,
    };
  });

  return {
    adkamiId: parsed.adkamiId,
    section: parsed.section,
    audioPreference,
    numberingMode: units[0]?.numberingMode ?? "single",
    units: withExtras,
    unknownContentTypes: unknown.filter((u) =>
      parsed.unknownContentTypes.some((p) => p.code === u.code),
    ),
    candidateAnimes: candidates,
    libraryAnimes,
    lockedExcludedCount: Math.max(lockedExcludedCount, libraryLocked),
  };
}

/**
 * @description Total MAL réel pour calage de plage (ignore le défaut catalogue 12).
 */
export function malEpisodeCountForRangeFit(anime: Anime): number | null {
  const n = Number(anime.episodes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return normalizeEpisodeCount(n);
}

/**
 * @description Longueur d'une plage ADKami (supporte les demi-épisodes).
 */
export function adkamiRangeLength(from: number, to: number): number {
  if (from === 0 && to === 0) return 1;
  if (from > to) return 0;
  return normalizeEpisodeCount(to - from + 1);
}

/**
 * @description Épisode ADKami suivant après `episode` (entiers, .5, .9…).
 */
export function nextAdkamiEpisodeAfter(episode: number): number {
  const n = normalizeEpisodeCount(episode);
  if (!Number.isInteger(n)) {
    return Math.ceil(n);
  }
  return n + 1;
}

/**
 * @description Met à jour from/to et recalcule le compteur d'épisodes.
 */
export function withAdkamiRange(
  unit: AdkamiSeasonMapUnit,
  episodeFrom: number,
  episodeTo: number,
): AdkamiSeasonMapUnit {
  const from = normalizeEpisodeCount(episodeFrom);
  const to = normalizeEpisodeCount(episodeTo);
  return {
    ...unit,
    episodeFrom: from,
    episodeTo: to,
    episodeCount: adkamiRangeLength(from, to),
  };
}

/**
 * @description Indique si le bloc peut être scindé (plage ≥ 2 épisodes).
 */
export function canSplitAdkamiSeasonMapUnit(unit: AdkamiSeasonMapUnit): boolean {
  if (unit.groupId === "films") return false;
  if (unit.episodeFrom === 0 && unit.episodeTo === 0) return false;
  return adkamiRangeLength(unit.episodeFrom, unit.episodeTo) >= 2;
}

/**
 * @description Scinde un bloc en deux moitiés (ex. S1 ADKami → Partie 1 / Partie 2 MAL).
 */
export function splitAdkamiSeasonMapUnit(
  units: AdkamiSeasonMapUnit[],
  unitKey: string,
): AdkamiSeasonMapUnit[] {
  const idx = units.findIndex((u) => u.unitKey === unitKey);
  if (idx < 0) return units;
  const unit = units[idx]!;
  if (!canSplitAdkamiSeasonMapUnit(unit)) return units;

  const length = adkamiRangeLength(unit.episodeFrom, unit.episodeTo);
  const firstLen = Math.ceil(length / 2);
  const firstTo = normalizeEpisodeCount(unit.episodeFrom + firstLen - 1);
  const secondFrom = nextAdkamiEpisodeAfter(firstTo);
  if (secondFrom > unit.episodeTo) return units;

  const baseKey = unit.unitKey.replace(/#part-[^#]+$/g, "");
  const first = withAdkamiRange(
    {
      ...unit,
      unitKey: `${baseKey}#part-${createPartId()}`,
      selectedAnimeId: unit.selectedAnimeId,
      markActive: unit.markActive,
    },
    unit.episodeFrom,
    firstTo,
  );
  const second = withAdkamiRange(
    {
      ...unit,
      unitKey: `${baseKey}#part-${createPartId()}`,
      selectedAnimeId: null,
      suggestedAnimeId: null,
      markActive: false,
      detailLabel: unit.detailLabel
        ? `${unit.detailLabel} (partie 2)`
        : `Partie 2 · S${unit.seasonIndex}`,
    },
    secondFrom,
    unit.episodeTo,
  );

  const next = [...units];
  next.splice(idx, 1, first, second);
  return next;
}

/**
 * @description Retire une ligne issue d'une scission (`#part-`) ou d'une saison future.
 */
export function removeAdkamiSeasonMapUnit(
  units: AdkamiSeasonMapUnit[],
  unitKey: string,
): AdkamiSeasonMapUnit[] {
  const removable =
    unitKey.includes("#part-") || unitKey.startsWith("future-");
  if (!removable) return units;
  if (units.length <= 1) return units;
  return units.filter((u) => u.unitKey !== unitKey);
}

/**
 * @description Attribue une fiche MAL et aligne la plage :
 * - trop longue → coupe + ligne « reste » ;
 * - trop courte → étend et absorbe les suites libres de la même saison.
 */
export function assignAnimeToUnitWithRangeFit(
  units: AdkamiSeasonMapUnit[],
  unitKey: string,
  anime: Anime | null,
): AdkamiSeasonMapUnit[] {
  const idx = units.findIndex((u) => u.unitKey === unitKey);
  if (idx < 0) return units;
  const unit = units[idx]!;

  if (!anime) {
    return units.map((u) =>
      u.unitKey === unitKey ? { ...u, selectedAnimeId: null } : u,
    );
  }

  let fitted: AdkamiSeasonMapUnit = { ...unit, selectedAnimeId: anime.id };
  const malEps = malEpisodeCountForRangeFit(anime);
  const canFit =
    malEps != null &&
    malEps > 0 &&
    unit.episodeFrom > 0 &&
    (unit.groupId === "episodes" || unit.groupId === "oav");

  if (!canFit) {
    return units.map((u) => (u.unitKey === unitKey ? fitted : u));
  }

  const currentLen = adkamiRangeLength(unit.episodeFrom, unit.episodeTo);
  const targetTo = normalizeEpisodeCount(unit.episodeFrom + malEps - 1);

  // Plage trop longue : scinder le surplus.
  if (currentLen > malEps) {
    const remFrom = nextAdkamiEpisodeAfter(targetTo);
    fitted = withAdkamiRange(fitted, unit.episodeFrom, targetTo);

    if (remFrom <= unit.episodeTo) {
      const baseKey = unit.unitKey.replace(/#part-[^#]+$/g, "");
      const remainder = withAdkamiRange(
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
        remFrom,
        unit.episodeTo,
      );
      const next = [...units];
      next.splice(idx, 1, fitted, remainder);
      return next;
    }

    return units.map((u) => (u.unitKey === unitKey ? fitted : u));
  }

  // Plage trop courte : étendre + absorber les suites libres contiguës.
  if (currentLen < malEps) {
    let absorbTo = unit.episodeTo;
    const removeKeys = new Set<string>();

    for (let j = idx + 1; j < units.length; j += 1) {
      const other = units[j]!;
      if (
        other.seasonIndex !== unit.seasonIndex ||
        other.contentType !== unit.contentType ||
        other.groupId !== unit.groupId
      ) {
        break;
      }
      if (other.selectedAnimeId && other.selectedAnimeId !== anime.id) {
        break;
      }
      const expectedFrom = nextAdkamiEpisodeAfter(absorbTo);
      if (Math.abs(other.episodeFrom - expectedFrom) > 0.05) {
        break;
      }
      absorbTo = other.episodeTo;
      removeKeys.add(other.unitKey);
      if (adkamiRangeLength(unit.episodeFrom, absorbTo) >= malEps) {
        break;
      }
    }

    const finalTo =
      removeKeys.size > 0
        ? normalizeEpisodeCount(Math.min(targetTo, absorbTo))
        : targetTo;

    fitted = withAdkamiRange(fitted, unit.episodeFrom, finalTo);
    return units
      .filter((u) => !removeKeys.has(u.unitKey))
      .map((u) => (u.unitKey === unitKey ? fitted : u));
  }

  return units.map((u) => (u.unitKey === unitKey ? fitted : u));
}

/**
 * @description Erreurs bloquantes avant sauvegarde (plages / doublons fiche).
 * Seules les saisons « Épisodes » (TV/ONA) exigent une fiche MAL.
 * OAV, films, digressions / spéciaux peuvent rester sans fiche (absents de MAL).
 */
export function validateAdkamiSeasonMapDraft(
  draft: AdkamiSeasonMapDraft,
): string | null {
  /** IDs des lignes qui écrivent une plage en BDD (pas les extras sans fiche). */
  const rangeOwnerIds: string[] = [];

  for (const unit of draft.units) {
    if (unit.episodeFrom > unit.episodeTo) {
      return `S${unit.seasonIndex} · ${unit.contentLabel} : « De » (${unit.episodeFrom}) est supérieur à « À » (${unit.episodeTo}).`;
    }
    if (!unit.selectedAnimeId) {
      // Hors saisons principales : ADKami peut avoir un contenu sans fiche MAL.
      if (unit.groupId !== "episodes") continue;
      return "Attribuez une fiche MAL à chaque saison d'épisodes avant de valider. OAV, films et spéciaux peuvent rester vides.";
    }
    if (unit.groupId === "extras") continue;
    rangeOwnerIds.push(unit.selectedAnimeId);
  }

  if (new Set(rangeOwnerIds).size !== rangeOwnerIds.length) {
    return "Une même fiche MAL ne peut pas porter plusieurs plages d'épisodes / OAV / films. Les digressions peuvent en revanche partager une fiche.";
  }
  return null;
}

/**
 * @description Avertissements non bloquants (écart MAL, chevauchements, contenus ignorés).
 */
export function collectAdkamiSeasonMapWarnings(
  draft: AdkamiSeasonMapDraft,
): string[] {
  const warnings: string[] = [];
  const byId = new Map(
    [...draft.candidateAnimes, ...draft.libraryAnimes].map((a) => [a.id, a]),
  );

  const skippedSide = draft.units.filter(
    (u) => u.groupId !== "episodes" && !u.selectedAnimeId,
  );
  if (skippedSide.length > 0) {
    const labels = skippedSide
      .slice(0, 4)
      .map((u) => `${u.contentLabel} S${u.seasonIndex}`)
      .join(", ");
    const more =
      skippedSide.length > 4 ? ` (+${skippedSide.length - 4})` : "";
    warnings.push(
      `${skippedSide.length} contenu(s) sans fiche MAL (ignoré(s) à la sauvegarde) : ${labels}${more}.`,
    );
  }

  for (const unit of draft.units) {
    if (!unit.selectedAnimeId || unit.episodeFrom <= 0) continue;
    if (unit.groupId !== "episodes" && unit.groupId !== "oav") continue;
    const anime = byId.get(unit.selectedAnimeId);
    if (!anime) continue;
    const malEps = malEpisodeCountForRangeFit(anime);
    if (malEps == null) continue;
    const len = adkamiRangeLength(unit.episodeFrom, unit.episodeTo);
    if (Math.abs(len - malEps) > 0.01) {
      warnings.push(
        `S${unit.seasonIndex} · ${resolveAnimeDisplayTitle(anime)} : plage ${unit.episodeFrom}–${unit.episodeTo} (${len} ép.) ≠ ${malEps} ép. MAL.`,
      );
    }
  }

  for (let i = 0; i < draft.units.length; i += 1) {
    const a = draft.units[i]!;
    if (a.episodeFrom <= 0) continue;
    for (let j = i + 1; j < draft.units.length; j += 1) {
      const b = draft.units[j]!;
      if (b.episodeFrom <= 0) continue;
      if (a.seasonIndex !== b.seasonIndex || a.contentType !== b.contentType) {
        continue;
      }
      // Digressions (24.5 / 24.9) ≠ plages d'épisodes TV.
      if (a.groupId !== b.groupId) continue;
      if (
        a.episodeFrom <= b.episodeTo &&
        b.episodeFrom <= a.episodeTo
      ) {
        warnings.push(
          `Chevauchement S${a.seasonIndex} · ${a.contentLabel} : ${a.episodeFrom}–${a.episodeTo} et ${b.episodeFrom}–${b.episodeTo}.`,
        );
      }
    }
  }

  return warnings;
}

function createPartId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * @description Applique les attributions validées sur les fiches animé.
 * Pose toujours `adkami_id` (même s'il manquait sur la fiche).
 */
export async function applyAdkamiSeasonMapDraft(
  draft: AdkamiSeasonMapDraft,
): Promise<{ updated: number }> {
  const hardError = validateAdkamiSeasonMapDraft(draft);
  if (hardError) {
    throw new Error(hardError);
  }

  const supabase = getSupabaseClient();
  let updated = 0;

  const selectedIds = draft.units
    .map((u) => u.selectedAnimeId)
    .filter((id): id is string => Boolean(id));

  for (const unit of draft.units) {
    if (!unit.selectedAnimeId) continue;

    // Digressions : ne jamais écraser une plage TV. Pose seulement l'ID
    // si aucune autre ligne « plage » ne cible déjà cette fiche.
    if (unit.groupId === "extras") {
      const hasRangeOwner = draft.units.some(
        (u) =>
          u.selectedAnimeId === unit.selectedAnimeId &&
          u.groupId !== "extras",
      );
      if (hasRangeOwner) continue;

      const { error } = await supabase
        .from("animes")
        .update({
          adkami_id: draft.adkamiId,
          adkami_section: draft.section,
          adkami_mapping_validated: true,
        })
        .eq("id", unit.selectedAnimeId);
      if (error) {
        throw new Error(
          `Liaison digression « ${unit.contentLabel} » : ${error.message}`,
        );
      }
      updated += 1;
      continue;
    }

    const from =
      unit.episodeFrom > 0 ? unit.episodeFrom : null;
    const to = unit.episodeTo > 0 ? unit.episodeTo : null;
    const offset =
      from != null && from > 0 ? Math.max(0, from - 1) : 0;

    // adkami_id toujours écrit : lie la fiche même si l'ID manquait.
    const { error } = await supabase
      .from("animes")
      .update({
        adkami_id: draft.adkamiId,
        adkami_section: draft.section,
        adkami_season_index: unit.seasonIndex,
        adkami_episode_from: from,
        adkami_episode_to: to,
        adkami_episode_offset: offset,
        adkami_season_active: Boolean(unit.markActive),
        adkami_mapping_validated: true,
      })
      .eq("id", unit.selectedAnimeId);

    if (error) {
      throw new Error(
        `Attribution « ${unit.contentLabel} S${unit.seasonIndex} » : ${error.message}`,
      );
    }
    updated += 1;
  }

  // Une seule saison active par adkami_id : désactive les autres.
  const activeUnit = draft.units.find(
    (u) => u.markActive && u.selectedAnimeId,
  );
  if (activeUnit?.selectedAnimeId) {
    const { error } = await supabase
      .from("animes")
      .update({ adkami_season_active: false })
      .eq("adkami_id", draft.adkamiId)
      .eq("adkami_season_active", true)
      .neq("id", activeUnit.selectedAnimeId);
    if (error) {
      throw new Error(
        `Impossible de désactiver les autres saisons actives : ${error.message}`,
      );
    }
  } else if (selectedIds.length > 0) {
    const { error } = await supabase
      .from("animes")
      .update({ adkami_season_active: false })
      .eq("adkami_id", draft.adkamiId)
      .eq("adkami_season_active", true);
    if (error) {
      throw new Error(
        `Impossible de réinitialiser les saisons actives : ${error.message}`,
      );
    }
  }

  requestSupabaseDataReload();
  return { updated };
}

/**
 * @description Indique si la fiche est verrouillée (cadenas) et donc hors proposition.
 */
export function isAnimeMappingValidated(anime: Anime): boolean {
  return Boolean(anime.adkami_mapping_validated);
}

/**
 * @description Indique si la fiche est verrouillée sur une autre page ADKami.
 */
export function isAnimeLockedToOtherAdkamiPage(
  anime: Anime,
  draftAdkamiId: number,
): boolean {
  if (!anime.adkami_mapping_validated) return false;
  if (anime.adkami_id == null) return false;
  return Number(anime.adkami_id) !== Number(draftAdkamiId);
}

/**
 * @description Retire les fiches déjà validées (cadenas) des listes de proposition.
 */
function filterUnlockedCandidates(
  pool: Anime[],
): { candidates: Anime[]; lockedExcludedCount: number } {
  let lockedExcludedCount = 0;
  const candidates = pool.filter((anime) => {
    if (isAnimeMappingValidated(anime)) {
      lockedExcludedCount += 1;
      return false;
    }
    return true;
  });
  return { candidates, lockedExcludedCount };
}

/**
 * @description Efface toutes les attributions préremplies du brouillon.
 */
export function clearAdkamiSeasonMapSelections(
  draft: AdkamiSeasonMapDraft,
): AdkamiSeasonMapDraft {
  return {
    ...draft,
    units: draft.units.map((unit) => ({
      ...unit,
      selectedAnimeId: null,
      suggestedAnimeId: null,
      markActive: false,
    })),
  };
}

/**
 * @description Ajoute un bloc « saison future » (absente d’ADKami, déjà sur MAL).
 */
export function appendFutureAdkamiSeasonUnit(
  draft: AdkamiSeasonMapDraft,
): AdkamiSeasonMapDraft {
  const episodeUnits = draft.units.filter((u) => u.groupId === "episodes");
  const maxSeason =
    episodeUnits.length > 0
      ? Math.max(...episodeUnits.map((u) => u.seasonIndex))
      : 0;
  const nextSeason = maxSeason + 1;
  const unit: AdkamiSeasonMapUnit = {
    unitKey: `future-s${nextSeason}#${createPartId()}`,
    seasonIndex: nextSeason,
    contentType: 1,
    contentLabel: "Saison future",
    detailLabel: "Pas encore sur ADKami · attribution anticipée",
    episodeFrom: 1,
    episodeTo: 12,
    episodeCount: 12,
    sampleUrl: "",
    numberingMode: draft.numberingMode,
    groupId: "episodes",
    suggestedAnimeId: null,
    selectedAnimeId: null,
    markActive: false,
  };
  return {
    ...draft,
    units: [...draft.units, unit],
  };
}

async function fetchAllAnimesMapped(): Promise<Anime[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("animes").select("*");
  if (error) {
    throw new Error(`Catalogue animé : ${error.message}`);
  }
  return ((data ?? []) as Parameters<typeof mapAnimeRow>[0][]).map(mapAnimeRow);
}

/**
 * @description Collecte la franchise locale via relations anime (BFS).
 */
function collectFranchiseAnimes(seed: Anime, all: Anime[]): Anime[] {
  const byMalId = new Map(all.map((a) => [a.mal_id, a]));
  const result = new Map<string, Anime>();
  const queue: Anime[] = [seed];
  result.set(seed.id, seed);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const rel of current.related ?? []) {
      if (String(rel.type).toLowerCase() !== "anime") continue;
      const linked = byMalId.get(Number(rel.malId));
      if (!linked || result.has(linked.id)) continue;
      result.set(linked.id, linked);
      queue.push(linked);
    }
    // Relations inverses : autres fiches qui pointent vers current
    for (const other of all) {
      if (result.has(other.id)) continue;
      const pointsHere = (other.related ?? []).some(
        (rel) =>
          String(rel.type).toLowerCase() === "anime" &&
          Number(rel.malId) === current.mal_id,
      );
      if (pointsHere) {
        result.set(other.id, other);
        queue.push(other);
      }
    }
  }

  // Toujours inclure les fiches déjà liées au même adkami_id
  if (seed.adkami_id != null) {
    for (const anime of all) {
      if (anime.adkami_id === seed.adkami_id) {
        result.set(anime.id, anime);
      }
    }
  }

  return Array.from(result.values()).sort((a, b) => {
    const ya = a.year ?? 9999;
    const yb = b.year ?? 9999;
    if (ya !== yb) return ya - yb;
    return resolveAnimeDisplayTitle(a).localeCompare(
      resolveAnimeDisplayTitle(b),
      "fr",
    );
  });
}

function orderAnimesForSeasons(animes: Anime[]): Anime[] {
  const tvLike = animes.filter((a) => {
    const m = (a.media_type ?? "tv").toLowerCase();
    return m === "tv" || m === "ona" || m === "ova" || m === "special" || !m;
  });
  const rest = animes.filter((a) => !tvLike.includes(a));
  return [...tvLike, ...rest];
}

function suggestAnimeForUnit(
  unit: AdkamiContentUnit,
  ordered: Anime[],
  seed: Anime | null,
  usedIds: Set<string> = new Set(),
): Anime | null {
  if (ordered.length === 0) return null;

  const unused = (list: Anime[]) => list.filter((a) => !usedIds.has(a.id));

  if (unit.contentType === 3) {
    const movies = unused(
      ordered.filter((a) => (a.media_type ?? "").toLowerCase() === "movie"),
    );
    return movies[0] ?? null;
  }

  if (unit.contentType === 2) {
    const ovas = unused(
      ordered.filter((a) => {
        const m = (a.media_type ?? "").toLowerCase();
        const title = resolveAnimeDisplayTitle(a).toLowerCase();
        return m === "ova" || m === "special" || /ova|oav/.test(title);
      }),
    );
    if (ovas.length > 0) {
      return (
        ovas.find((a) => a.adkami_season_index === unit.seasonIndex) ??
        ovas[0]!
      );
    }
  }

  // Digressions / spéciaux (24.5, 24.9…) : attribution manuelle.
  if (unit.groupId === "extras") {
    return null;
  }

  // Épisodes TV : prochaine fiche libre (chrono), hors celles déjà prises.
  const tv = ordered.filter((a) => {
    const m = (a.media_type ?? "tv").toLowerCase();
    return m === "tv" || m === "ona" || !a.media_type;
  });
  const pool = unused(tv.length > 0 ? tv : ordered);
  if (pool.length === 0) return null;

  const byIndex = pool.find((a) => a.adkami_season_index === unit.seasonIndex);
  if (byIndex) return byIndex;

  // Prochaine fiche chronologique libre (pas seasonIndex-1 sur la liste complète).
  return pool[0] ?? seed ?? null;
}
