import { getSupabaseClient } from "@/lib/supabaseClient";
import { mapAnimeRow } from "@/services/animeService";
import type { Anime } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import type { AdkamiContentUnit } from "@/utils/adkamiEpisodePageParser";

/**
 * @description Charge le catalogue animé local (fiches mappées).
 * @returns Toutes les fiches animé de la bibliothèque.
 * @throws Si la lecture Supabase échoue.
 */
export async function fetchAllAnimesMapped(): Promise<Anime[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("animes").select("*");
  if (error) {
    throw new Error(`Catalogue animé : ${error.message}`);
  }
  return ((data ?? []) as Parameters<typeof mapAnimeRow>[0][]).map(mapAnimeRow);
}

/**
 * @description Collecte la franchise locale via relations anime (BFS).
 * @param seed - Fiche de départ.
 * @param all - Catalogue complet.
 * @returns Fiches liées, y compris celles déjà sur le même ID ADKami.
 */
export function collectFranchiseAnimes(seed: Anime, all: Anime[]): Anime[] {
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

/**
 * @description Ordonne les fiches pour l'attribution séquentielle (TV d'abord).
 * @param animes - Candidats encore libres.
 * @returns Liste ordonnée.
 */
export function orderAnimesForSeasons(animes: Anime[]): Anime[] {
  const tvLike = animes.filter((a) => {
    const m = (a.media_type ?? "tv").toLowerCase();
    return m === "tv" || m === "ona" || m === "ova" || m === "special" || !m;
  });
  const rest = animes.filter((a) => !tvLike.includes(a));
  return [...tvLike, ...rest];
}

/**
 * @description Propose une fiche libre pour un bloc encore vide.
 * Les fiches déjà verrouillées ne sont pas dans `ordered` : elles sont
 * reprises à part depuis le mapping enregistré du même ID ADKami.
 * @param unit - Bloc ADKami à pourvoir.
 * @param ordered - Candidats non verrouillés.
 * @param seed - Fiche de départ, repli éventuel.
 * @param usedIds - Fiches déjà attribuées dans ce brouillon.
 * @returns La fiche suggérée, ou `null`.
 */
export function suggestAnimeForUnit(
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

  if (unit.groupId === "extras") {
    return null;
  }

  const tv = ordered.filter((a) => {
    const m = (a.media_type ?? "tv").toLowerCase();
    return m === "tv" || m === "ona" || !a.media_type;
  });
  const pool = unused(tv.length > 0 ? tv : ordered);
  if (pool.length === 0) return null;

  const byIndex = pool.find((a) => a.adkami_season_index === unit.seasonIndex);
  if (byIndex) return byIndex;

  return pool[0] ?? seed ?? null;
}
