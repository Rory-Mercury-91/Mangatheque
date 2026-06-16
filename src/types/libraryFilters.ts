import type { WorkReadingStatus } from "@/types/database";
import type { UserReadingStatus } from "@/constants/userReadingStatus";

/** Tri disponible dans la bibliothèque. */
export type LibrarySortKey =
  | "created_desc"
  | "created_asc"
  | "price_desc"
  | "price_asc"
  | "title_asc"
  | "title_desc";

/** Options de tri affichées dans la bibliothèque. */
export const LIBRARY_SORT_OPTIONS: Array<{ value: LibrarySortKey; label: string }> = [
  { value: "created_desc", label: "Ajout récent" },
  { value: "created_asc", label: "Ajout ancien" },
  { value: "title_asc", label: "A → Z" },
  { value: "title_desc", label: "Z → A" },
  { value: "price_desc", label: "Prix ↓" },
  { value: "price_asc", label: "Prix ↑" },
];

const LIBRARY_SORT_KEY_SET = new Set<string>(
  LIBRARY_SORT_OPTIONS.map((option) => option.value),
);

/**
 * @description Vérifie qu'une valeur correspond à un tri bibliothèque connu.
 */
export function isLibrarySortKey(value: string): value is LibrarySortKey {
  return LIBRARY_SORT_KEY_SET.has(value);
}

/**
 * @description Libellé français d'un tri bibliothèque.
 */
export function getLibrarySortLabel(sort: LibrarySortKey): string {
  return (
    LIBRARY_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort
  );
}

/** État du filtre Mihon dans la bibliothèque. */
export type LibraryMihonFilter = "all" | "only" | "exclude";

/**
 * @description Passe au mode suivant du filtre Mihon (tout → Mihon → sans Mihon).
 */
export function cycleLibraryMihonFilter(
  current: LibraryMihonFilter,
): LibraryMihonFilter {
  if (current === "all") {
    return "only";
  }
  if (current === "only") {
    return "exclude";
  }
  return "all";
}

/**
 * @description Libellé d'accessibilité du filtre Mihon selon son état.
 */
export function getLibraryMihonFilterLabel(filter: LibraryMihonFilter): string {
  if (filter === "only") {
    return "Mihon — afficher uniquement les séries avec Mihon";
  }
  if (filter === "exclude") {
    return "Mihon — masquer les séries avec Mihon";
  }
  return "Mihon — filtre inactif, cliquer pour afficher uniquement Mihon";
}

/** Filtres actifs de la bibliothèque. */
export interface LibraryFiltersState {
  search: string;
  sort: LibrarySortKey;
  ownerIds: string[];
  mihonFilter: LibraryMihonFilter;
  /** Statut d'édition VF (Nautiljon). */
  readingStatuses: WorkReadingStatus[];
  /** Statut « Ma lecture » (progression personnelle). */
  userReadingStatuses: UserReadingStatus[];
  demographics: string[];
  tags: string[];
  /** Favoris par propriétaire du foyer. */
  favoriteOwnerIds: string[];
}

/** Nombre maximal de séries affichées par page dans la bibliothèque. */
export const LIBRARY_PAGE_SIZE = 25;

export const DEFAULT_LIBRARY_FILTERS: LibraryFiltersState = {
  search: "",
  sort: "created_desc",
  ownerIds: [],
  mihonFilter: "all",
  readingStatuses: [],
  userReadingStatuses: [],
  demographics: [],
  tags: [],
  favoriteOwnerIds: [],
};

/** Métadonnées par œuvre pour filtrage et tri. */
export interface LibraryWorkMeta {
  catalogValue: number;
  ownerIds: string[];
  mihonOwnerIds: string[];
}

/** Statut « Ma lecture » calculé pour le filtrage bibliothèque. */
export interface LibraryUserReadingMeta {
  userReadingStatus: UserReadingStatus;
}
