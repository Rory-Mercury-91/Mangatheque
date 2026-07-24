import {
  normalizeAnimeAiringStatus,
  normalizeAnimeListStatus,
} from "@/constants/animeStatus";
import type { Anime, AnimeListStatus, UserAnimeProgress } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import type { LibraryFiltersState, LibrarySortKey } from "@/types/libraryFilters";

/**
 * @description Collecte démographies et tags (genres/thèmes) pour les filtres anime.
 */
export function collectAnimeFilterOptions(animes: Anime[]): {
  demographics: string[];
  tags: string[];
} {
  const demos = new Set<string>();
  const tags = new Set<string>();
  for (const anime of animes) {
    for (const d of anime.demographics) demos.add(d);
    for (const g of anime.genres) tags.add(g);
    for (const t of anime.themes) tags.add(t);
  }
  return {
    demographics: Array.from(demos).sort((a, b) => a.localeCompare(b, "fr")),
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b, "fr")),
  };
}

export interface FilterAnimesOptions {
  filters: LibraryFiltersState;
  /** Progressions indexées userId → animeId → progress */
  progressByUserId: Map<string, Map<string, UserAnimeProgress>>;
  /** ownerId → linked userId */
  linkedUserIdByOwnerId: Map<string, string | null>;
  /** Compte connecté (si aucun profil pastille actif). */
  fallbackUserId: string | null;
  /** Favoris : animeId → ownerIds */
  favoritesByAnime?: Map<string, string[]>;
}

/**
 * @description Filtre et trie les animés selon l'état LibraryFilters (variante anime).
 */
export function filterAndSortAnimes(
  animes: Anime[],
  options: FilterAnimesOptions,
): Anime[] {
  const {
    filters,
    progressByUserId,
    linkedUserIdByOwnerId,
    fallbackUserId,
    favoritesByAnime = new Map(),
  } = options;
  const needle = filters.search.trim().toLowerCase();
  const watchStatuses = filters.watchStatuses ?? [];
  const airingStatuses = filters.airingStatuses ?? [];
  const activeOwnerIds = Object.keys(filters.ownerFilterById);

  const progressUserIds: string[] = [];
  if (activeOwnerIds.length > 0) {
    for (const ownerId of activeOwnerIds) {
      const linked = linkedUserIdByOwnerId.get(ownerId);
      if (linked) progressUserIds.push(linked);
    }
  } else if (fallbackUserId) {
    progressUserIds.push(fallbackUserId);
  }

  let list = animes.filter((anime) => {
    if (needle) {
      const hay = [
        anime.title,
        anime.title_fr,
        anime.title_en,
        anime.title_ja,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }

    if (filters.demographics.length > 0) {
      const ok = filters.demographics.some((d) =>
        anime.demographics.includes(d),
      );
      if (!ok) return false;
    }

    if (filters.tags.length > 0) {
      const animeTags = [...anime.genres, ...anime.themes];
      const ok = filters.tags.some((t) => animeTags.includes(t));
      if (!ok) return false;
    }

    if (airingStatuses.length > 0) {
      const airing = normalizeAnimeAiringStatus(anime.status);
      if (!airing || !airingStatuses.includes(airing)) return false;
    }

    if (filters.favoriteOwnerIds.length > 0) {
      const favOwners = favoritesByAnime.get(anime.id) ?? [];
      const ok = filters.favoriteOwnerIds.some((id) => favOwners.includes(id));
      if (!ok) return false;
    }

    // Profil sans visionnage : séries suivies par au moins un profil sélectionné
    if (activeOwnerIds.length > 0 && watchStatuses.length === 0) {
      if (progressUserIds.length === 0) return false;
      const hasAnyProgress = progressUserIds.some((userId) =>
        progressByUserId.get(userId)?.has(anime.id),
      );
      if (!hasAnyProgress) return false;
    }

    if (watchStatuses.length > 0) {
      if (progressUserIds.length === 0) return false;
      const matchesStatus = progressUserIds.some((userId) => {
        const progress = progressByUserId.get(userId)?.get(anime.id);
        const status: AnimeListStatus = progress
          ? normalizeAnimeListStatus(progress.list_status)
          : "plan_to_watch";
        // Sans ligne de progression : seulement si on filtre « À voir »
        if (!progress && status === "plan_to_watch") {
          return watchStatuses.includes("plan_to_watch");
        }
        if (!progress) return false;
        return watchStatuses.includes(status);
      });
      if (!matchesStatus) return false;
    }

    return true;
  });

  const sort = normalizeAnimeSort(filters.sort);
  list = [...list].sort((a, b) => {
    if (sort === "created_desc") {
      return b.created_at.localeCompare(a.created_at);
    }
    if (sort === "created_asc") {
      return a.created_at.localeCompare(b.created_at);
    }
    const ta = resolveAnimeDisplayTitle(a).toLocaleLowerCase("fr");
    const tb = resolveAnimeDisplayTitle(b).toLocaleLowerCase("fr");
    return sort === "title_asc"
      ? ta.localeCompare(tb, "fr")
      : tb.localeCompare(ta, "fr");
  });

  return list;
}

function normalizeAnimeSort(sort: LibrarySortKey): LibrarySortKey {
  if (
    sort === "created_desc" ||
    sort === "created_asc" ||
    sort === "title_asc" ||
    sort === "title_desc"
  ) {
    return sort;
  }
  return "created_desc";
}
