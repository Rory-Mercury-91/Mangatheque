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

/** Mode du filtre propriétaire dans la bibliothèque. */
export type LibraryOwnerFilterMode = "any" | "physical" | "exclusive";

const LIBRARY_OWNER_FILTER_MODE_SET = new Set<LibraryOwnerFilterMode>([
  "any",
  "physical",
  "exclusive",
]);

/**
 * @description Vérifie qu'une valeur correspond à un mode filtre propriétaire connu.
 */
export function isLibraryOwnerFilterMode(
  value: string,
): value is LibraryOwnerFilterMode {
  return LIBRARY_OWNER_FILTER_MODE_SET.has(value as LibraryOwnerFilterMode);
}

/**
 * @description Passe au mode suivant du filtre propriétaire (présent → seul → neutre).
 */
export function cycleLibraryOwnerFilter(
  current: LibraryOwnerFilterMode | undefined,
): LibraryOwnerFilterMode | undefined {
  if (!current) {
    return "any";
  }
  if (current === "any" || current === "physical") {
    return "exclusive";
  }
  return undefined;
}

/**
 * @description Libellé d'accessibilité du filtre propriétaire selon son mode.
 */
export function getLibraryOwnerFilterLabel(
  ownerLabel: string,
  mode: LibraryOwnerFilterMode | undefined,
): string {
  if (!mode) {
    return `${ownerLabel} — filtre inactif, cliquer pour afficher les séries avec ce compte`;
  }
  if (mode === "any") {
    return `${ownerLabel} — séries où ce compte est présent`;
  }
  if (mode === "physical") {
    return `${ownerLabel} — séries avec achats physiques de ce compte`;
  }
  return `${ownerLabel} — séries dont ce compte est seul propriétaire physique (nom rouge)`;
}

/**
 * @description Indique si au moins un filtre propriétaire est actif.
 */
export function hasActiveOwnerFilters(
  ownerFilterById: LibraryFiltersState["ownerFilterById"],
): boolean {
  return Object.keys(ownerFilterById).length > 0;
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
    return "Mihon — masquer les séries avec Mihon (nom barré en rouge)";
  }
  return "Mihon — filtre inactif, cliquer pour afficher uniquement Mihon";
}

/** Filtres actifs de la bibliothèque. */
export interface LibraryFiltersState {
  search: string;
  sort: LibrarySortKey;
  /** Filtre par propriétaire (identifiant → mode). Absent = neutre. */
  ownerFilterById: Partial<Record<string, LibraryOwnerFilterMode>>;
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

/** @deprecated Utiliser useLibraryPageSize — valeur bureau fenêtre réduite. */
export const LIBRARY_PAGE_SIZE = 25;

export const DEFAULT_LIBRARY_FILTERS: LibraryFiltersState = {
  search: "",
  sort: "created_desc",
  ownerFilterById: {},
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
